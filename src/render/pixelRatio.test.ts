import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { renderPixelRatio } from './pixelRatio';

const R = { maxPixelRatio: 1.5, minPixelRatio: 0.5 };

describe('render pixel ratio (M10 render resolution setting)', () => {
  it('full scale keeps the cap: Retina renders at 1.5×, a 1× screen at 1×', () => {
    expect(renderPixelRatio(2, 1, R)).toBe(1.5);
    expect(renderPixelRatio(3, 1, R)).toBe(1.5);
    expect(renderPixelRatio(1, 1, R)).toBe(1);
  });

  it('every setting step gives a different, smaller ratio on both kinds of screen', () => {
    const s = CONFIG.settings.renderScale;
    for (const dpr of [1, 2]) {
      const ratios: number[] = [];
      for (let k = s.max; k >= s.min - 1e-9; k -= s.step) ratios.push(renderPixelRatio(dpr, k));
      for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeLessThan(ratios[i - 1]);
    }
  });

  it('75 % on Retina is about half the pixels of 100 %', () => {
    const full = renderPixelRatio(2, 1, R) ** 2;
    const three = renderPixelRatio(2, 0.75, R) ** 2;
    expect(three / full).toBeCloseTo(0.5625, 4);
  });

  it('never drops below the floor, and bad inputs fall back to 1× full scale', () => {
    expect(renderPixelRatio(1, 0.25, R)).toBe(0.5);
    expect(renderPixelRatio(Number.NaN, 1, R)).toBe(1);
    expect(renderPixelRatio(0, Number.NaN, R)).toBe(1);
    expect(renderPixelRatio(2, 5, R)).toBe(1.5);
  });
});
