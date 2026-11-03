import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { HEAT } from '../fx/Heat';
import { WEAPONS } from '../gunship/weaponDefs';
import {
  applyPolarity,
  contrastCurve,
  displayValue,
  grainForFov,
  polarityLabel,
  togglePolarity,
} from './thermalMath';

const { levels } = CONFIG.thermal;

describe('polarity', () => {
  it('white-hot keeps the value, black-hot inverts it', () => {
    expect(applyPolarity(0.9, 'white')).toBe(0.9);
    expect(applyPolarity(0.9, 'black')).toBeCloseTo(0.1);
    expect(applyPolarity(0, 'black')).toBe(1);
  });

  it('toggles back and forth and labels each mode for the HUD', () => {
    expect(togglePolarity('white')).toBe('black');
    expect(togglePolarity(togglePolarity('white'))).toBe('white');
    expect(polarityLabel('white')).toBe('WHT HOT');
    expect(polarityLabel('black')).toBe('BLK HOT');
  });
});

describe('contrast curve', () => {
  it('maps the window ends to black and white and clamps outside it', () => {
    expect(contrastCurve(levels.lo, levels, 0.8)).toBe(0);
    expect(contrastCurve(levels.hi, levels, 0.8)).toBe(1);
    expect(contrastCurve(-5, levels, 0.8)).toBe(0);
    expect(contrastCurve(5, levels, 0.8)).toBe(1);
  });

  it('is monotonic, so hotter is never shown darker', () => {
    for (const gamma of Object.values(CONFIG.thermal.gamma)) {
      let prev = -Infinity;
      for (let h = -0.2; h <= 1.2; h += 0.01) {
        const c = contrastCurve(h, levels, gamma);
        expect(c).toBeGreaterThanOrEqual(prev);
        prev = c;
      }
    }
  });
});

describe('display value', () => {
  it('makes black-hot an exact mirror of white-hot', () => {
    for (const h of [0, 0.1, 0.33, 0.7, 1]) {
      const w = displayValue(h, 'white', levels, 0.8);
      const b = displayValue(h, 'black', levels, 0.8);
      expect(w + b).toBeCloseTo(1);
    }
  });

  it('separates soldiers from the ground clearly with every weapon, in both polarities', () => {
    for (const gamma of Object.values(CONFIG.thermal.gamma)) {
      for (const p of ['white', 'black'] as const) {
        const soldier = displayValue(HEAT.soldier, p, levels, gamma);
        const warmSoil = displayValue(HEAT.soilMax, p, levels, gamma);
        expect(Math.abs(soldier - warmSoil)).toBeGreaterThan(0.5);
      }
    }
  });

  it('keeps cold soil off pure black in white-hot, so terrain stays readable', () => {
    for (const gamma of Object.values(CONFIG.thermal.gamma)) {
      expect(displayValue(HEAT.soilMin, 'white', levels, gamma)).toBeGreaterThan(0.15);
    }
  });
});

describe('grain', () => {
  const narrow = WEAPONS['25'].fovDeg;
  const wide = WEAPONS['105'].fovDeg;
  const { grainNarrow, grainWide } = CONFIG.thermal;
  const g = (fov: number) => grainForFov(fov, narrow, wide, grainNarrow, grainWide);

  it('is stronger at narrow zoom', () => {
    expect(g(narrow)).toBeCloseTo(grainNarrow);
    expect(g(wide)).toBeCloseTo(grainWide);
    expect(g(narrow)).toBeGreaterThan(g(WEAPONS['40'].fovDeg));
    expect(g(WEAPONS['40'].fovDeg)).toBeGreaterThan(g(wide));
  });

  it('clamps outside the optic range (e.g. mid zoom transitions overshooting)', () => {
    expect(g(1)).toBeCloseTo(grainNarrow);
    expect(g(90)).toBeCloseTo(grainWide);
  });
});
