import { SOUNDS, type SoundId } from './sounds';

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
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused by every sound.
    const n = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, n, n);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  }

  get enabled(): boolean {
    return this.ctx !== null;
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
