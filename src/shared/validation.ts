import { CAMERA_NAMES, CAR_IDS, TRACK_IDS, DEFAULT_SAVE, type SaveData, type Settings, type Snapshot, type ClientMessage, type RecordEntry } from './types';
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const n = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const one = (v: unknown, values: readonly unknown[]): boolean => values.includes(v);
export function validSettings(v: unknown): v is Settings {
  return object(v) && one(v.quality, ['auto','low','medium','high']) && n(v.volume, 0, 1) && n(v.camera, 0, CAMERA_NAMES.length - 1) && Number.isInteger(v.camera) && ['sound','reducedMotion','minimap','advancedHud','gamepad'].every(k => typeof v[k] === 'boolean');
}
export function validEntry(v: unknown): v is RecordEntry {
  return object(v) && n(v.score,0,1e9) && n(v.time,0,1e7) && n(v.longest,0,1e7) && n(v.multiplier,1,5);
}
export function validSave(v: unknown): v is SaveData {
  if (!object(v) || v.version !== 1 || !validSettings(v.settings) || !one(v.car,CAR_IDS) || !one(v.track,TRACK_IDS) || typeof v.zen !== 'boolean' || !object(v.records)) return false;
  return Object.entries(v.records).length <= 12 && Object.entries(v.records).every(([k,e]) => TRACK_IDS.some(t => CAR_IDS.some(c => k === `${t}:${c}`)) && validEntry(e));
}
export function recoverSave(v: unknown): SaveData {
  return validSave(v) ? structuredClone(v) : structuredClone(DEFAULT_SAVE);
}
export function validSnapshot(s: unknown): s is Snapshot {
  if (!object(s) || s.version !== 1 || !one(s.car,CAR_IDS) || !one(s.track,TRACK_IDS) || typeof s.zen !== 'boolean' || !one(s.screen,['title','garage','circuits','drive','pause','settings','results']) || !validSettings(s.settings)) return false;
  const v = s.vehicle, score = s.score, lap = s.lap;
  return object(v) && ['x','z'].every(k=>n(v[k],-2000,2000)) && ['vx','vz','speed','lateral'].every(k=>n(v[k],-200,200)) && n(v.heading,-1e5,1e5) && n(v.yawRate,-20,20) && n(v.steering,-2,2) && n(v.driftAngle,-Math.PI,Math.PI) && n(v.boost,0,1) && typeof v.handbrake === 'boolean' && n(v.throttle,0,1) && n(v.brake,0,1)
    && object(score) && ['banked','pending'].every(k=>n(score[k],0,1e9)) && n(score.multiplier,1,5) && n(score.bestMultiplier,1,5) && ['grace','driftTime','longest','travel','progress'].every(k=>n(score[k],0,1e7)) && ['anchorX','anchorZ'].every(k=>n(score[k],-2000,2000)) && typeof score.active === 'boolean'
    && object(lap) && n(lap.next,1,12) && Number.isInteger(lap.next) && n(lap.checkpoint,0,11) && Number.isInteger(lap.checkpoint) && n(lap.elapsed,0,1e7) && typeof lap.finished === 'boolean';
}
export function parseClientMessage(v: unknown): ClientMessage | undefined {
  if (!object(v) || typeof v.type !== 'string') return;
  if (['ready','claim','openEditor','openSidebar','maximize','resetRecords'].includes(v.type)) return {type:v.type} as ClientMessage;
  if (v.type === 'initialized' && n(v.token,0,1e9)) return {type:'initialized',token:v.token};
  if ((v.type === 'snapshot' || v.type === 'suspended') && n(v.token,0,1e9) && validSnapshot(v.snapshot)) return {type:v.type,token:v.token,snapshot:v.snapshot};
  if(v.type === 'save' && validSave(v.data)) return {type:'save',data:v.data};
  if(v.type === 'record' && one(v.track,TRACK_IDS) && one(v.car,CAR_IDS) && validEntry(v.entry)) return v as unknown as ClientMessage;
}
