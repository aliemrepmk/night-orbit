import { describe, expect, it } from 'vitest';
import { defaultSettings, type Settings } from './settings';
import {
  SETTINGS_PAGES,
  sliderCells,
  sliderText,
  stepChoice,
  type SliderKey,
} from './settingsPages';

describe('settings pages (M10+)', () => {
  it('puts every setting on exactly one of three tabs', () => {
    expect(SETTINGS_PAGES.map((p) => p.name)).toEqual(['CONTROLS', 'AUDIO', 'DISPLAY']);
    const keys = SETTINGS_PAGES.flatMap((p) => p.rows.map((r) => r.key)).sort();
    expect(keys).toEqual((Object.keys(defaultSettings()) as (keyof Settings)[]).sort());
  });

  it('gives each choice an option for the default value, of the right type', () => {
    const d = defaultSettings();
    for (const row of SETTINGS_PAGES.flatMap((p) => p.rows)) {
      if (row.kind !== 'choice') {
        expect(typeof d[row.key]).toBe('number');
        continue;
      }
      expect(row.options!.some((o) => o.value === d[row.key])).toBe(true);
    }
  });

  it('reads sliders as × or %, and lights cells across the full range', () => {
    expect(sliderText('sensitivity', 1)).toBe('1.00×');
    expect(sliderText('volume', 0.8)).toBe('80%');
    const k: SliderKey = 'volume';
    expect(sliderCells(k, 0)).toBe(0);
    expect(sliderCells(k, 1)).toBe(20);
    expect(sliderCells('sensitivity', 3)).toBe(20);
  });

  it('steps choices with ← / →, clamped at the ends', () => {
    const res = SETTINGS_PAGES[2].rows[0];
    expect(stepChoice(res, 1, 1)).toBe(0.75);
    expect(stepChoice(res, 0.5, 1)).toBe(0.5);
    expect(stepChoice(res, 1, -1)).toBe(1);
    expect(stepChoice(res, 'junk', 1)).toBe(0.75);
  });
});
