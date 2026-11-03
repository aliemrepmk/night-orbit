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
