import { CONFIG } from '../config';

/** The player's settings (M8, PLAN.md §7.16). */
export interface Settings {
  /** Mouse sensitivity multiplier (on top of `CONFIG.sensor.sensitivity`). */
  sensitivity: number;
  invertY: boolean;
  /** Master volume 0–1. */
  volume: number;
  /** The engine drone's own level 0–1, under the master volume (M8+ Phase B). */
  engineVolume: number;
  /** Camera shake from impacts and 105 mm recoil. */
  screenShake: boolean;
  /** Radio subtitles low in the view. */
  subtitles: boolean;
}

export type SettingsConfig = typeof CONFIG.settings;

/** The storage the settings live in; `null` (or a throwing getter) when it is unavailable. */
export type StorageGetter = () => Pick<Storage, 'getItem' | 'setItem'> | null;

export function defaultSettings(cfg: SettingsConfig = CONFIG.settings): Settings {
  return {
    sensitivity: cfg.sensitivity.default,
    invertY: false,
    volume: cfg.volume.default,
    engineVolume: cfg.engineVolume.default,
    screenShake: true,
    subtitles: true,
  };
}

function number(v: unknown, r: { default: number; min: number; max: number }): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return r.default;
  return Math.min(r.max, Math.max(r.min, v));
}

function flag(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

/** Any parsed value → valid settings: unknown keys dropped, bad or missing values defaulted. */
export function sanitizeSettings(raw: unknown, cfg: SettingsConfig = CONFIG.settings): Settings {
  const d = defaultSettings(cfg);
  if (typeof raw !== 'object' || raw === null) return d;
  const r = raw as Record<string, unknown>;
  return {
    sensitivity: number(r.sensitivity, cfg.sensitivity),
    invertY: flag(r.invertY, d.invertY),
    volume: number(r.volume, cfg.volume),
    engineVolume: number(r.engineVolume, cfg.engineVolume),
    screenShake: flag(r.screenShake, d.screenShake),
    subtitles: flag(r.subtitles, d.subtitles),
  };
}

/**
 * Loads the saved settings. Never throws: private windows, blocked storage, a throwing getter
 * or corrupt JSON all give the defaults.
 */
export function loadSettings(
  storage: StorageGetter,
  cfg: SettingsConfig = CONFIG.settings,
): Settings {
  try {
    const text = storage()?.getItem(cfg.storageKey);
    return text ? sanitizeSettings(JSON.parse(text), cfg) : defaultSettings(cfg);
  } catch {
    return defaultSettings(cfg);
  }
}

/** Saves the settings; false when storage is unavailable (the game keeps them for this visit). */
export function saveSettings(
  storage: StorageGetter,
  s: Settings,
  cfg: SettingsConfig = CONFIG.settings,
): boolean {
  try {
    const st = storage();
    if (!st) return false;
    st.setItem(cfg.storageKey, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Steps a slider value by `dir` steps, snapped to the step grid and clamped to its range. */
export function stepValue(
  value: number,
  dir: number,
  r: { min: number; max: number; step: number },
): number {
  const n = Math.round((value + dir * r.step) / r.step) * r.step;
  return Math.min(r.max, Math.max(r.min, Number(n.toFixed(4))));
}

/** The browser's localStorage, or null when even touching it throws. */
export const browserStorage: StorageGetter = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};
