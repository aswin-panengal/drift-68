import type { CarId, Settings, VehicleState } from '../../shared/types';
import { clamp } from '../vehicle/VehiclePhysics';
import { DriftSound } from './DriftSound';
import { ENGINE_PROFILES, EngineSound, exhaustCycle } from './EngineSound';

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

function silentGain(ctx: AudioContext): GainNode {
  const node = ctx.createGain();
  node.gain.value = 0;
  return node;
}

function fillNoise(samples: Float32Array, seed: number): void {
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    samples[i] = seed / 0x80000000;
  }
}

function createDrive(ctx: AudioContext, output: AudioNode) {
  const volume = silentGain(ctx);
  volume.connect(output);

  const ignition = ctx.createGain();
  ignition.connect(volume);
  const engineGain = silentGain(ctx);
  const exhaust = filter(ctx, 'lowpass', 750, .68);
  const resonance = filter(ctx, 'peaking', 200, 1.15);
  resonance.gain.value = 4;
  exhaust.connect(resonance).connect(engineGain).connect(ignition);

  const noise = ctx.createBufferSource();
  const air = ctx.createBuffer(1, 16384, ctx.sampleRate);
  fillNoise(air.getChannelData(0), 321);
  noise.buffer = air;
  noise.loop = true;
  const intake = filter(ctx, 'bandpass', 1000, .8);
  const intakeGain = silentGain(ctx);
  noise.connect(intake).connect(intakeGain).connect(ignition);
  noise.start();

  const tires = new DriftSound(ctx, volume);

  const crack = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .052), ctx.sampleRate);
  const samples = crack.getChannelData(0);
  fillNoise(samples, 15827);
  let previous = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / ctx.sampleRate;
    const raw = samples[i]!;
    const noise = .45 * raw - .27 * previous;
    const pressure = .7 * Math.sin(2 * Math.PI * (173 - 1240 * t) * t);
    samples[i] = (1 - Math.exp(-2600 * t)) * (noise * Math.exp(-176 * t) + pressure * Math.exp(-102 * t));
    previous = raw;
  }
  // Two synchronized channels let the audio clock cut ignition and fire the
  // exhaust crack every cycle, even when several physics steps run in one frame.
  const limiter = ctx.createBuffer(2, Math.round(ctx.sampleRate / 14), ctx.sampleRate);
  const cut = limiter.getChannelData(0);
  const bark = limiter.getChannelData(1);
  for (let i = 0; i < cut.length; i++) {
    const t = i / ctx.sampleRate;
    cut[i] = -.79 * clamp(Math.min(t, .032 - t) / .003, 0, 1);
    bark[i] = .66 * (samples[i] ?? 0);
  }
  const limiterMix = ctx.createGain();
  const limiterChannels = ctx.createChannelSplitter(2);
  limiterMix.connect(limiterChannels);
  limiterChannels.connect(ignition.gain, 0);
  limiterChannels.connect(volume, 1);
  const limiterPitch = silentGain(ctx);
  limiterChannels.connect(limiterPitch, 0);
  return {
    volume, ignition, exhaust, resonance, engineGain, noise, intake, intakeGain, tires,
    crack, limiter, limiterMix, limiterPitch,
  };
}

export class AudioManager {
  private context?: AudioContext;
  private output?: DynamicsCompressorNode;
  private drive?: ReturnType<typeof createDrive>;
  private engine?: { car: CarId; source: AudioBufferSourceNode; model?: EngineSound };
  private limiter?: AudioBufferSourceNode;
  private driving = false;
  private readonly cues = new Set<OscillatorNode>();

  private getContext(): AudioContext {
    if (this.context) return this.context;
    const ctx = this.context = new AudioContext();
    const output = this.output = ctx.createDynamicsCompressor();
    output.threshold.value = -7;
    output.knee.value = 5;
    output.ratio.value = 9;
    output.attack.value = .003;
    output.release.value = .10;
    // Leave headroom for brief overlaps in the loudest part of the mix.
    const peakLimiter = ctx.createWaveShaper();
    peakLimiter.curve = Float32Array.from({ length: 257 }, (_, i) => {
      const sample = (i - 128) / 128;
      const excess = Math.max(0, Math.abs(sample) - .84);
      return sample - Math.sign(sample) * excess * (1 - 1 / (1 + 5 * excess));
    });
    output.connect(peakLimiter).connect(ctx.destination);
    return ctx;
  }

  unlock(settings: Settings): void {
    if (!settings.sound || settings.volume === 0) return;
    const ctx = this.getContext();
    this.driving = true;
    void ctx.resume().catch(() => {});
  }

