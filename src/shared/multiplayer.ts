import { CAR_IDS, LAP_COUNTS, TRACK_IDS, type CarId, type LapCount, type Snapshot, type TrackId } from './types';

export const ROOM_PROTOCOL = 'drift-break-v1';
export const ROOM_PATH = '/v1/rooms/';
export const ROOM_CODE = /^[A-HJ-NP-Z2-9]{8}$/;
export const ROOM_TOKEN = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export const RECONNECT_MS = 30_000;
export const POSE_INTERVAL_MS = 100;
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CLOSE = { missing: 4404, full: 4409, expired: 4410, exists: 4411, replaced: 4412 } as const;

export type Slot = 0 | 1;
export type Phase = 'lobby' | 'race' | 'results';
export interface RoomRules { track: TrackId; laps: LapCount }
export interface RoomView extends RoomRules {
  phase: Phase;
  slot: Slot;
  ready: boolean;
  peer: { car: CarId; online: boolean; ready: boolean } | null;
  winner: Slot | null;
}
export interface RoomIdentity { code: string; token: string; car: CarId }
export interface MultiplayerResume { identity: RoomIdentity; race?: Snapshot }
export type RoomCommand = 'start' | 'ready' | 'pause' | 'finish' | 'leave';
export interface CarPose { x: number; z: number; heading: number; vx: number; vz: number }
const POSE_FIELDS = ['x', 'z', 'heading', 'vx', 'vz'] as const;
const POSE_LIMITS = [2000, 2000, Math.PI + .001, 200, 200] as const;

export function socketOrigin(value: unknown): string {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'wss:' && !url.username && !url.password && url.pathname === '/' &&
        !url.search && !url.hash && /^[a-z\d.:\[\]-]+$/i.test(url.host)) return url.origin;
  } catch { /* An unconfigured or invalid endpoint disables Multiplayer. */ }
  return '';
}

export function roomCar(value: unknown): value is CarId { return CAR_IDS.some(car => car === value); }
export function roomTrack(value: unknown): value is TrackId { return TRACK_IDS.some(track => track === value); }
export function roomLaps(value: unknown): value is LapCount { return LAP_COUNTS.some(laps => laps === value); }

export function parseRoomView(data: string): RoomView | undefined {
  try {
    const room = JSON.parse(data) as Partial<RoomView> | null;
    if (room && roomTrack(room.track) && roomLaps(room.laps) &&
        (room.phase === 'lobby' || room.phase === 'race' || room.phase === 'results') &&
        (room.slot === 0 || room.slot === 1) && typeof room.ready === 'boolean' &&
        (room.winner === null || room.winner === 0 || room.winner === 1) &&
        (room.peer === null || (room.peer && roomCar(room.peer.car) &&
          typeof room.peer.online === 'boolean' && typeof room.peer.ready === 'boolean'))) return room as RoomView;
  } catch { /* Ignore an invalid control message. */ }
}

export function encodePose(buf: ArrayBuffer, pose: CarPose): void {
  const view = new DataView(buf);
  for (let i = 0; i < POSE_FIELDS.length; i++) {
    const key = POSE_FIELDS[i]!;
    view.setFloat32(i * 4, key === 'heading' ? Math.atan2(Math.sin(pose.heading), Math.cos(pose.heading)) : pose[key], true);
  }
}

export const POSE_BYTES = POSE_FIELDS.length * 4;

export function readPose(buf: ArrayBuffer, pose?: CarPose): boolean {
  if (buf.byteLength !== POSE_BYTES) return false;
  const view = new DataView(buf);
  for (let i = 0; i < POSE_FIELDS.length; i++) {
    const value = view.getFloat32(i * 4, true);
    if (!Number.isFinite(value) || Math.abs(value) > POSE_LIMITS[i]!) return false;
    if (pose) pose[POSE_FIELDS[i]!] = value;
  }
  return true;
}
