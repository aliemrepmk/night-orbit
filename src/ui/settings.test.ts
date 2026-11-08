import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import {
  defaultSettings,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  stepValue,
  type StorageGetter,
} from './settings';

const KEY = CONFIG.settings.storageKey;

function memory(): { get: StorageGetter; data: Map<string, string> } {
  const data = new Map<string, string>();
  const st = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
  return { get: () => st, data };
}

const throwingGetter: StorageGetter = () => {
  throw new Error('SecurityError: localStorage is disabled');
};
const throwingStorage: StorageGetter = () => ({
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
});

describe('settings save / load', () => {
  it('round-trips through storage', () => {
    const m = memory();
    const s = {
      ...defaultSettings(),
      sensitivity: 1.6,
      invertY: true,
      volume: 0.3,
      subtitles: false,
    };
    expect(saveSettings(m.get, s)).toBe(true);
    expect(m.data.has(KEY)).toBe(true);
    expect(loadSettings(m.get)).toEqual(s);
  });

  it('gives the defaults when nothing was saved yet', () => {
    expect(loadSettings(memory().get)).toEqual(defaultSettings());
  });

  it('works with storage unavailable: null, a throwing getter, or throwing reads and writes', () => {
    for (const st of [() => null, throwingGetter, throwingStorage] as StorageGetter[]) {
      expect(loadSettings(st)).toEqual(defaultSettings());
      expect(saveSettings(st, defaultSettings())).toBe(false);
    }
  });

  it('survives corrupt or hand-edited data: bad JSON, wrong types, out-of-range values', () => {
    const m = memory();
    m.data.set(KEY, '{not json');
    expect(loadSettings(m.get)).toEqual(defaultSettings());
    m.data.set(KEY, JSON.stringify({ sensitivity: 99, volume: -1, invertY: 'yes', extra: 1 }));
    const s = loadSettings(m.get);
    expect(s.sensitivity).toBe(CONFIG.settings.sensitivity.max);
    expect(s.volume).toBe(CONFIG.settings.volume.min);
    expect(s.engineVolume).toBe(CONFIG.settings.engineVolume.default); // missing → default
    expect(s.invertY).toBe(false);
    expect('extra' in s).toBe(false);
    expect(sanitizeSettings(null)).toEqual(defaultSettings());
    expect(sanitizeSettings({ sensitivity: Number.NaN }).sensitivity).toBe(
      CONFIG.settings.sensitivity.default,
    );
  });
});

describe('stepValue', () => {
  it('snaps to the step grid and clamps to the range', () => {
    const r = CONFIG.settings.sensitivity;
    expect(stepValue(1, 1, r)).toBe(1.05);
    expect(stepValue(1.0300001, 0, r)).toBe(1.05);
    expect(stepValue(r.max, 1, r)).toBe(r.max);
    expect(stepValue(r.min, -1, r)).toBe(r.min);
  });
});
