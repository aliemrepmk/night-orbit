import { describe, expect, it } from 'vitest';
import { MAP } from '../world/MapData';
import type { ZoneId } from '../world/mapTypes';
import { briefingMap, briefingSvg, fitViewBox, ZONE_LABELS } from './briefingMap';

describe('briefing map sketch', () => {
  const m = briefingMap(MAP);
  const [vx, vy, vw, vh] = m.viewBox.split(' ').map(Number);
  const inside = (x: number, y: number) => x >= vx && x <= vx + vw && y >= vy && y <= vy + vh;

  it('frames every zone (with its radius) and the whole route', () => {
    for (const z of m.zones) {
      expect(inside(z.x - z.r, z.y - z.r)).toBe(true);
      expect(inside(z.x + z.r, z.y + z.r)).toBe(true);
    }
    const nums = m.route.match(/-?\d+/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) expect(inside(nums[i], nums[i + 1])).toBe(true);
  });

  it('draws the route from the OP to the LZ, without repeated joints', () => {
    const op = MAP.zones.op.center;
    const lz = MAP.zones.lz.center;
    const pts = m.route
      .split(/[ML]/)
      .filter(Boolean)
      .map((p) => p.trim().split(' ').map(Number));
    const d = (p: number[], q: readonly number[]) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    expect(d(pts[0], op)).toBeLessThan(MAP.zones.op.radius);
    expect(d(pts[pts.length - 1], lz)).toBeLessThan(MAP.zones.lz.radius);
    for (let i = 1; i < pts.length; i++) expect(d(pts[i], pts[i - 1])).toBeGreaterThan(0);
  });

  it('labels every zone, has every road and the stream, and marks the clinic', () => {
    const svg = briefingSvg(m);
    for (const id of Object.keys(MAP.zones) as ZoneId[]) expect(svg).toContain(ZONE_LABELS[id]);
    expect(m.roads).toHaveLength(MAP.roads.length);
    expect(m.stream.startsWith('M')).toBe(true);
    const clinic = MAP.buildings.find((b) => b.kind === 'clinic')!;
    expect(m.clinic).toEqual({ x: clinic.pos[0], y: clinic.pos[1] });
    expect(svg).toContain('class="clinic"');
  });
});

describe('briefing map fills its frame (M8+ Phase A: map and text the same height)', () => {
  const b = { x: -100, y: -50, w: 400, h: 200 }; // 2:1

  it('matches the frame aspect exactly, keeping the center', () => {
    for (const aspect of [0.6, 1, 2, 3.5]) {
      const f = fitViewBox(b, aspect);
      expect(f.w / f.h).toBeCloseTo(aspect);
      expect(f.x + f.w / 2).toBeCloseTo(b.x + b.w / 2);
      expect(f.y + f.h / 2).toBeCloseTo(b.y + b.h / 2);
    }
  });

  it('only ever grows, so everything that had to be shown still is', () => {
    for (const aspect of [0.5, 1.2, 2, 5]) {
      const f = fitViewBox(b, aspect);
      expect(f.x).toBeLessThanOrEqual(b.x + 1e-9);
      expect(f.y).toBeLessThanOrEqual(b.y + 1e-9);
      expect(f.x + f.w).toBeGreaterThanOrEqual(b.x + b.w - 1e-9);
      expect(f.y + f.h).toBeGreaterThanOrEqual(b.y + b.h - 1e-9);
    }
  });

  it('leaves the box alone for a bad aspect (frame not laid out yet)', () => {
    expect(fitViewBox(b, 0)).toEqual(b);
    expect(fitViewBox(b, Number.NaN)).toEqual(b);
  });

  it('draws terrain detail so the extra space is the valley, not blank', () => {
    const m = briefingMap(MAP);
    expect(m.buildings).toHaveLength(MAP.buildings.length);
    expect(m.fields).toHaveLength(MAP.fields.length);
    expect(m.trees).toHaveLength(MAP.treeLines.length);
    const svg = briefingSvg(m);
    for (const cls of ['building', 'field', 'trees', 'walls'])
      expect(svg).toContain(`class="${cls}"`);
  });
});
