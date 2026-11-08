import { createRng } from '../core/rng';

/** How the extraction goes (exactly one per run, M8+ Phase F). */
export type ExtractionTwist = 'kestrelAbort' | 'quarryOverrun' | 'holdTheLine';

/** Side events (2–4 per run). */
export type SideEvent =
  | 'clinicAssault'
  | 'mortar'
  | 'downedPilot'
  | 'hvt'
  | 'bus'
  | 'wounded'
  | 'fog'
  | 'jam'
  | 'manpadsAmbush';

export type TwistId = ExtractionTwist | SideEvent;

/** What a run rolled: its seed, the extraction twist and the side events. */
export interface TwistRoll {
  readonly seed: number;
  readonly extraction: ExtractionTwist;
  readonly side: readonly SideEvent[];
}

/** Weights for the extraction twist (they sum to 100). */
export const EXTRACTION_CHANCE: Readonly<Record<ExtractionTwist, number>> = {
  kestrelAbort: 45,
  quarryOverrun: 35,
  holdTheLine: 20,
};

/** Each side event's chance (0–1), and events that never roll together. */
export const SIDE_CHANCE: Readonly<Record<SideEvent, number>> = {
  clinicAssault: 0.6,
  mortar: 0.5,
  downedPilot: 0.25,
  hvt: 0.35,
  bus: 0.4,
  wounded: 0.3,
  fog: 0.2,
  jam: 0.2,
  manpadsAmbush: 0.4,
};

/** Pairs that would be too much (or don't fit) together. */
export const CONFLICTS: readonly (readonly [SideEvent, SideEvent])[] = [
  ['fog', 'jam'], // both blunt the guns: one at a time
  ['hvt', 'bus'], // both are crossroads traffic
];

export const MIN_SIDE = 2;
export const MAX_SIDE = 4;

/** What the end screen calls each event. */
export const TWIST_LABELS: Readonly<Record<TwistId, string>> = {
  kestrelAbort: 'Kestrel abort',
  quarryOverrun: 'LZ overrun',
  holdTheLine: 'Hold the line',
  clinicAssault: 'Clinic assault',
  mortar: 'Mortar team',
  downedPilot: 'Downed pilot',
  hvt: 'High-value target',
  bus: 'Civilian bus',
  wounded: 'Wounded operator',
  fog: 'Fog bank',
  jam: '105 mm jam',
  manpadsAmbush: 'MANPADS ambush',
};

const SIDE_ORDER = Object.keys(SIDE_CHANCE) as SideEvent[];
const EXTRACTIONS = Object.keys(EXTRACTION_CHANCE) as ExtractionTwist[];

function conflicts(a: SideEvent, b: SideEvent): boolean {
  return CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/**
 * Rolls a run's events from its seed (M8+ Phase F), deterministic: one extraction twist by
 * weight, then each side event by its own chance, never two that conflict, topped up to
 * `MIN_SIDE` and trimmed to `MAX_SIDE`. `forced` (dev `?twist=`) puts events in first.
 */
export function rollTwists(seed: number, forced: readonly string[] = []): TwistRoll {
  const rng = createRng(seed);
  const forcedExtraction = EXTRACTIONS.find((e) => forced.includes(e));
  let extraction: ExtractionTwist = forcedExtraction ?? EXTRACTIONS[0];
  const pick = rng() * 100;
  if (!forcedExtraction) {
    let acc = 0;
    for (const e of EXTRACTIONS) {
      acc += EXTRACTION_CHANCE[e];
      if (pick < acc) {
        extraction = e;
        break;
      }
    }
  }

  const side: SideEvent[] = [];
  const add = (e: SideEvent) => {
    if (!side.includes(e) && !side.some((s) => conflicts(s, e))) side.push(e);
  };
  for (const e of SIDE_ORDER) if (forced.includes(e)) add(e);
  // Every event gets its own roll (drawn in a fixed order, so a seed always gives the same run).
  const rolls = SIDE_ORDER.map((e) => ({ e, r: rng() }));
  for (const { e, r } of rolls) if (r < SIDE_CHANCE[e]) add(e);
  // Too few: add the ones that came closest to rolling. Too many: keep forced ones, then random.
  const byCloseness = [...rolls].sort((a, b) => a.r / SIDE_CHANCE[a.e] - b.r / SIDE_CHANCE[b.e]);
  for (const { e } of byCloseness) {
    if (side.length >= MIN_SIDE) break;
    add(e);
  }
  while (side.length > MAX_SIDE) {
    const removable = side.filter((e) => !forced.includes(e));
    if (removable.length === 0) break;
    side.splice(side.indexOf(removable[Math.floor(rng() * removable.length)]), 1);
  }
  return { seed, extraction, side };
}

/** The events of a run, for the end screen: `Kestrel abort · Mortar team · …`. */
export function describeRoll(r: TwistRoll): string {
  return [r.extraction, ...r.side].map((t) => TWIST_LABELS[t]).join(' · ');
}

/** `?twist=mortar,kestrelAbort` → the known ids in it (dev builds). */
export function twistsFromUrl(search: string): string[] {
  const v = new URLSearchParams(search).get('twist');
  if (!v) return [];
  const known = new Set<string>([...EXTRACTIONS, ...SIDE_ORDER]);
  return v.split(',').filter((x) => known.has(x));
}

/** `?seed=1234` → that seed, else null. */
export function seedFromUrl(search: string): number | null {
  const v = new URLSearchParams(search).get('seed');
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
