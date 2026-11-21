import {
  POSE_BYTES, POSE_INTERVAL_MS, RECONNECT_MS, ROOM_ALPHABET, ROOM_CLOSE, ROOM_PATH, ROOM_PROTOCOL,
  encodePose, parseRoomView, readPose, type CarPose, type RoomCommand, type RoomIdentity, type RoomRules, type RoomView,
} from '../../shared/multiplayer';
import type { CarId } from '../../shared/types';

const HEARTBEAT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 7_000;
const INTERPOLATION_MS = 150;
const MAX_EXTRAPOLATION_MS = 100;
const MAX_SAMPLES = 6;
const POSE_TIMEOUT_MS = 5000;
const SERVER_UNAVAILABLE = 'Server busy or unreachable. Multiplayer is unavailable right now. Try Solo mode.';
const closeMessages: Record<number, string> = {
  [ROOM_CLOSE.missing]: 'Room not found. Check the code or create a new room.',
  [ROOM_CLOSE.full]: 'This room is full or the race has already started.',
  [ROOM_CLOSE.expired]: 'This room has closed or expired.',
  [ROOM_CLOSE.exists]: 'That code is already in use. Create a new room.',
  [ROOM_CLOSE.replaced]: 'This room was opened in another view.',
};

export function newRoomIdentity(car: CarId, code?: string): RoomIdentity {
  code ??= Array.from(crypto.getRandomValues(new Uint8Array(8)), n => ROOM_ALPHABET[n % ROOM_ALPHABET.length]).join('');
  return { code, car, token: crypto.randomUUID() };
}

interface Sample extends CarPose { at: number }
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const emptySample = (): Sample => ({ x: 0, z: 0, heading: 0, vx: 0, vz: 0, at: 0 });

export class OpponentPoses {
  private readonly samples: Sample[] = Array.from({ length: MAX_SAMPLES }, emptySample);
  private readonly incoming = emptySample();
  private count = 0;
  private next = 0;

  clear(): void { this.count = 0; }

  push(buffer: ArrayBuffer, at: number): boolean {
    if (!readPose(buffer, this.incoming)) return false;
    const previous = this.get(0);
    if (this.count && (at - previous.at > 350 || Math.hypot(this.incoming.x - previous.x, this.incoming.z - previous.z) > 30)) this.clear();
    this.incoming.at = at;
    Object.assign(this.samples[this.next]!, this.incoming);
    this.next = (this.next + 1) % MAX_SAMPLES;
    this.count = Math.min(this.count + 1, MAX_SAMPLES);
    return true;
  }

  sample(now: number, output: CarPose): boolean {
    if (!this.count) return false;
    const target = now - INTERPOLATION_MS;
    const latest = this.get(0);
    if (target >= latest.at) {
      const dt = Math.min(MAX_EXTRAPOLATION_MS, target - latest.at) / 1000;
      output.x = latest.x + latest.vx * dt;
      output.z = latest.z + latest.vz * dt;
      output.heading = latest.heading;
      output.vx = latest.vx;
      output.vz = latest.vz;
      return true;
    }
    for (let i = 1; i < this.count; i++) {
      const a = this.get(i), b = this.get(i - 1);
      if (target < a.at) continue;
      const t = (target - a.at) / (b.at - a.at);
      const turn = b.heading - a.heading;
      output.x = mix(a.x, b.x, t);
      output.z = mix(a.z, b.z, t);
      output.heading = a.heading + Math.atan2(Math.sin(turn), Math.cos(turn)) * t;
      output.vx = mix(a.vx, b.vx, t);
      output.vz = mix(a.vz, b.vz, t);
      return true;
    }
    const oldest = this.get(this.count - 1);
    output.x = oldest.x;
    output.z = oldest.z;
    output.heading = oldest.heading;
    output.vx = oldest.vx;
    output.vz = oldest.vz;
    return true;
  }

  private get(offset: number): Sample { return this.samples[(this.next + MAX_SAMPLES - 1 - offset) % MAX_SAMPLES]!; }
}

