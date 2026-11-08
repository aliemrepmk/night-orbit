import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { engineFrequencies, engineMix, engineTune } from './engineDrone';

const E = CONFIG.engineSound;

describe('engine drone (M8+ Phase B)', () => {
  it('is silent off, full while flying, quieter and duller when muffled', () => {
    const off = engineMix('off');
    const on = engineMix('on');
    const muffled = engineMix('muffled');
    expect(off.gain).toBe(0);
    expect(on.gain).toBe(E.gain);
    expect(muffled.gain).toBeGreaterThan(0);
    expect(muffled.gain).toBeLessThan(on.gain);
    expect(muffled.cutoffHz).toBeLessThan(on.cutoffHz);
    // Fading in/out on DEPLOY or the title is slow; pausing muffles quickly.
    expect(on.rampSeconds).toBeGreaterThan(muffled.rampSeconds);
  });

  it('keeps the pitch within the wobble and pans within the limit around the whole orbit', () => {
    for (let k = 0; k < 360; k++) {
      const a = (k / 360) * 2 * Math.PI;
      const t = engineTune(a, k * 0.7);
      expect(Math.abs(t.pitch - 1)).toBeLessThanOrEqual(E.pitchWobble + 1e-9);
      expect(Math.abs(t.pan)).toBeLessThanOrEqual(E.pan + 1e-9);
    }
  });

  it('actually moves with the orbit (never a static loop)', () => {
    const pitches = new Set<string>();
    const pans = new Set<string>();
    for (let k = 0; k < 8; k++) {
      const t = engineTune((k / 8) * 2 * Math.PI, 0);
      pitches.add(t.pitch.toFixed(4));
      pans.add(t.pan.toFixed(4));
    }
    expect(pitches.size).toBeGreaterThan(2);
    expect(pans.size).toBeGreaterThan(2);
    // Pan swings both ways over one circle.
    expect(engineTune(Math.PI / 2, 0).pan).toBeCloseTo(E.pan);
    expect(engineTune((3 * Math.PI) / 2, 0).pan).toBeCloseTo(-E.pan);
  });

  it('detunes the four engines a little so they beat against each other', () => {
    const f = engineFrequencies(1);
    expect(f).toHaveLength(4);
    expect(new Set(f.map((x) => x.toFixed(3))).size).toBe(4);
    for (const x of f) expect(Math.abs(x / E.baseHz - 1)).toBeLessThan(0.01);
    const higher = engineFrequencies(1.01);
    for (let i = 0; i < 4; i++) expect(higher[i]).toBeCloseTo(f[i] * 1.01);
  });
});
