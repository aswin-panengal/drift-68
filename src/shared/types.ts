import type { MultiplayerResume } from './multiplayer';

export const CAR_IDS = ['rearwind', 'ironback', 'streetline', 'solace'] as const;
export const TRACK_IDS = ['coastal', 'alpine', 'autumn'] as const;
export const CAMERA_NAMES = ['Elevated follow', 'Close follow', 'Overhead', 'Rear chase'] as const;
export const REAR_CHASE_CAMERA = 3;
export type CarId = typeof CAR_IDS[number];
export type TrackId = typeof TRACK_IDS[number];
export type DisplayMode = 'sidebar' | 'editor' | 'maximized';
export type Screen = 'title' | 'modes' | 'licenses' | 'garage' | 'circuits' | 'drive' | 'pause' | 'settings' | 'results' | 'lobby';
export const LAP_COUNTS = [1, 3, 5] as const;
export type LapCount = typeof LAP_COUNTS[number];
export interface Vec2 { x: number; z: number }
export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high'; sound: boolean; volume: number;
  camera: number; reducedMotion: boolean; minimap: boolean; advancedHud: boolean; gamepad: boolean;
}
export interface VehicleState extends Vec2 {
  vx: number; vz: number; heading: number; yawRate: number; steering: number;
  speed: number; lateral: number; driftAngle: number; boost: number; handbrake: boolean; throttle: number; brake: number;
}
export interface ScoreState {
  banked: number; pending: number; multiplier: number; grace: number; driftTime: number;
  longest: number; bestMultiplier: number; active: boolean; anchorX: number; anchorZ: number; travel: number; progress:number;
}
export interface LapState {
  next: number; elapsed: number; finished: boolean; checkpoint: number;
  // Version 1 snapshots from before multiplayer omit these counts.
  total?: LapCount; completed?: number;
}
export interface Snapshot {
  version: 1; car: CarId; track: TrackId; zen: boolean; screen: Screen;
  vehicle: VehicleState; score: ScoreState; lap: LapState; settings: Settings;
}
export interface RecordEntry { score: number; time: number; longest: number; multiplier: number }
export type Records = Partial<Record<string, RecordEntry>>;
export interface SaveData { version: 1; settings: Settings; car: CarId; track: TrackId; zen: boolean; records: Records }
export const DEFAULT_SETTINGS: Settings = { quality: 'auto', sound: false, volume: .5, camera: 0, reducedMotion: false, minimap: true, advancedHud: true, gamepad: true };
export const DEFAULT_SAVE: SaveData = { version: 1, settings: { ...DEFAULT_SETTINGS }, car: 'rearwind', track: 'coastal', zen: false, records: {} };
export const recordKey = (track: TrackId, car: CarId): string => `${track}:${car}`;
export interface InputState { throttle: number; brake: number; steer: number; handbrake: boolean; boost: boolean }
export const EMPTY_INPUT: InputState = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false };
export type ClientMessage =
  | { type: 'ready' } | { type: 'claim' } | { type: 'openEditor' } | { type: 'openSidebar' } | { type: 'maximize' } | { type: 'resetRecords' }
  | { type: 'initialized'; token: number }
  | { type: 'snapshot'; token: number; snapshot: Snapshot }
  | { type: 'roomSnapshot'; token: number; room?: MultiplayerResume }
  | { type: 'suspended'; token: number; snapshot: Snapshot }
  | { type: 'save'; data: SaveData }
  | { type: 'record'; track: TrackId; car: CarId; entry: RecordEntry };
export type HostMessage =
  | { type: 'initialize'; token: number; snapshot?: Snapshot; room?: MultiplayerResume; data: SaveData; mode: DisplayMode }
  | { type: 'grant'; token: number }
  | { type: 'suspend'; token: number }
  | { type: 'idle'; data: SaveData }
  | { type: 'visibility'; visible: boolean }
  | { type: 'mode'; mode: DisplayMode }
  | { type: 'data'; data: SaveData }
  | { type: 'error'; message: string };
