import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { HEAT } from '../fx/Heat';
import { ALBEDO, GLOW, groundAlbedo } from '../fx/Light';
import { WEAPONS } from '../gunship/weaponDefs';
import {
  applyPolarity,
  contrastCurve,
  displayValue,
  grainForFov,
  nextSensorMode,
  nvCurve,
  nvSurfaceLight,
  sensorModeLabel,
} from './thermalMath';

const { levels } = CONFIG.thermal;

describe('polarity', () => {
  it('white-hot keeps the value, black-hot inverts it', () => {
    expect(applyPolarity(0.9, 'white')).toBe(0.9);
    expect(applyPolarity(0.9, 'black')).toBeCloseTo(0.1);
    expect(applyPolarity(0, 'black')).toBe(1);
  });
});

describe('sensor modes', () => {
  it('cycles white-hot → black-hot → NV → white-hot with F', () => {
    expect(nextSensorMode('white')).toBe('black');
    expect(nextSensorMode('black')).toBe('nv');
    expect(nextSensorMode('nv')).toBe('white');
  });

  it('labels each mode for the HUD', () => {
    expect(sensorModeLabel('white')).toBe('WHT HOT');
    expect(sensorModeLabel('black')).toBe('BLK HOT');
    expect(sensorModeLabel('nv')).toBe('NV');
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

describe('night vision', () => {
  const nv = CONFIG.nightVision;
  const { threshold } = CONFIG.thermal.bloom;
  // A flat surface lit from straight above-ish: the brightest case for reflected light.
  const lit = (albedo: number, glow = 0) => nvSurfaceLight(albedo, glow, 1, 1, nv);

  it('lights surfaces by albedo, moon angle and sky, and adds glow on top', () => {
    expect(lit(0)).toBe(0);
    expect(lit(0.5)).toBeCloseTo(0.5 * (nv.skyLight + nv.moonLight));
    expect(nvSurfaceLight(0.5, 0, 1, 0, nv)).toBeLessThan(lit(0.5)); // facing away from the moon
    expect(nvSurfaceLight(0.5, 0, 0, 0, nv)).toBeLessThan(nvSurfaceLight(0.5, 0, 1, 0, nv)); // walls
    expect(lit(0.2, 0.5)).toBeCloseTo(lit(0.2) + 0.5);
  });

  it('blooms only things that emit light: lit windows glow, no lit surface does', () => {
    const brightestSurface = lit(Math.max(...Object.values(ALBEDO)));
    expect(brightestSurface).toBeLessThan(threshold);
    expect(lit(ALBEDO.window, GLOW.litWindow)).toBeGreaterThan(threshold);
  });

  it('does not single out soldiers the way thermal does', () => {
    const gamma = CONFIG.thermal.gamma['25'];
    const thermalGap =
      displayValue(HEAT.soldier, 'white', levels, gamma) -
      displayValue(HEAT.soilMax, 'white', levels, gamma);
    const ground = groundAlbedo(HEAT.soilMax);
    const nvGap = Math.abs(
      nvCurve(lit(ALBEDO.soldier), nv.gain, nv.gamma) - nvCurve(lit(ground), nv.gain, nv.gamma),
    );
    expect(nvGap).toBeLessThan(thermalGap / 4);
  });

  it('shows trees brighter than the open ground they stand on (the opposite of thermal)', () => {
    // Regression: tree sides face mostly sideways; they must still beat flat, moonlit ground
    // (an early model gave sideways surfaces so little sky light that trees looked black).
    const treeSide = nvSurfaceLight(ALBEDO.tree, 0, 0.3, 0.3, nv);
    const treeShadowSide = nvSurfaceLight(ALBEDO.tree, 0, 0.3, 0, nv);
    for (const heat of [HEAT.soilMin, HEAT.soilMax]) {
      const ground = lit(groundAlbedo(heat));
      expect(treeSide).toBeGreaterThan(ground);
      expect(treeShadowSide).toBeGreaterThan(ground * 0.9);
    }
    expect(HEAT.tree).toBeLessThan(HEAT.soilMax);
  });

  it('has a monotonic display curve that keeps lit ground readable', () => {
    let prev = -Infinity;
    for (let l = 0; l <= 1.2; l += 0.01) {
      const c = nvCurve(l, nv.gain, nv.gamma);
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
    expect(nvCurve(0, nv.gain, nv.gamma)).toBe(0);
    expect(nvCurve(10, nv.gain, nv.gamma)).toBe(1);
    expect(nvCurve(lit(ALBEDO.soilBare), nv.gain, nv.gamma)).toBeGreaterThan(0.2);
  });
});
