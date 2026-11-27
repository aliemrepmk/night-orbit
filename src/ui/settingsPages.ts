import { CONFIG } from '../config';
import type { Settings } from './settings';

/**
 * The SETTINGS screen's pages (M10+): which setting sits on which tab, and how each one is
 * changed and shown. Pure; `Screens` draws the rows.
 */
export type SettingKind =
  /** A stepped value with − / + and a segmented bar. */
  | 'slider'
  /** A choice between fixed values (ON / OFF, 100 / 75 / 50 %). */
  | 'choice';

export type SliderKey = 'sensitivity' | 'volume' | 'sfxVolume' | 'radioVolume' | 'engineVolume';
export type ChoiceKey = 'invertY' | 'renderScale' | 'screenShake' | 'subtitles';

export interface SettingRow {
  readonly key: keyof Settings;
  readonly label: string;
  readonly help: string;
  readonly kind: SettingKind;
  /** For choices: the values in order, with their labels. */
  readonly options?: readonly { readonly value: boolean | number; readonly text: string }[];
}

export interface SettingsPage {
  readonly name: string;
  readonly rows: readonly SettingRow[];
}

const ON_OFF = [
  { value: true, text: 'ON' },
  { value: false, text: 'OFF' },
] as const;

export const SETTINGS_PAGES: readonly SettingsPage[] = [
  {
    name: 'CONTROLS',
    rows: [
      {
        key: 'sensitivity',
        label: 'MOUSE SENSITIVITY',
        help: 'On top of the zoom: narrow views slew slower.',
        kind: 'slider',
      },
      {
        key: 'invertY',
        label: 'INVERT MOUSE Y',
        help: 'Mouse forward looks down.',
        kind: 'choice',
        options: [
          { value: false, text: 'OFF' },
          { value: true, text: 'ON' },
        ],
      },
    ],
  },
  {
    name: 'AUDIO',
    rows: [
      { key: 'volume', label: 'VOLUME', help: 'Everything.', kind: 'slider' },
      {
        key: 'sfxVolume',
        label: 'EFFECTS',
        help: 'Guns, impacts, strikes and cockpit beeps.',
        kind: 'slider',
      },
      { key: 'radioVolume', label: 'RADIO', help: 'Squelch, static and intercom.', kind: 'slider' },
      { key: 'engineVolume', label: 'ENGINE', help: 'The four-engine drone.', kind: 'slider' },
    ],
  },
  {
    name: 'DISPLAY',
    rows: [
      {
        key: 'renderScale',
        label: 'RENDER RESOLUTION',
        help: 'Lower it if the frame rate drops.',
        kind: 'choice',
        options: [
          { value: 1, text: '100%' },
          { value: 0.75, text: '75%' },
          { value: 0.5, text: '50%' },
        ],
      },
      {
        key: 'screenShake',
        label: 'SCREEN SHAKE',
        help: 'Impacts and the 105 mm recoil.',
        kind: 'choice',
        options: ON_OFF,
      },
      {
        key: 'subtitles',
        label: 'RADIO SUBTITLES',
        help: 'Radio lines low in the view.',
        kind: 'choice',
        options: ON_OFF,
      },
    ],
  },
];

/** A slider's range (from `CONFIG.settings`). */
export function sliderRange(key: SliderKey): { min: number; max: number; step: number } {
  return CONFIG.settings[key];
}

/** How a slider value reads: `1.00×` for sensitivity, `80%` for the volumes. */
export function sliderText(key: SliderKey, v: number): string {
  return key === 'sensitivity' ? `${v.toFixed(2)}×` : `${Math.round(v * 100)}%`;
}

/** Cells of a slider's segmented bar that are lit (of `n`). */
export function sliderCells(key: SliderKey, v: number, n = 20): number {
  const r = sliderRange(key);
  return Math.round(((v - r.min) / (r.max - r.min)) * n);
}

/** The choice `dir` steps from the current value (clamped at the ends, unknown → first). */
export function stepChoice(row: SettingRow, current: unknown, dir: number): boolean | number {
  const opts = row.options ?? [];
  const i = opts.findIndex((o) => o.value === current);
  const j = Math.max(0, Math.min(opts.length - 1, (i < 0 ? 0 : i) + dir));
  return opts[j].value;
}