  update(car: CarId, v: VehicleState, pedal: number, slip: number, settings: Settings, dt: number): void {
    const ctx = this.context;
    if (!this.driving || !settings.sound || ctx?.state !== 'running') return;
    const drive = this.drive ??= createDrive(ctx, this.output!);
    const t = ctx.currentTime;

    if (this.engine?.car !== car) {
      this.releaseLimiter();
      if (this.engine) {
        const previous = this.engine.source;
        drive.limiterPitch.disconnect(previous.playbackRate);
        previous.stop();
        previous.disconnect();
      }
      const source = ctx.createBufferSource();
      const profile = ENGINE_PROFILES[car];
      source.buffer = exhaustCycle(ctx, profile);
      source.loop = true;
      source.connect(drive.exhaust);
      source.playbackRate.value = source.buffer.duration * profile.idle / 120;
      drive.limiterPitch.gain.value = source.buffer.duration * profile.redline / 120 * .034;
      drive.limiterPitch.connect(source.playbackRate);
      source.start();
      this.engine = { car, source };
      drive.resonance.frequency.value = profile.resonance;
    }

    const { source } = this.engine;
    const engine = this.engine.model ??= new EngineSound(ENGINE_PROFILES[car], v.speed);
    engine.step(v, pedal, slip, dt);
    const { rpm, load } = engine;
    const revs = rpm / engine.profile.redline;
    drive.ignition.gain.setTargetAtTime(engine.shiftTime > .03 ? .39 : 1, t, .012);
    source.playbackRate.setTargetAtTime(source.buffer!.duration * rpm / 120, t, .014);
    drive.exhaust.frequency.setTargetAtTime(490 + rpm * .07 + load * (460 + rpm * .25), t, .034);
    drive.engineGain.gain.setTargetAtTime(.23 + .13 * revs + .42 * load, t, .012);
    drive.intake.frequency.setTargetAtTime(700 + rpm * .16, t, .05);
    drive.intakeGain.gain.setTargetAtTime(.21 * load * revs, t, .02);

    drive.tires.update(v, slip, engine.wheelspin, t);
    drive.volume.gain.setTargetAtTime(settings.volume * (settings.reducedMotion ? .65 : 1), t, .028);

    // Keep the engine audible through each cut as the limiter and tires overlap.
    drive.limiterMix.gain.setTargetAtTime(1 - .38 * slip, t, .035);
    if (engine.limiting && !this.limiter) {
      const limiter = this.limiter = ctx.createBufferSource();
      limiter.buffer = drive.limiter;
      limiter.loop = true;
      limiter.connect(drive.limiterMix);
      limiter.start();
    } else if (!engine.limiting) {
      this.releaseLimiter();
    }
    if (engine.crack > 0) this.exhaustCrack(ctx, drive, engine.crack, revs);
  }

  private releaseLimiter(): void {
    this.limiter?.stop();
    this.limiter?.disconnect();
    this.limiter = undefined;
  }

  private exhaustCrack(ctx: AudioContext, drive: ReturnType<typeof createDrive>, strength: number, revs: number): void {
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = drive.crack;
    source.playbackRate.value = .72 + .36 * revs + .11 * Math.sin(ctx.currentTime * 79);
    gain.gain.value = strength;
    source.connect(gain).connect(drive.volume);
    source.onended = () => { source.disconnect(); gain.disconnect(); };
    source.start();
  }

  playCue(settings: Settings, finish = false): void {
    if (!settings.sound || settings.volume === 0) return;
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(finish ? 440 : 600, t);
    osc.frequency.exponentialRampToValueAtTime(finish ? 880 : 450, t + .12);
    gain.gain.setValueAtTime(settings.volume * .05, t);
    gain.gain.exponentialRampToValueAtTime(.0001, t + .2);
    osc.connect(gain).connect(this.output!);
    this.cues.add(osc);
    osc.onended = () => {
      this.cues.delete(osc);
      osc.disconnect();
      gain.disconnect();
      if (this.context === ctx) this.suspendIfIdle();
    };
    osc.start();
    osc.stop(t + .22);
    void ctx.resume().catch(() => {});
  }

  resetEngine(): void {
    if (this.engine) this.engine.model = undefined;
    if (this.context) this.drive?.tires.reset(this.context.currentTime);
    this.releaseLimiter();
  }

  private suspendIfIdle(): void {
    if (!this.driving && !this.cues.size) void this.context?.suspend().catch(() => {});
  }

  stop(silenceCues = false): void {
    this.driving = false;
    this.resetEngine();
    if (this.drive && this.context) {
      const { gain } = this.drive.volume;
      const now = this.context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
    }
    if (silenceCues) {
      for (const cue of this.cues) cue.disconnect();
      this.cues.clear();
    }
    this.suspendIfIdle();
  }

  dispose(): void {
    this.stop(true);
    this.engine?.source.stop();
    this.drive?.noise.stop();
    this.drive?.tires.dispose();
    void this.context?.close().catch(() => {});
    this.context = undefined;
    this.output = undefined;
    this.engine = undefined;
    this.drive = undefined;
  }
}
