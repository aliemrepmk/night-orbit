import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { WEAPON_ORDER } from '../gunship/weaponDefs';

/** What the fail and complete screens show (PLAN.md §7.16). */
export interface MissionSummary {
  /** Enemies killed by the player's guns and air support. */
  readonly kills: number;
  /** Gun rounds that landed, and how many of them hurt at least one enemy. */
  readonly impacts: number;
  readonly hits: number;
  /** hits / impacts (0 when nothing was fired). */
  readonly accuracy: number;
  /** Ridgeback health lost to enemy fire over the whole mission. */
  readonly damageTaken: number;
  readonly dangerClose: number;
  /** Mission time in seconds. */
  readonly seconds: number;
  /** Bonus objectives achieved (M8+ Phase F: pilot rescued, HVT destroyed). */
  readonly bonuses?: readonly string[];
}

export interface Rating {
  readonly score: number;
  readonly grade: string;
  readonly label: string;
}

export type RatingConfig = {
  readonly [K in Exclude<keyof typeof CONFIG.rating, 'grades'>]: number;
} & { readonly grades: readonly { grade: string; min: number; label: string }[] };

const GUNS = new Set<string>(WEAPON_ORDER);

/**
 * Counts what the end screens need, from the event bus: kills, gun accuracy (an impact that
 * hurt an enemy is a hit; air strikes don't count toward accuracy) and danger-close impacts.
 * Damage taken and time come from the caller when the summary is made.
 */
export class MissionStats {
  kills = 0;
  impacts = 0;
  hits = 0;
  dangerClose = 0;

  constructor(bus: EventBus<GameEvents>) {
    bus.on('unitKilled', (e) => {
      if (e.by !== 'team') this.kills++;
    });
    bus.on('impact', (e) => {
      if (!GUNS.has(e.weapon)) return;
      this.impacts++;
      if (e.enemiesHit > 0) this.hits++;
    });
    bus.on('dangerClose', () => this.dangerClose++);
  }

  summary(damageTaken: number, seconds: number, bonuses: readonly string[] = []): MissionSummary {
    return {
      bonuses: [...bonuses],
      kills: this.kills,
      impacts: this.impacts,
      hits: this.hits,
      accuracy: this.impacts > 0 ? this.hits / this.impacts : 0,
      damageTaken,
      dangerClose: this.dangerClose,
      seconds,
    };
  }
}

/** The score (0–100, rounded) and grade for a completed mission. */
export function rateMission(s: MissionSummary, cfg: RatingConfig = CONFIG.rating): Rating {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const damage = Math.min(cfg.damageMax, s.damageTaken * cfg.damagePerPoint);
  const danger = Math.min(cfg.dangerCloseMax, s.dangerClose * cfg.perDangerClose);
  const accuracy =
    s.impacts > 0
      ? clamp((s.accuracy - cfg.accuracyPar) * cfg.accuracyScale, -cfg.accuracyMax, cfg.accuracyMax)
      : 0;
  const late = Math.max(0, s.seconds - cfg.parSeconds) / 60;
  const time = Math.min(cfg.timeMax, late * cfg.perMinuteOver);
  const bonus = (s.bonuses?.length ?? 0) * CONFIG.twists.bonusPoints;
  const score = Math.round(clamp(100 - damage - danger - time + accuracy + bonus, 0, 100));
  const g = cfg.grades.find((x) => score >= x.min) ?? cfg.grades[cfg.grades.length - 1];
  return { score, grade: g.grade, label: g.label };
}

/** `m:ss` (or `h:mm:ss` past an hour). */
export function formatDuration(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  const s = String(t % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** The stat rows of the end screens, as [label, value] pairs. */
export function summaryRows(s: MissionSummary): [string, string][] {
  return [
    ['KILLS', String(s.kills)],
    [
      'ACCURACY',
      s.impacts > 0 ? `${Math.round(s.accuracy * 100)}%  (${s.hits}/${s.impacts})` : '--',
    ],
    ['DAMAGE TAKEN', String(Math.round(s.damageTaken))],
    ['DANGER CLOSE', String(s.dangerClose)],
    ['TIME', formatDuration(s.seconds)],
    ...(s.bonuses && s.bonuses.length > 0
      ? ([['BONUS', s.bonuses.join(', ')]] as [string, string][])
      : []),
  ];
}
