import { Raycaster, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createCar } from '../src/game/rendering/VehicleFactory';
import { ENGINE_PROFILES, EngineSound } from '../src/game/systems/EngineSound';
import { TrackPath, TRACKS } from '../src/game/tracks/TrackConfigs';
import { CARS } from '../src/game/vehicle/CarConfigs';
import { createVehicle } from '../src/game/vehicle/VehiclePhysics';
import { CAR_IDS } from '../src/shared/types';

const path = new TrackPath(TRACKS.coastal);

describe.each(CAR_IDS)('%s', car => {
  it('renders the painted body panels from outside both ends', () => {
    const config = CARS[car];
    const { body, group } = createCar(config);
    group.updateMatrixWorld();
    for (const end of [-1, 1]) {
      // Aim between the bumper and the lights, at exposed body paint.
      const ray = new Raycaster(new Vector3(0, .6, end * 8), new Vector3(0, 0, -end));
      const [panel] = ray.intersectObject(body);
      expect(panel?.point.z).toBeCloseTo(end * config.length / 2);
      expect(panel?.face?.normal.z).toBeCloseTo(end);
    }
  });

  it('flares during a powered slide, hits the limiter near redline and revs through a shift', () => {
    const vehicle = { ...createVehicle(path), speed: 18, throttle: 1 };
    const engine = new EngineSound(ENGINE_PROFILES[car], vehicle.speed);
    const settle = (slip: number) => {
      for (let frame = 0; frame < 60; frame++) engine.step(vehicle, vehicle.throttle, slip, 1 / 60);
    };

    settle(0);
    const straightRpm = engine.rpm;
    expect(engine.wheelspin).toBe(0);
    settle(1);
    expect(engine.wheelspin).toBeGreaterThan(.9);
    expect(engine.rpm).toBeGreaterThan(straightRpm);
    expect(engine.limiting).toBe(false);

    vehicle.handbrake = true;
    settle(1);
    expect(engine.wheelspin).toBeLessThan(.01);
    expect(engine.rpm).toBeCloseTo(straightRpm, 0);

    vehicle.handbrake = false;
    vehicle.speed = 19.5;
    settle(1);
    expect(engine.limiting).toBe(true);
    const gear = engine.gear;
    vehicle.throttle = 0;
    settle(1);
    expect(engine.limiting).toBe(false);
    expect(engine.wheelspin).toBeLessThan(.01);

    vehicle.throttle = 1;
    vehicle.speed = 22;
    settle(1);
    expect(engine.gear).toBe(gear + 1);
    expect(engine.limiting).toBe(false);
    expect(engine.rpm).toBeLessThan(engine.profile.redline * .95);
  });
});
