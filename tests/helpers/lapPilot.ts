import { DEFAULT_SAVE, type CarId, type InputState, type TrackId } from '../../src/shared/types';
import { createSnapshot, Simulation } from '../../src/game/core/Simulation';
import { clamp } from '../../src/game/vehicle/VehiclePhysics';

export function driveLap(track: TrackId, car: CarId, options: { replay?: InputState[]; includeDrift?: boolean } = {}) {
  const simulation = new Simulation(createSnapshot({ ...DEFAULT_SAVE, track, car }));
  const { path, state } = simulation;

  for (let step = 0; step < 60 * 150 && !state.lap.finished; step++) {
    const vehicle = state.vehicle;
    const nearest = path.nearest(vehicle.x, vehicle.z);
    const ahead = path.samples[(nearest.index + 10) % path.count]!;
    const desired = Math.atan2(ahead.x - vehicle.x, ahead.z - vehicle.z);
    const error = Math.atan2(Math.sin(desired - vehicle.heading), Math.cos(desired - vehicle.heading));
    const target = 16 - Math.min(6, Math.abs(error) * 7);
    const steer = clamp(error * 2.2, -1, 1);
    // Initiate a short drift once the car has reached speed, then return to the course pilot.
    const sliding = options.includeDrift && step >= 300 && step < 330;
    const input: InputState = sliding ? {
      steer: -.7, throttle: 1, brake: 0, handbrake: true, boost: false,
    } : {
      steer: Math.abs(steer) > .12 ? steer : 0,
      throttle: vehicle.speed < target ? .65 : 0,
      brake: vehicle.speed > target + 2 ? .4 : 0,
      handbrake: false,
      boost: false,
    };
    options.replay?.push(input);
    simulation.step(input, 1 / 60);
  }
  return state;
}
