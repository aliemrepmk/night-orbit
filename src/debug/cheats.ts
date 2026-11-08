/**
 * Dev cheats (PLAN.md §7.18): `G` god mode for the team, `N` skip to the next phase, `K` kill
 * every enemy, `[` / `]` time scale down / up. Only in dev builds or with `?debug=1`.
 */
export type Cheat = 'god' | 'skipPhase' | 'killAll' | 'slower' | 'faster';

export const CHEAT_KEYS: Readonly<Record<string, Cheat>> = {
  KeyG: 'god',
  KeyN: 'skipPhase',
  KeyK: 'killAll',
  BracketLeft: 'slower',
  BracketRight: 'faster',
};

/** The time scales the cheat steps through. */
export const TIME_SCALES: readonly number[] = [0.25, 1, 4];

/** One step slower (`dir` −1) or faster (+1), clamped at the ends. */
export function nextTimeScale(current: number, dir: -1 | 1): number {
  let i = TIME_SCALES.indexOf(current);
  if (i < 0) i = TIME_SCALES.indexOf(1);
  return TIME_SCALES[Math.max(0, Math.min(TIME_SCALES.length - 1, i + dir))];
}

/** Valid `?phase=` values pass through; anything else starts from the beginning. */
export function phaseFromUrl(search: string, phases: readonly string[]): string | undefined {
  const p = new URLSearchParams(search).get('phase');
  return p && phases.includes(p) ? p : undefined;
}
