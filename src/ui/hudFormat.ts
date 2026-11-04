import type { FailReason } from '../core/events';
import type { WeaponStatus } from '../gunship/Weapons';
import type { FireMode } from '../gunship/weaponDefs';

/** What the HUD needs to know about one gun. */
export interface GunReadout {
  readonly label: string;
  readonly fireMode: FireMode;
  readonly status: WeaponStatus;
  readonly rounds: number;
  readonly capacity: number;
  /** Barrel heat 0–1 (auto weapons). */
  readonly heat: number;
  /** Seconds left on the reload / overheat cooldown. */
  readonly reloadLeft: number;
}

const BAR = 8;

/** Countdown seconds rounded UP to 0.1 s, so a gun never reads 0.0 while still loading. */
export function countdown(seconds: number): string {
  return (Math.ceil(seconds * 10 - 1e-9) / 10).toFixed(1);
}

/** A text bar like ▮▮▮▯▯▯▯▯ for a 0–1 value. */
export function bar(value: number, cells = BAR): string {
  const n = Math.round(Math.min(1, Math.max(0, value)) * cells);
  return '▮'.repeat(n) + '▯'.repeat(cells - n);
}

/**
 * One HUD line per gun, e.g. `▶ 25MM  HEAT ▮▮▮▯▯▯▯▯`, `  40MM  ■■■□□`, `  105MM LOADING 3.2`.
 * The selected gun is marked with ▶. Labels are padded so the status columns line up.
 */
export function gunLine(g: GunReadout, selected: boolean): string {
  const mark = selected ? '▶' : ' ';
  const label = g.label.padEnd(6);
  let status: string;
  if (g.status === 'overheated') status = `OVERHEAT ${countdown(g.reloadLeft)}`;
  else if (g.status === 'reloading')
    status = `${g.fireMode === 'single' ? 'LOADING' : 'RELOAD'} ${countdown(g.reloadLeft)}`;
  else if (g.fireMode === 'auto') status = `HEAT ${bar(g.heat)}`;
  else if (g.fireMode === 'single') status = 'READY';
  else status = '■'.repeat(g.rounds) + '□'.repeat(g.capacity - g.rounds);
  return `${mark} ${label}${status}`;
}

/** Ridgeback's health line, e.g. `RIDGEBACK ▮▮▮▮▮▮▮▮▯▯  82%  UNDER FIRE` (PLAN.md §7.16). */
export function teamLine(health: number, max: number, underFire: boolean): string {
  const f = Math.min(1, Math.max(0, health / max));
  // Round up so the bar never reads 0% while the team is still standing.
  const pct = String(Math.ceil(f * 100 - 1e-9)).padStart(3);
  return `RIDGEBACK ${bar(f, 10)} ${pct}%${underFire ? '  UNDER FIRE' : ''}`;
}

/** What the fail screen says for each way the mission can be lost. */
export function failReasonText(reason: FailReason): string {
  switch (reason) {
    case 'friendly_fire':
      return 'FRIENDLY FIRE: YOU HIT RIDGEBACK';
    case 'team_overrun':
      return 'RIDGEBACK OVERRUN';
  }
}
