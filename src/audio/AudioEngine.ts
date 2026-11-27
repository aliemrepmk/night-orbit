import { CONFIG } from '../config';
import { engineFrequencies, engineMix, type EngineMode, type EngineTune } from './engineDrone';
import { BUSES, busGains, type Bus, type Volumes } from './mix';
import { RADIO_HISS, SOUNDS, WHISTLE, type SoundId } from './sounds';

/** The live nodes of the engine drone (M8+ Phase B). */
interface EngineNodes {
  readonly saws: OscillatorNode[];
  /** Each engine's own level (an engine lost to AA falls silent, M8+ Phase E). */
  readonly sawGains: GainNode[];
  readonly whine: OscillatorNode;
  readonly muffle: BiquadFilterNode;
  readonly level: GainNode;
  readonly pan: StereoPannerNode | null;
}

/**
 * Minimal WebAudio player for the placeholder sounds. Browsers only allow audio after a user
 * gesture, so `unlock()` is called from the "click to begin" handler. Without WebAudio (or
 * before unlocking) every call is a silent no-op, so the game never depends on sound.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** The player's volumes (settings), kept until the context exists. */
  private volumes: Volumes = { volume: 1, sfxVolume: 1, radioVolume: 1, engineVolume: 1 };
  /** The mixer's buses (M9): every sound goes into one of them, they go into the master. */
  private buses: Record<Bus, GainNode> | null = null;
  /** The engine drone (M8+ Phase B): its nodes and mode. It plays on the ambience bus. */
  private engine: EngineNodes | null = null;
  private engineMode: EngineMode = 'off';
  /** The static under outside-net radio lines (M9): wanted by the radio, allowed while flying. */
  private hiss: GainNode | null = null;
  private hissWanted = false;
  private hissAllowed = false;

  /** A line on the outside net is on air (static under it) or not. */
  radioHiss(on: boolean): void {
    this.hissWanted = on;
    this.applyHiss();
  }

  /** Static only plays while flying: menus and end screens silence it (the line resumes after). */
  set radioAllowed(on: boolean) {
    this.hissAllowed = on;
    this.applyHiss();
  }

  /** The static's level right now (0 when off); for tests. */
  get hissOn(): boolean {
    return this.hissWanted && this.hissAllowed;
  }

  private applyHiss(): void {
    const { ctx, hiss } = this;
    if (!ctx || !hiss) return;
    hiss.gain.setTargetAtTime(
      this.hissOn ? RADIO_HISS.gain : 0,
      ctx.currentTime,
      RADIO_HISS.fadeSeconds / 3,
    );
  }

  /** The player's master and bus volumes (M9 settings); ramps there quickly. */
  setVolumes(v: Volumes): void {
    this.volumes = {
      volume: v.volume,
      sfxVolume: v.sfxVolume,
      radioVolume: v.radioVolume,
      engineVolume: v.engineVolume,
    };
    this.applyVolumes();
  }

  /** The node gains the mixer is set to (null before audio exists). */
  get mixGains(): ({ master: number } & Record<Bus, number>) | null {
    if (!this.master || !this.buses) return null;
    const out = { master: this.master.gain.value } as { master: number } & Record<Bus, number>;
    for (const b of BUSES) out[b] = this.buses[b].gain.value;
    return out;
  }

  private applyVolumes(): void {
    const { master, buses } = this;
    if (!master || !buses) return;
    const g = busGains(this.volumes);
    master.gain.value = g.master;
    for (const b of BUSES) buses[b].gain.value = g[b];
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

  /**
   * Hidden tab (M10): stop all sound while the page can't be seen, and pick up where it was when
   * it comes back. Before the first `unlock` there is no context and nothing to do.
   */
  setHidden(hidden: boolean): void {
    if (!this.ctx) return;
    void (hidden ? this.ctx.suspend() : this.ctx.resume());
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
    // A limiter, so a bomb on top of a gun run (40 cracks) can't clip.
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.master.connect(limiter).connect(this.ctx.destination);
    const bus = (): GainNode => {
      const g = this.ctx!.createGain();
      g.connect(this.master!);
      return g;
    };
    this.buses = { sfx: bus(), radio: bus(), ambience: bus() };
    this.applyVolumes();

    // One second of white noise, reused by every sound.
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
    this.engine = this.buildEngine(this.ctx, this.buses.ambience, this.noise);
    this.hiss = this.buildHiss(this.ctx, this.buses.radio, this.noise);
    this.applyHiss();
    this.applyEngineMode();
  }

  /**
   * Four detuned saws (one per engine) through a low-pass, a faint gearbox whine and band-passed
   * airflow noise, all throbbing with the propeller beat, then a muffle filter and the level.
   */
  private buildEngine(ctx: AudioContext, out: GainNode, noise: AudioBuffer): EngineNodes {
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
    const sawGains: GainNode[] = [];
    const saws = engineFrequencies(1).map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      sawGains.push(g);
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
    const pan = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    beat.connect(muffle).connect(level);
    if (pan) level.connect(pan).connect(out);
    else level.connect(out);
    return { saws, sawGains, whine, muffle, level, pan };
  }

  /** A looping band of static, silent until a line on the outside net keys it. */
  private buildHiss(ctx: AudioContext, out: GainNode, noise: AudioBuffer): GainNode {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = RADIO_HISS.hz;
    band.Q.value = RADIO_HISS.q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(band).connect(g).connect(out);
    src.start();
    return g;
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
    const { ctx, buses, noise } = this;
    if (!ctx || !buses || !noise || ctx.state !== 'running' || seconds <= 0) return;
    const W = WHISTLE;
    const t0 = ctx.currentTime;
    const t1 = t0 + seconds;
    const out = ctx.createGain();
    out.gain.setValueAtTime(W.startGain * volume, t0);
    out.gain.exponentialRampToValueAtTime(W.endGain * volume, t1);
    out.gain.setValueAtTime(0, t1);
    out.connect(buses.sfx);

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

  /** A short square-wave beep (the missile warning tone, M8+ Phase E). */
  beep(hz: number, seconds: number, volume = 0.12): void {
    const { ctx, buses } = this;
    if (!ctx || !buses || ctx.state !== 'running') return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t0);
    g.gain.setValueAtTime(0, t0 + seconds);
    osc.connect(g).connect(buses.sfx);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.01);
  }

  /** Engines still running (M8+ Phase E): after one is lost to AA, its part of the drone stops. */
  setEnginesRunning(n: number): void {
    const { ctx, engine } = this;
    this.enginesRunning = n;
    if (!ctx || !engine) return;
    engine.sawGains.forEach((g, i) =>
      g.gain.setTargetAtTime(i < n ? 0.25 : 0, ctx.currentTime, 0.6),
    );
  }

  /** Engines running (4, or 3 once one is lost). */
  enginesRunning = 4;

  play(id: SoundId, volume = 1): void {
    const { ctx, buses, noise } = this;
    if (!ctx || !buses || !noise || ctx.state !== 'running') return;
    const d = SOUNDS[id];
    const master = buses[d.bus ?? 'sfx'];
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
      lp.type = d.filter ?? 'lowpass';
      if (d.q !== undefined) lp.Q.value = d.q;
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

    if (d.click) {
      // A 4 ms tick: the transient that makes a shot (or a radio key) snap.
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = d.click.hz;
      const g = envelope(ctx, d.click.gain * volume, t0, t0 + 0.004);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.005);
    }

    if (d.rattle) {
      // Loose kit shaking: band-passed noise, its level throbbing at `rateHz`, dying away.
      const r = d.rattle;
      const r0 = t0 + r.delay;
      const r1 = r0 + r.seconds;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = r.hz;
      band.Q.value = 2;
      const shake = ctx.createGain();
      shake.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = r.rateHz;
      const depth = ctx.createGain();
      depth.gain.value = 0.5;
      lfo.connect(depth).connect(shake.gain);
      const g = envelope(ctx, r.gain * volume, r0, r1);
      src.connect(band).connect(shake).connect(g).connect(master);
      for (const n of [src, lfo]) {
        n.start(r0);
        n.stop(r1);
      }
    }

    for (const t of d.tones ?? []) {
      const a = t0 + t.at;
      const osc = ctx.createOscillator();
      osc.type = t.wave;
      osc.frequency.value = t.hz;
      const g = ctx.createGain();
      // A 5 ms fade at each end, so beeps don't click.
      g.gain.setValueAtTime(0, a);
      g.gain.linearRampToValueAtTime(t.gain * volume, a + 0.005);
      g.gain.setValueAtTime(t.gain * volume, a + t.seconds - 0.005);
      g.gain.linearRampToValueAtTime(0, a + t.seconds);
      osc.connect(g).connect(master);
      osc.start(a);
      osc.stop(a + t.seconds + 0.01);
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
