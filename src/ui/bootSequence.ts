import { CONFIG } from '../config';

/** One line of the start-up self test (M10+): a system and the status it reports. */
export interface BootLine {
  readonly label: string;
  readonly status: string;
}

/** What the mission computer tests on start-up (first load only; any key or click skips it). */
export const BOOT_LINES: readonly BootLine[] = [
  { label: 'MISSION COMPUTER', status: 'OK' },
  { label: 'NAV / INS ALIGNMENT', status: 'OK' },
  { label: 'SENSOR TURRET  IR / NV', status: 'OK' },
  { label: 'FIRE CONTROL  25 / 40 / 105 MM', status: 'OK' },
  { label: 'DATALINK  RIDGEBACK', status: 'SYNC' },
  { label: 'RADIO  KESTREL 6 · HAMMER 1-1', status: 'OK' },
  { label: `COUNTERMEASURES  FLARES ×${CONFIG.airDefense.flares}`, status: 'ARMED' },
  { label: 'THREAT LIBRARY  VARESH VALLEY', status: 'LOADED' },
  { label: 'MISSION PACKAGE  OP NIGHT ORBIT', status: 'READY' },
];

/** The status bars beside the log: each fills over the three lines around its own. */
export const BOOT_BARS: readonly { label: string; line: number }[] = [
  { label: 'POWER', line: 1 },
  { label: 'NAV ALIGN', line: 2 },
  { label: 'SENSOR COOLDOWN', line: 3 },
  { label: 'FIRE CONTROL', line: 4 },
  { label: 'DATALINK', line: 5 },
];

export interface BootState {
  /** How many log lines are showing. */
  readonly lines: number;
  /** Each bar's fill, 0–1. */
  readonly bars: readonly number[];
  /** Every line is in and the short hold after it is over: CONTINUE shows. */
  readonly done: boolean;
}

type BootConfig = { readonly bootLineSeconds: number; readonly bootHoldSeconds: number };

/** The boot screen `t` seconds in (pure; the screen redraws from it). */
export function bootState(t: number, cfg: BootConfig = CONFIG.ui): BootState {
  const n = BOOT_LINES.length;
  const lines = Math.max(0, Math.min(n, Math.floor(t / cfg.bootLineSeconds)));
  const bars = BOOT_BARS.map((b) => Math.max(0, Math.min(1, (lines - b.line + 2) / 3)));
  return { lines, bars, done: t >= n * cfg.bootLineSeconds + cfg.bootHoldSeconds };
}

/** A log line padded with leader dots to `width` characters before its status. */
export function bootLineText(l: BootLine, width = 40): { label: string; dots: string } {
  return { label: l.label, dots: '.'.repeat(Math.max(3, width - l.label.length)) };
}
