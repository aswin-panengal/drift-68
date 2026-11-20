import type { InputState } from '../../src/shared/types';
import { driveLap } from './lapPilot';

export function createLapReplay() {
  const track = 'coastal';
  const car = 'rearwind';
  const input: InputState[] = [];
  const { lap, score } = driveLap(track, car, { replay: input, includeDrift: true });
  if (!lap.finished || score.banked < 1) throw new Error('The Coastal replay did not finish with a positive score');
  return { track, car, input, score: Math.floor(score.banked), time: lap.elapsed };
}
