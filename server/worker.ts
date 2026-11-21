import { DurableObject } from 'cloudflare:workers';
import {
  POSE_BYTES, RECONNECT_MS, ROOM_CLOSE, ROOM_CODE, ROOM_PATH, ROOM_PROTOCOL, ROOM_TOKEN,
  readPose, roomCar, roomLaps, roomTrack, type Phase, type RoomRules, type RoomView, type Slot,
} from '../src/shared/multiplayer';
import type { CarId } from '../src/shared/types';

interface Env { ROOMS: DurableObjectNamespace<RaceRoom> }
interface Player {
  token: string;
  car: CarId;
  ready: boolean;
  reservedUntil?: number;
}
interface Room extends RoomRules {
  phase: Phase;
  players: [Player, Player?];
  winner: Slot | null;
  expiresAt: number;
}
type Hello = { token: string; car: CarId } & (
  { action: 'create'; rules: RoomRules } | { action: 'join' | 'resume' }
);

const LOBBY_MS = 10 * 60_000;
const RACE_MS = 2 * 60 * 60_000;
const RESULTS_MS = 60_000;
const other = (slot: Slot): Slot => slot === 0 ? 1 : 0;

function hello(request: Request): Hello | undefined {
  const header = request.headers.get('Sec-WebSocket-Protocol');
  if (!header || header.length > 128) return;
  const protocols = header.split(',').map(value => value.trim());
  if (protocols.length !== 2 || protocols[0] !== ROOM_PROTOCOL) return;
  const [action, token, car, track, count, ...extra] = protocols[1]!.split('.');
  if (!token || !ROOM_TOKEN.test(token) || !roomCar(car) || extra.length) return;
  const laps = Number(count);
  if (action === 'create' && roomTrack(track) && roomLaps(laps) && count === String(laps)) return { action, token, car, rules: { track, laps } };
  if ((action === 'join' || action === 'resume') && track === undefined) return { action, token, car };
}

function upgrade(client: WebSocket): Response {
  return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': ROOM_PROTOCOL } });
}

function reject(code: number): Response {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.close(code);
  return upgrade(client);
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const { pathname } = new URL(request.url);
    const code = pathname.slice(ROOM_PATH.length);
    if (!pathname.startsWith(ROOM_PATH) || !ROOM_CODE.test(code)) return new Response(null, { status: 404 });
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response(null, { status: 426 });
    if (!hello(request)) return new Response(null, { status: 400 });
    return env.ROOMS.getByName(code).fetch(request);
  },
};

export class RaceRoom extends DurableObject<Env> {
  private room?: Room;
  private readonly poseBudget = new WeakMap<WebSocket, { at: number; tokens: number }>();
  private readonly controlBudget = new WeakMap<WebSocket, { at: number; tokens: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    void ctx.blockConcurrencyWhile(async () => {
      this.room = await ctx.storage.get<Room>('room');
    });
  }

  async fetch(request: Request): Promise<Response> {
    const requestHello = hello(request);
    if (!requestHello) return new Response(null, { status: 400 });
    if (this.room && this.deadline(this.room) <= Date.now()) await this.alarm();

    const { token, car, action } = requestHello;
    let room = this.room;
    let slot: Slot;
    if (action === 'create') {
      if (room) return reject(ROOM_CLOSE.exists);
      slot = 0;
      room = this.room = {
        ...requestHello.rules, phase: 'lobby', players: [{ token, car, ready: false }],
        winner: null, expiresAt: Date.now() + LOBBY_MS,
      };
    } else {
      if (!room) return reject(action === 'resume' ? ROOM_CLOSE.expired : ROOM_CLOSE.missing);
      if (action === 'join') {
        if (room.phase !== 'lobby' || room.players[1] || room.players[0].token === token) return reject(ROOM_CLOSE.full);
        slot = 1;
        room.players[slot] = { token, car, ready: false };
      } else {
        const found = room.players.findIndex(player => player?.token === token && player.car === car);
        if (found !== 0 && found !== 1) return reject(ROOM_CLOSE.expired);
        slot = found;
        const previous = this.socket(slot);
        if ((room.players[slot]!.reservedUntil ?? Infinity) <= Date.now()) return reject(ROOM_CLOSE.expired);
        if (previous) this.close(previous, ROOM_CLOSE.replaced);
        delete room.players[slot]!.reservedUntil;
        this.unready(room);
      }
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [String(slot)]);
    server.serializeAttachment(slot);
    await this.commit(room);
    return upgrade(client);
  }

