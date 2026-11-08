import { CONFIG } from '../config';
import { engineFrequencies, engineMix, type EngineMode, type EngineTune } from './engineDrone';
import { SOUNDS, WHISTLE, type SoundId } from './sounds';

/** The live nodes of the engine drone (M8+ Phase B). */
interface EngineNodes {
  readonly saws: OscillatorNode[];
  readonly whine: OscillatorNode;
  readonly muffle: BiquadFilterNode;
  readonly level: GainNode;
  readonly bus: GainNode;
  readonly pan: StereoPannerNode | null;
}

/** Master volume for the placeholder sounds. */
const MASTER = 0.6;

/**
 * Minimal WebAudio player for the placeholder sounds. Browsers only allow audio after a user
 * gesture, so `unlock()` is called from the "click to begin" handler. Without WebAudio (or
 * before unlocking) every call is a silent no-op, so the game never depends on sound.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** Player volume 0–1 (M8 settings), kept until the context exists. */
  private volume = 1;
  /** The engine drone (M8+ Phase B): its nodes, mode and own volume. */
  private engine: EngineNodes | null = null;
  private engineMode: EngineMode = 'off';
  private engineVolume = 1;

  /** The engine drone's own level 0–1 (settings), under the master volume. */
  setEngineVolume(v: number): void {
    this.engineVolume = Math.min(1, Math.max(0, v));
    if (this.engine && this.ctx) {
      this.engine.bus.gain.setTargetAtTime(this.engineVolume, this.ctx.currentTime, 0.05);
    }
  }

  /** Off (title, briefing), on (flying) or muffled (pause, settings, end screens); ramps there. */
  setEngineMode(mode: EngineMode): void {
    if (mode === this.engineMode) return;
    this.engineMode = mode;
    this.applyEngineMode();
  }

  get engineState(): EngineMode {
    return this.engineMode;
  }

  /** Per frame: the drone's pitch and pan follow the orbit. */
  tuneEngine(t: EngineTune): void {
    const { ctx, engine } = this;
    if (!ctx || !engine) return;
    const now = ctx.currentTime;
    const f = engineFrequencies(t.pitch);
    engine.saws.forEach((o, i) => o.frequency.setTargetAtTime(f[i], now, 0.2));
    engine.whine.frequency.setTargetAtTime(
      CONFIG.engineSound.baseHz * t.pitch * CONFIG.engineSound.whineHarmonic,
      now,
      0.2,
    );
    engine.pan?.pan.setTargetAtTime(t.pan, now, 0.3);
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.master) this.master.gain.value = MASTER * this.volume;
  }

  get playerVolume(): number {
    return this.volume;
  }

  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER * this.volume;
    // A limiter, so a bomb on top of a gun run (40 cracks) can't clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(this.ctx.destination);

    // One second of white noise, reused by every sound.
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    this.engine = this.buildEngine(this.ctx, this.master, this.noise);
    this.applyEngineMode();
  }

  /**
   * Four detuned saws (one per engine) through a low-pass, a faint gearbox whine and band-passed
   * airflow noise, all throbbing with the propeller beat, then a muffle filter and the level.
   */
  private buildEngine(ctx: AudioContext, master: GainNode, noise: AudioBuffer): EngineNodes {
    const E = CONFIG.engineSound;
    const beat = ctx.createGain();
    beat.gain.value = 1 - E.beatDepth / 2;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = E.beatHz;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = E.beatDepth / 2;
    lfo.connect(lfoDepth).connect(beat.gain);
    lfo.start();

    const sawLp = ctx.createBiquadFilter();
    sawLp.type = 'lowpass';
    sawLp.frequency.value = E.cutoffHz;
    sawLp.connect(beat);
    const saws = engineFrequencies(1).map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      o.connect(g).connect(sawLp);
      o.start();
      return o;
    });

    const whine = ctx.createOscillator();
    whine.frequency.value = E.baseHz * E.whineHarmonic;
    const whineGain = ctx.createGain();
    whineGain.gain.value = E.whineGain;
    whine.connect(whineGain).connect(beat);
    whine.start();

    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const airBand = ctx.createBiquadFilter();
    airBand.type = 'bandpass';
    airBand.frequency.value = E.airHz;
    airBand.Q.value = 0.7;
    const airGain = ctx.createGain();
    airGain.gain.value = E.airGain;
    air.connect(airBand).connect(airGain).connect(beat);
    air.start();

    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    const level = ctx.createGain();
    level.gain.value = 0;
    const bus = ctx.createGain();
    bus.gain.value = this.engineVolume;
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    beat.connect(muffle).connect(level).connect(bus);
    if (pan) bus.connect(pan).connect(master);
    else bus.connect(master);
    return { saws, whine, muffle, level, bus, pan };
  }

  private applyEngineMode(): void {
    const { ctx, engine } = this;
    if (!ctx || !engine) return;
    const m = engineMix(this.engineMode);
    const now = ctx.currentTime;
    const tau = Math.max(0.01, m.rampSeconds / 3); // ~95 % of the way after rampSeconds
    engine.level.gain.setTargetAtTime(m.gain, now, tau);
    engine.muffle.frequency.setTargetAtTime(m.cutoffHz, now, tau);
  }

  get enabled(): boolean {
    return this.ctx !== null;
  }

  /**
   * A falling bomb: a fast shriek of air (band-passed noise with a faint tone inside) sweeping
   * from `WHISTLE.startHz` down to `endHz` over `seconds`, getting louder; the boom cuts it off.
   */
  playWhistle(seconds: number, volume = 1): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || ctx.state !== 'running' || seconds <= 0) return;
    const W = WHISTLE;
    const t0 = ctx.currentTime;
    const t1 = t0 + seconds;
    const out = ctx.createGain();
    out.gain.setValueAtTime(W.startGain * volume, t0);
    out.gain.exponentialRampToValueAtTime(W.endGain * volume, t1);
    out.gain.setValueAtTime(0, t1);
    out.connect(master);

    const tone = ctx.createOscillator();
    tone.frequency.setValueAtTime(W.startHz, t0);
    tone.frequency.exponentialRampToValueAtTime(W.endHz, t1);
    const toneGain = ctx.createGain();
    toneGain.gain.value = W.toneGain;
    tone.connect(toneGain).connect(out);

    const rush = ctx.createBufferSource();
    rush.buffer = noise;
    rush.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = W.rushQ;
    band.frequency.setValueAtTime(W.startHz, t0);
    band.frequency.exponentialRampToValueAtTime(W.endHz, t1);
    const rushGain = ctx.createGain();
    rushGain.gain.value = W.rushGain;
    rush.connect(band).connect(rushGain).connect(out);

    for (const n of [tone, rush]) {
      n.start(t0);
      n.stop(t1);
    }
  }

  play(id: SoundId, volume = 1): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || ctx.state !== 'running') return;
    const d = SOUNDS[id];
    const t0 = ctx.currentTime;
    const t1 = t0 + d.duration;

    if (d.noiseGain > 0) {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      // Loop: the noise buffer is 1 s, so a longer sound (the bomb) used to lose its noise after
      // ~0.5–1 s and leave only the sub-bass thump: it "cut off immediately" (M8+ play test).
      src.loop = true;
      src.playbackRate.value = 0.8 + Math.random() * 0.4; // no two shots identical
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(d.cutoffStart, t0);
      lp.frequency.exponentialRampToValueAtTime(d.cutoffEnd, t1);
      const g = envelope(ctx, d.noiseGain * volume, t0, t1);
      src.connect(lp).connect(g).connect(master);
      src.start(t0, Math.random() * 0.5);
      src.stop(t1);
    }

    if (d.thumpGain > 0) {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(d.thumpStart, t0);
      osc.frequency.exponentialRampToValueAtTime(d.thumpEnd, t1);
      const g = envelope(ctx, d.thumpGain * volume, t0, t1);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t1);
    }
  }
}

/** Instant attack, exponential-ish decay to silence at `t1`. */
function envelope(ctx: AudioContext, peak: number, t0: number, t1: number): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(Math.max(1e-4, peak), t0);
  g.gain.exponentialRampToValueAtTime(1e-4, t1);
  return g;
}
