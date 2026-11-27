import { CONFIG } from '../config';
import type { FailReason } from '../core/events';
import type { WeaponStatus } from '../gunship/Weapons';
import { WEAPONS, type OrdnanceId, type StrikeId, type WeaponId } from '../gunship/weaponDefs';
import type { MissionSummary, Rating, RatingBreakdown } from '../mission/stats';
import { formatDuration } from '../mission/stats';
import { failReasonText } from './hudFormat';

/**
 * The words and numbers of the mission-systems screens (M10+): the HOLD status card, the
 * MISSION ABORTED incident report and the AFTER-ACTION REPORT. Pure; `Screens` only lays
 * them out. Tones pick the color: `go` green, `warn` amber, `bad` red.
 */
export type Tone = 'go' | 'warn' | 'bad' | 'plain';

export interface Row {
  readonly label: string;
  readonly value: string;
  readonly tone: Tone;
}

/** A segmented gauge: `filled` of 10 cells. */
export interface Gauge extends Row {
  readonly filled: number;
}

/** Each mission phase as the screens name it (start point, phase lines, landing zones). */
export const PHASE_NAMES: Readonly<Record<string, string>> = {
  calibration: 'SP · CALIBRATION',
  fields: 'PL 1 · FIELDS',
  village: 'PL 2 · VILLAGE',
  vehicles: 'PL 3 · CROSSROADS',
  extraction: 'LZ QUARRY',
  forest: 'BLACK PINE · LZ SAWMILL',
};

export function phaseName(id: string | undefined): string {
  return (id && PHASE_NAMES[id]) || (id ?? '').toUpperCase();
}