  async webSocketMessage(ws: WebSocket, payload: string | ArrayBuffer): Promise<void> {
    const slot: unknown = ws.deserializeAttachment();
    const room = this.room;
    if (!room || (slot !== 0 && slot !== 1) || this.socket(slot) !== ws) return;
    if (this.deadline(room) <= Date.now()) {
      await this.alarm();
      return;
    }
    const player = room.players[slot];
    if (!player) return;

    if ((typeof payload === 'string' ? payload.length : payload.byteLength) > POSE_BYTES) {
      this.close(ws, 1009);
      await this.depart(slot, false);
      return;
    }
    const peer = this.socket(other(slot));
    if (typeof payload !== 'string') {
      if (room.phase === 'race' && peer && this.allReady(room) && this.takeToken(this.poseBudget, ws, 4, 80) && readPose(payload)) {
        this.send(peer, payload);
      }
      return;
    }
    if (payload === 'leave') {
      ws.serializeAttachment(null);
      await this.depart(slot, true);
      this.close(ws, 1000);
      return;
    }
    if (!this.takeToken(this.controlBudget, ws, 12, 250)) {
      this.close(ws, 1008);
      await this.depart(slot, false);
      return;
    }
    if (payload === 'start' && slot === 0 && room.phase === 'lobby' && peer) {
      room.phase = 'race';
      room.expiresAt = Date.now() + RACE_MS;
    } else if (payload === 'ready' && room.phase === 'race' && peer && !player.ready) {
      player.ready = true;
    } else if (payload === 'pause' && room.phase === 'race' && player.ready) {
      this.unready(room);
    } else if (payload === 'finish' && room.phase === 'race' && peer && this.allReady(room)) {
      room.phase = 'results';
      room.winner = slot;
      room.expiresAt = Date.now() + RESULTS_MS;
      this.unready(room);
    } else return;
    await this.commit(room);
  }

  async webSocketClose(ws: WebSocket): Promise<void> { await this.disconnected(ws); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.disconnected(ws); }

  private async disconnected(ws: WebSocket): Promise<void> {
    const slot: unknown = ws.deserializeAttachment();
    this.close(ws, 1000);
    if (slot === 0 || slot === 1) await this.depart(slot, false);
  }

  private async depart(slot: Slot, voluntary: boolean): Promise<void> {
    const room = this.room;
    const player = room?.players[slot];
    if (!room || !player) return;
    if (!voluntary) {
      player.reservedUntil = Date.now() + RECONNECT_MS;
      this.unready(room);
      await this.commit(room);
    } else if (slot === 1 && room.phase === 'lobby') {
      room.players.length = 1;
      await this.commit(room);
    } else if (room.phase !== 'results' || !this.socket(other(slot))) {
      await this.clear();
    } else {
      player.reservedUntil = Date.now();
      await this.commit(room);
    }
  }

  async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    const hostExpired = (room.players[0].reservedUntil ?? Infinity) <= now;
    const guestExpired = (room.players[1]?.reservedUntil ?? Infinity) <= now;
    if (room.expiresAt <= now || (room.phase !== 'results' && (hostExpired || (guestExpired && room.phase === 'race')))) {
      await this.clear();
    } else if (guestExpired && room.phase === 'lobby') {
      room.players.length = 1;
      await this.commit(room);
    } else {
      await this.ctx.storage.setAlarm(this.deadline(room));
    }
  }

  private deadline(room: Room): number {
    if (room.phase === 'results') return room.expiresAt;
    return Math.min(room.expiresAt, room.players[0].reservedUntil ?? Infinity, room.players[1]?.reservedUntil ?? Infinity);
  }

  private async clear(): Promise<void> {
    this.room = undefined;
    const sockets = [this.socket(0), this.socket(1)];
    for (const ws of sockets) ws?.serializeAttachment(null);
    await Promise.all([this.ctx.storage.deleteAlarm(), this.ctx.storage.deleteAll()]);
    for (const ws of sockets) {
      if (!ws) continue;
      this.send(ws, 'closed');
      this.close(ws, ROOM_CLOSE.expired);
    }
  }

  private async commit(room: Room): Promise<void> {
    const saved = this.ctx.storage.put('room', room);
    const alarm = this.ctx.storage.setAlarm(this.deadline(room));
    for (const slot of [0, 1] as const) {
      const ws = this.socket(slot);
      if (!ws) continue;
      const peerSlot = other(slot);
      const peer = room.players[peerSlot];
      const view: RoomView = {
        track: room.track, laps: room.laps, phase: room.phase, slot,
        ready: room.players[slot]!.ready, winner: room.winner,
        peer: peer ? { car: peer.car, ready: peer.ready, online: !!this.socket(peerSlot) } : null,
      };
      this.send(ws, JSON.stringify(view));
    }
    await Promise.all([saved, alarm]);
  }

  private socket(slot: Slot): WebSocket | undefined {
    return this.ctx.getWebSockets(String(slot)).find(ws => ws.readyState === WebSocket.OPEN && ws.deserializeAttachment() === slot);
  }

  private send(ws: WebSocket | undefined, payload: string | ArrayBuffer): void {
    try { ws?.send(payload); } catch { /* The close/error handler updates membership. */ }
  }

  private close(ws: WebSocket, code: number): void {
    ws.serializeAttachment(null);
    try { ws.close(code); } catch { /* The connection may already be closed. */ }
  }

  private unready(room: Room): void { for (const player of room.players) if (player) player.ready = false; }
  private allReady(room: Room): boolean { return room.players[0].ready && room.players[1]?.ready === true; }

  private takeToken(budgets: WeakMap<WebSocket, { at: number; tokens: number }>, ws: WebSocket, capacity: number, refillMs: number): boolean {
    const now = Date.now();
    let budget = budgets.get(ws);
    if (!budget) {
      budget = { at: now, tokens: capacity };
      budgets.set(ws, budget);
    }
    budget.tokens = Math.min(capacity, budget.tokens + (now - budget.at) / refillMs);
    budget.at = now;
    if (budget.tokens < 1) return false;
    budget.tokens--;
    return true;
  }
}