export class RoomClient {
  private socket?: WebSocket;
  private timer?: number;
  private heartbeat?: number;
  private retry?: number;
  private retryUntil = 0;
  private retryDelay = 500;
  private lastReply = 0;
  private lastPose = 0;
  private nextPose = 0;
  private hadRoom = false;
  private readonly packet = new ArrayBuffer(POSE_BYTES);
  readonly poses = new OpponentPoses();
  view?: RoomView;
  connected = false;
  terminal = false;
  notice = 'Connecting…';

  constructor(readonly identity: RoomIdentity, private readonly origin: string, private readonly changed: () => void) {}

  get resumable(): boolean { return this.hadRoom && !this.terminal; }

  open(action: 'create' | 'join' | 'resume', rules?: RoomRules): void {
    const { code, token, car } = this.identity;
    this.hadRoom ||= action === 'resume';
    const details = rules ? `.${rules.track}.${rules.laps}` : '';
    const ws = new WebSocket(`${this.origin}${ROOM_PATH}${code}`, [ROOM_PROTOCOL, `${action}.${token}.${car}${details}`]);
    this.socket = ws;
    ws.binaryType = 'arraybuffer';
    this.timer = window.setTimeout(() => ws.close(4000), CONNECT_TIMEOUT_MS);
    ws.onmessage = event => {
      if (this.socket !== ws) return;
      this.lastReply = performance.now();
      if (event.data instanceof ArrayBuffer) {
        if (this.view?.phase === 'race' && this.view.ready && this.view.peer?.ready &&
            this.poses.push(event.data, this.lastReply)) this.lastPose = this.lastReply;
        return;
      }
      if (typeof event.data !== 'string' || event.data === 'pong') return;
      if (event.data === 'closed') {
        this.dispose(false);
        this.terminal = true;
        this.notice = closeMessages[ROOM_CLOSE.expired]!;
        this.changed();
        return;
      }
      const view = parseRoomView(event.data);
      if (!view) return;
      if (!this.connected) {
        window.clearTimeout(this.timer);
        this.connected = this.hadRoom = true;
        this.retryUntil = 0;
        this.retryDelay = 500;
        this.notice = '';
        this.heartbeat = window.setInterval(() => {
          if (performance.now() - this.lastReply > HEARTBEAT_MS * 3) ws.close(4000);
          else if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, HEARTBEAT_MS);
      }
      if (view.ready && view.peer?.ready && (!this.view?.ready || !this.view.peer?.ready)) this.lastPose = this.lastReply;
      this.view = view;
      this.changed();
    };
    ws.onclose = event => {
      if (this.socket !== ws) return;
      this.dropSocket();
      this.connected = false;
      if (closeMessages[event.code]) {
        this.terminal = true;
        this.notice = closeMessages[event.code]!;
      } else if (this.hadRoom) {
        this.retryUntil ||= performance.now() + RECONNECT_MS;
        this.terminal = performance.now() >= this.retryUntil;
        this.notice = this.terminal ? SERVER_UNAVAILABLE : 'Connection lost. Reconnecting…';
        if (!this.terminal) {
          this.retry = window.setTimeout(() => this.open('resume'), this.retryDelay);
          this.retryDelay = Math.min(4000, this.retryDelay * 2);
        }
      } else {
        this.terminal = true;
        this.notice = SERVER_UNAVAILABLE;
      }
      this.changed();
    };
  }

  command(action: RoomCommand): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(action);
  }

  sendPose(pose: CarPose): void {
    const now = performance.now(), ws = this.socket;
    if (now < this.nextPose || ws?.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1024) return;
    this.nextPose = now + POSE_INTERVAL_MS;
    encodePose(this.packet, pose);
    ws.send(this.packet);
  }

  opponentTimedOut(now: number): boolean { return now - this.lastPose > POSE_TIMEOUT_MS; }

  dispose(leave: boolean): void {
    if (leave) this.command('leave');
    window.clearTimeout(this.retry);
    const ws = this.socket;
    this.dropSocket();
    ws?.close(1000);
    this.connected = false;
    this.poses.clear();
  }

  private dropSocket(): void {
    this.socket = undefined;
    window.clearTimeout(this.timer);
    window.clearInterval(this.heartbeat);
  }
}
