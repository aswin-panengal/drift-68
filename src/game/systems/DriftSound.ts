import type { VehicleState } from '../../shared/types';
import { clamp } from '../vehicle/VehiclePhysics';

const SAMPLE_RATE = 24000;

interface FrictionProfile {
  gap: readonly [number, number];
  duration: readonly [number, number];
  pitch: readonly [number, number];
  bend: readonly [number, number];
  overtone: number;
  rms: number;
}

const SCRUB: FrictionProfile = {
  gap: [.004, .012], duration: [.008, .024], pitch: [360, 1040],
  bend: [-.32, .15], overtone: .32, rms: .22,
};
const CHIRP: FrictionProfile = {
  gap: [.09, .26], duration: [.018, .053], pitch: [980, 1510],
  bend: [-.4, -.16], overtone: .18, rms: .12,
};

function frictionGrains(samples: Float32Array, profile: FrictionProfile, seed: number): void {
  const vary = ([min, max]: readonly [number, number]) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return min + (max - min) * seed / 0x100000000;
  };

  // Each contact rings briefly, with its own pitch and attack. The grains wrap
  // across the buffer boundary so the same texture continues through the loop.
  for (let start = 0; start < samples.length; start += Math.round(vary(profile.gap) * SAMPLE_RATE)) {
    const count = Math.round(vary(profile.duration) * SAMPLE_RATE);
    const phaseStep = 2 * Math.PI * vary(profile.pitch) / SAMPLE_RATE;
    const bend = vary(profile.bend);
    const strength = vary([.28, 1]);
    const roughness = vary([1.65, 2.45]);
    for (let i = 0; i < count; i++) {
      const fraction = i / count;
      const envelope = Math.min(1, i / 34) * (1 - fraction) ** 2;
      const phase = i * phaseStep * (1 + .5 * bend * fraction);
      const sample = (start + i) % samples.length;
      samples[sample] = samples[sample]! + strength * envelope *
        (Math.sin(phase) + profile.overtone * Math.sin(phase * roughness));
    }
  }

  let energy = 0, peak = 0;
  for (const sample of samples) {
    energy += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  const scale = Math.min(profile.rms / Math.sqrt(energy / samples.length), .9 / peak);
  for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * scale;
}

export function tireSoundMix(vehicle: VehicleState, slip: number, wheelspin: number) {
  const speed = Math.max(0, vehicle.speed);
  const moving = clamp((speed - 4) / 7, 0, 1);
  const locked = moving * (vehicle.handbrake ? .66 : .26 * vehicle.brake);
  const contact = Math.max(slip * moving, locked);
  const scrub = clamp((contact - .08) / .78, 0, 1);
  const chirp = clamp((contact - .56) / .44, 0, 1);
  const powered = Math.min(contact, wheelspin);
  return {
    scrubGain: (.46 + .1 * powered) * scrub,
    chirpGain: .19 * chirp * chirp,
    rate: .8 + .09 * scrub + .06 * powered + .002 * speed - .055 * locked,
    cutoff: 1110 + 1210 * scrub,
  };
}

export class DriftSound {
  private readonly source: AudioBufferSourceNode;
  private readonly splitter: ChannelSplitterNode;
  private readonly tone: BiquadFilterNode;
  private readonly scrub: GainNode;
  private readonly chirp: GainNode;

  constructor(context: AudioContext, output: AudioNode) {
    this.source = context.createBufferSource();
    const buffer = context.createBuffer(2, SAMPLE_RATE * 2.4, SAMPLE_RATE);
    frictionGrains(buffer.getChannelData(0), SCRUB, 321);
    frictionGrains(buffer.getChannelData(1), CHIRP, 3571);
    this.source.buffer = buffer;
    this.source.loop = true;
    this.splitter = context.createChannelSplitter(2);
    this.tone = context.createBiquadFilter();
    this.tone.frequency.value = 1110;
    this.tone.Q.value = .7;
    this.scrub = context.createGain();
    this.chirp = context.createGain();
    this.scrub.gain.value = 0;
    this.chirp.gain.value = 0;
    this.source.connect(this.splitter);
    this.splitter.connect(this.tone, 0).connect(this.scrub).connect(output);
    this.splitter.connect(this.chirp, 1).connect(output);
    this.source.start();
  }

  update(vehicle: VehicleState, slip: number, wheelspin: number, time: number): void {
    const { scrubGain, chirpGain, rate, cutoff } = tireSoundMix(vehicle, slip, wheelspin);
    this.scrub.gain.setTargetAtTime(scrubGain, time, scrubGain > 0 ? .026 : .055);
    this.chirp.gain.setTargetAtTime(chirpGain, time, .024);
    this.source.playbackRate.setTargetAtTime(rate, time, .045);
    this.tone.frequency.setTargetAtTime(cutoff, time, .038);
  }

  reset(time: number): void {
    for (const { gain } of [this.scrub, this.chirp]) {
      gain.cancelScheduledValues(time);
      gain.setValueAtTime(0, time);
    }
  }

  dispose(): void {
    this.source.stop();
    this.source.disconnect();
    this.splitter.disconnect();
    this.tone.disconnect();
    this.scrub.disconnect();
    this.chirp.disconnect();
  }
}
