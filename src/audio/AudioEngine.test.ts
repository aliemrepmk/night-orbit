import { describe, expect, it } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { SOUNDS, impactVolume } from './sounds';

describe('placeholder sounds', () => {
  it('defines valid envelopes and sweeps for every sound', () => {
    for (const [id, d] of Object.entries(SOUNDS)) {
      expect(d.duration, id).toBeGreaterThan(0);
      expect(d.noiseGain + d.thumpGain, id).toBeGreaterThan(0);
      expect(d.noiseGain, id).toBeLessThanOrEqual(1);
      expect(d.thumpGain, id).toBeLessThanOrEqual(1);
      if (d.noiseGain > 0) expect(d.cutoffEnd, id).toBeGreaterThan(0); // exponential ramps need > 0
      if (d.thumpGain > 0) expect(d.thumpEnd, id).toBeGreaterThan(0);
    }
  });

  it('makes heavier guns louder and longer', () => {
    expect(SOUNDS.fire105.duration).toBeGreaterThan(SOUNDS.fire40.duration);
    expect(SOUNDS.fire40.duration).toBeGreaterThan(SOUNDS.fire25.duration);
    expect(SOUNDS.fire105.thumpGain).toBeGreaterThan(SOUNDS.fire25.thumpGain);
  });

  it('quiets impacts far from the aim point, but never silences them', () => {
    expect(impactVolume(0)).toBe(1);
    expect(impactVolume(300)).toBeLessThan(1);
    expect(impactVolume(5000)).toBe(0.25);
  });
});

describe('AudioEngine', () => {
  it('is a silent no-op without WebAudio (tests, old browsers) or before unlocking', () => {
    const a = new AudioEngine();
    expect(() => a.play('fire105')).not.toThrow();
    a.unlock(); // Node has no AudioContext
    expect(a.enabled).toBe(false);
    expect(() => a.play('impact40', 0.5)).not.toThrow();
  });
});

describe('AudioEngine engine drone (M8+ Phase B)', () => {
  it('accepts mode, tune and volume changes before audio exists (no-op, keeps the mode)', () => {
    const a = new AudioEngine();
    expect(a.engineState).toBe('off');
    a.setEngineMode('on');
    a.tuneEngine({ pitch: 1.01, pan: 0.1 });
    a.setEngineVolume(2); // clamped
    expect(a.engineState).toBe('on');
    a.setEngineMode('muffled');
    expect(a.engineState).toBe('muffled');
  });
});

/** A minimal fake WebAudio context: records every node; params and connects are no-ops. */
function installFakeAudio() {
  const sources: { loop: boolean; kind: string }[] = [];
  const param = () => ({
    value: 0,
    setValueAtTime: () => {},
    exponentialRampToValueAtTime: () => {},
    setTargetAtTime: () => {},
  });
  const node = (kind: string) => {
    const n: Record<string, unknown> = {
      kind,
      loop: false,
      buffer: null,
      type: '',
      connect: (to: unknown) => to,
      start: () => {},
      stop: () => {},
    };
    for (const p of [
      'gain',
      'frequency',
      'Q',
      'playbackRate',
      'pan',
      'threshold',
      'knee',
      'ratio',
      'attack',
      'release',
    ])
      n[p] = param();
    return n;
  };
  class FakeCtx {
    state = 'running';
    currentTime = 0;
    sampleRate = 8000;
    destination = node('destination');
    createGain = () => node('gain');
    createBiquadFilter = () => node('filter');
    createOscillator = () => node('osc');
    createDynamicsCompressor = () => node('compressor');
    createStereoPanner = () => node('panner');
    createBufferSource = () => {
      const s = node('source');
      sources.push(s as unknown as { loop: boolean; kind: string });
      return s;
    };
    createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) });
    resume = async () => {};
  }
  const g = globalThis as { AudioContext?: unknown };
  const before = g.AudioContext;
  g.AudioContext = FakeCtx;
  return { sources, restore: () => (g.AudioContext = before) };
}

describe('AudioEngine noise (regression)', () => {
  it('loops the 1 s noise buffer, so a long sound (the bomb) keeps its noise to the end', () => {
    const fake = installFakeAudio();
    try {
      const a = new AudioEngine();
      a.unlock();
      expect(a.enabled).toBe(true);
      const before = fake.sources.length; // the engine drone's airflow source
      a.play('impactbomb');
      const shot = fake.sources.slice(before);
      expect(shot).toHaveLength(1);
      expect(shot[0].loop).toBe(true);
    } finally {
      fake.restore();
    }
  });
});
