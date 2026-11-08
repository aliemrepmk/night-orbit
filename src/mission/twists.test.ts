import { describe, expect, it } from 'vitest';
import {
  CONFLICTS,
  describeRoll,
  EXTRACTION_CHANCE,
  MAX_SIDE,
  MIN_SIDE,
  rollTwists,
  seedFromUrl,
  SIDE_CHANCE,
  twistsFromUrl,
  type SideEvent,
} from './twists';

describe('twist roll (M8+ Phase F: every run plays differently)', () => {
  it('is deterministic for a seed, and different seeds give different runs', () => {
    expect(rollTwists(42)).toEqual(rollTwists(42));
    const runs = new Set<string>();
    for (let s = 0; s < 40; s++) runs.add(describeRoll(rollTwists(s)));
    expect(runs.size).toBeGreaterThan(15);
  });

  it('always has one extraction twist and 2–4 side events, never two that conflict', () => {
    for (let s = 0; s < 500; s++) {
      const r = rollTwists(s);
      expect(Object.keys(EXTRACTION_CHANCE)).toContain(r.extraction);
      expect(r.side.length).toBeGreaterThanOrEqual(MIN_SIDE);
      expect(r.side.length).toBeLessThanOrEqual(MAX_SIDE);
      expect(new Set(r.side).size).toBe(r.side.length);
      for (const [a, b] of CONFLICTS) expect(r.side.includes(a) && r.side.includes(b)).toBe(false);
    }
  });

  it('rolls extraction twists by weight and side events near their chances', () => {
    const n = 4000;
    const ext: Record<string, number> = {};
    const side: Record<string, number> = {};
    for (let s = 0; s < n; s++) {
      const r = rollTwists(s * 7919 + 13);
      ext[r.extraction] = (ext[r.extraction] ?? 0) + 1;
      for (const e of r.side) side[e] = (side[e] ?? 0) + 1;
    }
    for (const [e, w] of Object.entries(EXTRACTION_CHANCE)) {
      expect(ext[e] / n).toBeCloseTo(w / 100, 1);
    }
    // Top-ups, trims and conflicts bend the chances a little; the order is kept.
    expect(side.clinicAssault / n).toBeGreaterThan(side.fog / n);
    for (const e of Object.keys(SIDE_CHANCE) as SideEvent[]) {
      expect(side[e] / n).toBeGreaterThan(SIDE_CHANCE[e] * 0.5);
      expect(side[e] / n).toBeLessThan(Math.min(1, SIDE_CHANCE[e] * 1.6));
    }
  });

  it('forced events (dev ?twist=) are always in, extraction and side', () => {
    for (let s = 0; s < 50; s++) {
      const r = rollTwists(s, ['quarryOverrun', 'mortar', 'jam']);
      expect(r.extraction).toBe('quarryOverrun');
      expect(r.side).toContain('mortar');
      expect(r.side).toContain('jam');
      expect(r.side).not.toContain('fog'); // conflicts with the forced jam
    }
  });

  it('reads ?seed= and ?twist= from the URL', () => {
    expect(seedFromUrl('?seed=1234')).toBe(1234);
    expect(seedFromUrl('?seed=abc')).toBeNull();
    expect(seedFromUrl('')).toBeNull();
    expect(twistsFromUrl('?twist=mortar,nonsense,kestrelAbort')).toEqual([
      'mortar',
      'kestrelAbort',
    ]);
  });

  it('describes a run for the end screen', () => {
    const text = describeRoll({ seed: 1, extraction: 'kestrelAbort', side: ['mortar', 'bus'] });
    expect(text).toBe('Kestrel abort · Mortar team · Civilian bus');
  });
});
