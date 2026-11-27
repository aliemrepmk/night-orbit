import { describe, expect, it } from 'vitest';
import { STRIKES } from '../gunship/airSupportDefs';
import { WEAPONS } from '../gunship/weaponDefs';
import { briefingMap, gridRef } from '../ui/briefingMap';
import { MAP } from '../world/MapData';
import { buildBriefing } from './briefing';

const b = buildBriefing(MAP);
const all = b.paragraphs.flatMap((p) => p.items.map(([, t]) => t)).join(' ');

describe('the briefing as a five-paragraph order (M10+)', () => {
  it('has the five paragraphs in order, then the ROE', () => {
    expect(b.paragraphs.map((p) => p.title)).toEqual([
      '1. SITUATION',
      '2. MISSION',
      '3. EXECUTION',
      '4. SUPPORT',
      '5. COMMAND & SIGNAL',
      'RULES OF ENGAGEMENT',
    ]);
    expect(b.paragraphs.map((p) => p.key)).toEqual(['1', '2', '3', '4', '5', 'ROE']);
    expect(b.paragraphs.filter((p) => p.roe).map((p) => p.key)).toEqual(['ROE']);
    for (const p of b.paragraphs) expect(p.items.length).toBeGreaterThan(0);
  });

  it('gives grid references that match the map sketch', () => {
    const grid = briefingMap(MAP).grid;
    for (const id of ['op', 'fields', 'village', 'crossroads', 'lz'] as const) {
      const [x, z] = MAP.zones[id].center;
      expect(all).toContain(gridRef(grid, x, z));
    }
    // Every reference in the text is a real square of the grid.
    for (const ref of all.match(/\b[A-HJ-NP-Z][1-9]\b/g) ?? []) {
      expect('ABCDEFGHJK'.slice(0, grid.cols)).toContain(ref[0]);
      expect(Number(ref.slice(1))).toBeLessThanOrEqual(grid.rows);
    }
  });

  it('quotes the game’s own numbers (danger close, rearm times, clip size)', () => {
    expect(all).toContain(`40 mm ${WEAPONS['40'].dangerClose} m`);
    expect(all).toContain(`105 mm ${WEAPONS['105'].dangerClose} m`);
    expect(all).toContain(`bomb ${STRIKES.bomb.dangerClose} m`);
    expect(all).toContain(`${STRIKES.gunrun.cooldown} s to rearm`);
    expect(all).toContain(`${WEAPONS['40'].capacity}-round clips`);
  });

  it('never gives the extraction twists away', () => {
    expect(all).not.toMatch(/overrun|diverting|held up|delayed|breaking off/i);
  });
});
