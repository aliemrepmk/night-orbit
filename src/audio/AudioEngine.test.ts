import { describe, expect, it } from 'vitest';
import { AudioEngine } from './AudioEngine';
import { STRIKES } from '../gunship/airSupportDefs';
import { SOUNDS, STRIKE_MIN_VOLUME, WHISTLE, impactVolume } from './sounds';

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

  it('makes air strikes louder than the guns: a gun-run hit above a 25 mm hit, the bomb the loudest', () => {
    const loud = (d: (typeof SOUNDS)[keyof typeof SOUNDS]) => d.noiseGain + d.thumpGain;
    expect(loud(SOUNDS.impactgunrun)).toBeGreaterThan(loud(SOUNDS.impact25) * 3);
    expect(loud(SOUNDS.impactbomb)).toBeGreaterThan(loud(SOUNDS.impact105));
    expect(SOUNDS.impactbomb.duration).toBeGreaterThan(SOUNDS.impact105.duration);
  });

  it('the bomb whistle slides down in pitch and gets louder toward impact', () => {
    expect(WHISTLE.startHz).toBeGreaterThan(WHISTLE.endHz);
    expect(WHISTLE.endHz).toBeGreaterThan(0); // exponential ramps need > 0
    expect(WHISTLE.endGain).toBeGreaterThan(WHISTLE.startGain);
    expect(WHISTLE.startGain).toBeGreaterThan(0);
    const a = new AudioEngine();
    expect(() => a.playWhistle(3)).not.toThrow(); // silent no-op without WebAudio
  });

  it('the whistle is a quick sweep (0.5 s, M8+ play tests) and mostly air, not a pure tone', () => {
    expect(STRIKES.bomb.whistleSeconds).toBeCloseTo(0.5);
    expect(WHISTLE.endGain).toBeLessThan(SOUNDS.impactbomb.noiseGain / 4); // quiet next to the blast
    expect(WHISTLE.rushGain).toBeGreaterThan(WHISTLE.toneGain * 3);
    expect(WHISTLE.startHz / WHISTLE.endHz).toBeGreaterThanOrEqual(3); // a real sweep
  });

  it('the bomb is a bigger 105 mm blast: louder, brighter at the start, far longer (M8+ play tests)', () => {
    const b = SOUNDS.impactbomb;
    const g = SOUNDS.impact105;
    expect(b.noiseGain).toBeGreaterThan(g.noiseGain);
    expect(b.thumpGain).toBeGreaterThan(g.thumpGain);
    expect(b.duration).toBeGreaterThanOrEqual(g.duration * 5);
    // The same falling sweeps as the 105 mm, starting brighter so it carries on small speakers.
    expect(b.cutoffStart).toBeGreaterThan(g.cutoffStart);
    expect(b.cutoffStart).toBeGreaterThan(b.cutoffEnd);
    expect(b.thumpStart).toBeGreaterThan(b.thumpEnd);
  });

  it('the bomb rumbles far longer than anything else', () => {
    for (const [id, d] of Object.entries(SOUNDS)) {
      if (id !== 'impactbomb')
        expect(SOUNDS.impactbomb.duration, id).toBeGreaterThan(d.duration * 2);
    }
  });

  it('keeps air strikes loud wherever they land (regression: they faded with distance)', () => {
    expect(impactVolume(2000, 'bomb')).toBe(STRIKE_MIN_VOLUME);
    expect(impactVolume(2000, 'gunrun')).toBe(STRIKE_MIN_VOLUME);
    expect(impactVolume(0, 'bomb')).toBe(1);
    expect(impactVolume(2000, '105')).toBe(0.25); // the guns still fade
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
