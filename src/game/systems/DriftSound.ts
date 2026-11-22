import type { VehicleState } from '../../shared/types';
import { clamp } from '../vehicle/VehiclePhysics';

function tireFrictionLoop(context: BaseAudioContext): AudioBuffer {
  const sampleRate = 24000;
  const buffer = context.createBuffer(1, sampleRate * 2.4, sampleRate);
  const samples = buffer.getChannelData(0);

  // Two resonances bend and trade strength as the rubber grips and releases.
  // Each modulation completes whole cycles so the loop joins at the same phase.
  for (let i = 0; i < samples.length; i++) {
    const phase = i * (2 * Math.PI / samples.length);
    const lead = 2891 * phase + 74 * Math.sin(2 * phase) + 17 * Math.sin(11 * phase + .8) + 2.2 * Math.sin(43 * phase);
    const flex = 2419 * phase + 46 * Math.sin(3 * phase + 1.8) + 10 * Math.sin(13 * phase + .5);
    const contact = .51 + .17 * Math.sin(5 * phase + 1) + .12 * Math.sin(17 * phase) + .09 * Math.sin(49 * phase);
    const balance = .66 + .14 * Math.sin(7 * phase + Math.sin(3 * phase));
    const squeal = Math.sin(lead) + .22 * Math.sin(2 * lead + .8) + .08 * Math.sin(3 * lead - .65);
    const scrub = Math.sin(flex) + .16 * Math.sin(2 * flex + .9);

    // Short, bright pulses give the slide texture without a continuous noise bed.
    const chatter = Math.max(0, Math.sin(79 * phase + 2 * Math.sin(11 * phase))) ** 3;
    const rasp = Math.sin(6289 * phase + .5 * Math.sin(2 * flex)) + .5 * Math.sin(9143 * phase);
    samples[i] = .76 * (contact * (balance * squeal + (1 - balance) * scrub) + .075 * chatter * rasp);
  }
  return buffer;
}

export function tireSoundMix(vehicle: VehicleState, slip: number, wheelspin: number) {
  const speed = Math.max(0, vehicle.speed);
  const moving = clamp((speed - 4) / 7, 0, 1);
  const locked = moving * (vehicle.handbrake ? .66 : .26 * vehicle.brake);
  const contact = Math.max(slip * moving, locked);
  const scrub = clamp((contact - .08) / .52, 0, 1);
  const squeal = clamp((contact - .24) / .64, 0, 1);
  const powered = Math.min(contact, wheelspin);
  return {
    gain: .15 * scrub + .47 * squeal * squeal + .12 * powered,
    rate: .66 + .28 * squeal + .12 * powered + .0025 * speed - .055 * locked,
    cutoff: 1100 + 3200 * squeal,
  };
}

export class DriftSound {
  private readonly source: AudioBufferSourceNode;
  private readonly tone: BiquadFilterNode;
  private readonly level: GainNode;

  constructor(context: AudioContext, output: AudioNode) {
    this.source = context.createBufferSource();
    this.source.buffer = tireFrictionLoop(context);
    this.source.loop = true;
    this.tone = context.createBiquadFilter();
    this.tone.frequency.value = 1100;
    this.tone.Q.value = .7;
    this.level = context.createGain();
    this.level.gain.value = 0;
    this.source.connect(this.tone).connect(this.level).connect(output);
    this.source.start();
  }

  update(vehicle: VehicleState, slip: number, wheelspin: number, time: number): void {
    const { gain, rate, cutoff } = tireSoundMix(vehicle, slip, wheelspin);
    this.level.gain.setTargetAtTime(gain, time, gain > 0 ? .026 : .055);
    this.source.playbackRate.setTargetAtTime(rate, time, .045);
    this.tone.frequency.setTargetAtTime(cutoff, time, .038);
  }

  reset(time: number): void {
    this.level.gain.cancelScheduledValues(time);
    this.level.gain.setValueAtTime(0, time);
  }

  dispose(): void {
    this.source.stop();
    this.source.disconnect();
    this.tone.disconnect();
    this.level.disconnect();
  }
}