/** `T+ 06:41` (mission time; minutes always two digits). */
export function missionTime(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  const m = Math.floor(t / 60);
  return `T+ ${String(m).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** 0–1 → 0–10 filled cells (any health at all shows at least one cell). */
export function cells(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return f > 0 ? Math.max(1, Math.round(f * 10)) : 0;
}

/** Green above `good`, amber above `low`, red below. */
function healthTone(f: number, good = 0.6, low = 0.3): Tone {
  return f >= good ? 'go' : f >= low ? 'warn' : 'bad';
}

/** Everything the HOLD screen reads from the running game. */
export interface HoldSnapshot {
  readonly objective: string;
  readonly phase: string | undefined;
  readonly seconds: number;
  /** Ridgeback and hull health, 0–1. */
  readonly team: number;
  readonly hull: number;
  readonly guns: Readonly<
    Record<WeaponId, { status: WeaponStatus; heat: number; rounds: number; capacity: number }>
  >;
  readonly flares: number;
  /** Seconds until each strike is ready again (0 = ready). */
  readonly strikeCooldown: Readonly<Record<StrikeId, number>>;
}

export interface HoldStatus {
  readonly objective: string;
  readonly phase: string;
  readonly time: string;
  readonly gauges: readonly Gauge[];
  readonly systems: readonly Row[];
}

function gunState(status: WeaponStatus): { value: string; tone: Tone } {
  switch (status) {
    case 'ready':
      return { value: 'READY', tone: 'go' };
    case 'overheated':
      return { value: 'OVERHEAT', tone: 'bad' };
    case 'reloading':
      return { value: 'RELOADING', tone: 'warn' };
    case 'cycling':
      return { value: 'CYCLING', tone: 'plain' };
  }
}

/** The HOLD screen's status card. */
export function holdStatus(s: HoldSnapshot): HoldStatus {
  const g25 = s.guns['25'];
  const g40 = s.guns['40'];
  const strike = (id: StrikeId): Row => {
    const left = s.strikeCooldown[id];
    return {
      label: id === 'gunrun' ? 'GUN RUN' : 'BOMB',
      value: left > 0 ? `REARM ${formatDuration(Math.ceil(left))}` : 'READY',
      tone: left > 0 ? 'warn' : 'go',
    };
  };
  return {
    objective: s.objective.toUpperCase(),
    phase: phaseName(s.phase),
    time: missionTime(s.seconds),
    gauges: [
      {
        label: 'RIDGEBACK',
        filled: cells(s.team),
        value: `${Math.round(s.team * 100)}%`,
        tone: healthTone(s.team),
      },
      {
        label: 'HULL',
        filled: cells(s.hull),
        value: `${Math.round(s.hull * 100)}%`,
        tone: healthTone(s.hull),
      },
      {
        label: '25 MM HEAT',
        filled: cells(g25.heat),
        value: g25.status === 'overheated' ? 'OVHT' : `${Math.round(g25.heat * 100)}%`,
        tone: g25.status === 'overheated' ? 'bad' : g25.heat > 0.75 ? 'warn' : 'plain',
      },
      {
        label: '40 MM CLIP',
        filled: cells(g40.capacity > 0 ? g40.rounds / g40.capacity : 0),
        value: `${g40.rounds}/${g40.capacity}`,
        tone: g40.status === 'reloading' ? 'warn' : 'plain',
      },
    ],
    systems: [
      { label: '105 MM', ...gunState(s.guns['105'].status) },
      {
        label: 'FLARES',
        value: `${s.flares} / ${CONFIG.airDefense.flares}`,
        tone: s.flares === 0 ? 'bad' : s.flares <= 2 ? 'warn' : 'plain',
      },
      strike('gunrun'),
      strike('bomb'),
    ],
  };
}

/** What the MISSION ABORTED screen needs to know about the moment it happened. */
export interface IncidentInput {
  readonly reason: FailReason;
  readonly phase: string | undefined;
  /** The grid square of Ridgeback (or of the incident) on the briefing map. */
  readonly grid: string;
  readonly seconds: number;
  readonly team: number;
  readonly lastCall: { readonly speaker: string; readonly text: string } | null;
}

export interface IncidentReport {
  readonly title: string;
  readonly rows: readonly Row[];
  readonly tip: string;
}

/** One practical tip per way to fail. */
export const FAIL_TIPS: Readonly<Record<FailReason, string>> = {
  team_overrun: `Break groups up before they reach the team. The 105 mm is safe beyond ${WEAPONS['105'].dangerClose} m, the 40 mm beyond ${WEAPONS['40'].dangerClose} m.`,
  friendly_fire:
    'Find the strobes before you fire. Step down to the 40 mm or 25 mm when the enemy is close to Ridgeback.',
  clinic_hit: 'Near the clinic, use the 25 mm or 40 mm: the 105 mm and strikes reach too far.',
  helicopter_friendly_fire:
    'Once Kestrel 6 is low over the LZ, hold the heavy guns and work the edges with the 25 mm.',
  helicopter_lost:
    'Clear the LZ and its approaches before Kestrel 6 arrives: the 30 s warning is your cue.',
  gunship_lost:
    'Kill triple-A first, and press X as soon as the missile warning sounds: late flares miss.',
  civilian_hit: 'Let the bus pass before you fire on the main road.',
};

export function incidentReport(i: IncidentInput): IncidentReport {
  const rows: Row[] = [
    { label: 'LOCATION', value: `${phaseName(i.phase)} · ${i.grid}`, tone: 'plain' },
    { label: 'TIME', value: missionTime(i.seconds), tone: 'plain' },
    {
      label: 'RIDGEBACK',
      value: i.team > 0 ? `${Math.round(i.team * 100)}%` : '0% · NO CONTACT',
      tone: healthTone(i.team),
    },
  ];
  if (i.lastCall) {
    rows.push({
      label: 'LAST CALL',
      value: `${i.lastCall.speaker}: “${i.lastCall.text}”`,
      tone: 'plain',
    });
  }
  return { title: failReasonText(i.reason), rows, tip: FAIL_TIPS[i.reason] };
}

/** The stats rows shared by both end screens (the record so far / in full). */
export function recordRows(s: MissionSummary): Row[] {
  return [
    { label: 'KILLS', value: String(s.kills), tone: 'plain' },
    {
      label: 'ACCURACY',
      value: s.impacts > 0 ? `${Math.round(s.accuracy * 100)}%  (${s.hits}/${s.impacts})` : '--',
      tone: 'plain',
    },
    { label: 'DAMAGE TAKEN', value: String(Math.round(s.damageTaken)), tone: 'plain' },
    {
      label: 'DANGER CLOSE',
      value: String(s.dangerClose),
      tone: s.dangerClose > 0 ? 'warn' : 'plain',
    },
    { label: 'TIME', value: formatDuration(s.seconds), tone: 'plain' },
  ];
}

/** Everything the AFTER-ACTION REPORT shows besides the summary. */
export interface AfterActionInput {
  readonly summary: MissionSummary;
  readonly rating: Rating;
  readonly breakdown: RatingBreakdown;
  readonly killsBy: Readonly<Record<OrdnanceId, number>>;
  readonly shots: Readonly<Record<WeaponId, number>>;
  readonly strikes: Readonly<Record<StrikeId, number>>;
  /** Ridgeback's lowest health (0–1) and the hull at the end (0–1). */
  readonly teamLowest: number;
  readonly hull: number;
}

export interface AfterAction {
  readonly grade: string;
  readonly label: string;
  readonly score: string;
  readonly breakdown: readonly Row[];
  /** Kills per weapon, with each bar's length relative to the best one (0–1). */
  readonly weapons: readonly { label: string; kills: number; share: number }[];
  readonly engagement: readonly Row[];
  readonly outcome: readonly Row[];
}

const signed = (v: number) => {
  const r = Math.round(v);
  return r > 0 ? `+${r}` : r < 0 ? `−${-r}` : '0';
};

export function afterAction(a: AfterActionInput): AfterAction {
  const b = a.breakdown;
  const s = a.summary;
  const breakdown: Row[] = [
    { label: 'BASE', value: '100', tone: 'plain' },
    {
      label: 'RIDGEBACK DAMAGE',
      value: signed(-b.damage),
      tone: b.damage > 0.5 ? 'warn' : 'plain',
    },
    { label: 'DANGER CLOSE', value: signed(-b.danger), tone: b.danger > 0.5 ? 'warn' : 'plain' },
    { label: 'TIME OVER PAR', value: signed(-b.time), tone: b.time > 0.5 ? 'warn' : 'plain' },
    {
      label: 'ACCURACY',
      value: signed(b.accuracy),
      tone: b.accuracy > 0.5 ? 'go' : b.accuracy < -0.5 ? 'warn' : 'plain',
    },
  ];
  if (b.bonus > 0) {
    const names = (s.bonuses ?? []).join(', ').toUpperCase();
    breakdown.push({ label: `BONUS · ${names}`, value: signed(b.bonus), tone: 'go' });
  }
  const k = a.killsBy;
  const weaponKills = [
    { label: '25 MM', kills: k['25'] },
    { label: '40 MM', kills: k['40'] },
    { label: '105 MM', kills: k['105'] },
    { label: 'STRIKES', kills: k.gunrun + k.bomb },
  ];
  const best = Math.max(1, ...weaponKills.map((w) => w.kills));
  const n = (v: number) => v.toLocaleString('en-US');
  const par = CONFIG.rating.parSeconds;
  return {
    grade: a.rating.grade,
    label: a.rating.label,
    score: `SCORE ${a.rating.score} / 100`,
    breakdown,
    weapons: weaponKills.map((w) => ({ ...w, share: w.kills / best })),
    engagement: [
      {
        label: 'SHOTS',
        value: `25 MM ${n(a.shots['25'])} · 40 MM ${n(a.shots['40'])} · 105 MM ${n(a.shots['105'])}`,
        tone: 'plain',
      },
      {
        label: 'ACCURACY',
        value: s.impacts > 0 ? `${Math.round(s.accuracy * 100)}%` : '--',
        tone: 'plain',
      },
      {
        label: 'STRIKES',
        value: `${a.strikes.gunrun} GUN RUN · ${a.strikes.bomb} BOMB`,
        tone: 'plain',
      },
    ],
    outcome: [
      { label: 'RIDGEBACK DAMAGE', value: String(Math.round(s.damageTaken)), tone: 'plain' },
      {
        label: 'LOWEST TEAM HEALTH',
        value: `${Math.round(a.teamLowest * 100)}%`,
        tone: healthTone(a.teamLowest),
      },
      {
        label: 'DANGER CLOSE',
        value: String(s.dangerClose),
        tone: s.dangerClose > 0 ? 'warn' : 'plain',
      },
      { label: 'HULL', value: `${Math.round(a.hull * 100)}%`, tone: healthTone(a.hull) },
      {
        label: 'TIME',
        value: `${formatDuration(s.seconds)}  (PAR ${formatDuration(par)})`,
        tone: s.seconds > par ? 'warn' : 'go',
      },
    ],
  };
}

/** A mission timeline entry: when a phase began, or how the run ended. */
export interface TimelineEntry {
  readonly time: string;
  readonly text: string;
  readonly tone: Tone;
}

/**
 * The run as a timeline: each phase's start (from the phase log `Game` keeps), then the end
 * (`ended` = the final line, e.g. "RIDGEBACK ABOARD · WHEELS UP").
 */
export function timeline(
  phases: readonly { id: string; at: number }[],
  end: { at: number; text: string; tone: Tone },
): TimelineEntry[] {
  return [
    ...phases.map((p) => ({
      time: missionTime(p.at),
      text: phaseName(p.id),
      tone: 'plain' as Tone,
    })),
    { time: missionTime(end.at), text: end.text, tone: end.tone },
  ];
}
