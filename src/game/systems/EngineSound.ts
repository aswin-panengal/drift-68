import type { CarId, VehicleState } from '../../shared/types';
import { damp } from '../vehicle/VehiclePhysics';

interface EngineProfile {
  idle: number;
  redline: number;
  pulses: readonly number[];
  decay: number;
  resonance: number;
}

export const ENGINE_PROFILES: Record<CarId, EngineProfile> = {
  rearwind: { idle: 980, redline: 7600, pulses: [1, .82, .96, .72], decay: 5.8, resonance: 228 },
  ironback: { idle: 800, redline: 6600, pulses: [1, .47, .82, .38, .94, .83, .44, .55], decay: 4.4, resonance: 135 },
  streetline: { idle: 1100, redline: 8600, pulses: [1, .88, .91, .95], decay: 7, resonance: 310 },
  solace: { idle: 900, redline: 7100, pulses: [1, .74, .89, .93, .7, .85], decay: 4.8, resonance: 183 },
};

// The driving physics has no gearbox. These ratios map road speed to a fraction
// of the rev range for audio without affecting the car's acceleration or grip.
const GEARS = [.067, .044, .031, .024, .019, .016] as const;

export class EngineSound {
  rpm: number;
  load = 0;
  wheelspin = 0;
  gear = 0;
  shiftTime = 0;
  limiting = false;
  crack = 0;
  private pedal = 0;

  constructor(readonly profile: EngineProfile, speed: number) {
    this.rpm = profile.idle;
    this.gear = GEARS.findIndex(ratio => Math.max(0, speed) * ratio < .85);
    if (this.gear < 0) this.gear = GEARS.length - 1;
    this.rpm += Math.min(.9, Math.abs(speed) * GEARS[this.gear]!) * (profile.redline - profile.idle);
  }

  step(vehicle: VehicleState, pedal: number, slip: number, dt: number): void {
    const { idle, redline } = this.profile;
    const speed = Math.abs(vehicle.speed);
    this.load = damp(this.load, .7 * pedal + .3 * vehicle.throttle, 18, dt);
    const sliding = vehicle.handbrake || slip > .28;
    const drivenSlip = vehicle.handbrake ? 0 : slip * this.load * (1 - vehicle.brake);
    this.wheelspin = damp(this.wheelspin, drivenSlip, 12, dt);
    const throttleFlare = this.load * .075;
    const pedalLift = this.pedal > .55 && pedal < .16;
    this.pedal = pedal;
    this.crack = pedalLift && this.rpm > .59 * redline ? .44 : 0;
    this.shiftTime = Math.max(0, this.shiftTime - dt);

    const roadRevs = speed * GEARS[this.gear]!;
    if (this.shiftTime === 0) {
      // Hold gear through the slide until road speed would call for an upshift by itself.
      const canUpshift = !sliding || (!vehicle.handbrake && roadRevs + throttleFlare >= 1);
      if (canUpshift && vehicle.speed > 0 && this.load > .4 && this.gear < GEARS.length - 1
          && this.revDemand(roadRevs, throttleFlare) >= 1 && this.rpm > redline * .963) {
        this.gear++;
        this.shiftTime = .125;
        this.crack = .71;
      } else if (this.gear > 0 && roadRevs < .39) {
        this.gear--;
        this.shiftTime = .09;
        this.crack = pedal > .2 || vehicle.brake > .2 ? .3 : this.crack;
      }
    }

    const demand = Math.max(this.load * .23, this.revDemand(speed * GEARS[this.gear]!, throttleFlare));
    const target = idle + Math.min(1, demand) * (redline - idle);
    this.rpm = damp(this.rpm, target, this.shiftTime > 0 ? 23 : 11, dt);
    this.limiting = demand >= 1 && this.rpm > redline * .972 && this.load > .52 && this.shiftTime === 0;
  }

  private revDemand(roadRevs: number, throttleFlare: number): number {
    // Wheelspin has less room to flare the revs as road speed approaches redline.
    return roadRevs + throttleFlare + this.wheelspin * .55 * Math.max(0, 1 - roadRevs);
  }
}

export function exhaustCycle(ctx: BaseAudioContext, profile: EngineProfile): AudioBuffer {
  const buffer = ctx.createBuffer(1, 4096, ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  const spacing = samples.length / profile.pulses.length;

  // One loop represents two crank revolutions. Overlap pressure pulses and pipe
  // reflections across the loop boundary so playback can run at any RPM.
  for (const [cylinder, strength] of profile.pulses.entries()) {
    const start = Math.round(cylinder * spacing);
    for (let i = 0; i < 2.5 * spacing; i++) {
      const phase = i / spacing;
      const pressure = (1 - Math.exp(-42 * phase)) * Math.exp(-profile.decay * phase);
      const ringing = .47 * Math.sin(phase * 12.7) * Math.exp(-7.5 * phase);
      const reflection = .32 * Math.sin(phase * 5.5) * Math.exp(-2.9 * phase);
      const sample = (start + i) % samples.length;
      samples[sample] = samples[sample]! + strength * (pressure + ringing + reflection);
    }
  }
  const mean = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
  const peak = samples.reduce((max, sample) => Math.max(max, Math.abs(sample - mean)), 0);
  for (let i = 0; i < samples.length; i++) samples[i] = (samples[i]! - mean) / peak;
  return buffer;
}
