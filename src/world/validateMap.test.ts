import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { MAP } from './MapData';
import type { MapData } from './mapTypes';
import {
  crossings,
  distanceToPolyline,
  inRect,
  rectsOverlap,
  samplePolyline,
  validateMap,
  wallRects,
} from './validateMap';

const SIZE = CONFIG.map.size;
const check = (m: MapData) => validateMap(m, SIZE);
const some = (errors: string[], text: string) => errors.some((e) => e.includes(text));

describe('the handcrafted map', () => {
  it('is valid', () => {
    expect(check(MAP)).toEqual([]);
  });

  it('has a village of about 25 houses, one protected clinic, and every zone', () => {
    const houses = MAP.buildings.filter((b) => b.kind === 'house' && b.id.startsWith('v_'));
    expect(houses.length).toBeGreaterThanOrEqual(25);
    expect(MAP.buildings.filter((b) => b.protected).map((b) => b.id)).toEqual(['clinic']);
    expect(Object.keys(MAP.zones).sort()).toEqual(['crossroads', 'fields', 'lz', 'op', 'village']);
  });

  it('runs Ridgeback from the OP to the LZ', () => {
    const first = MAP.friendlyRoutes[MAP.routeOrder[0]][0];
    const lastRoute = MAP.friendlyRoutes[MAP.routeOrder[MAP.routeOrder.length - 1]];
    const last = lastRoute[lastRoute.length - 1];
    const near = (p: readonly [number, number], z: keyof typeof MAP.zones) =>
      Math.hypot(p[0] - MAP.zones[z].center[0], p[1] - MAP.zones[z].center[1]) <=
      MAP.zones[z].radius;
    expect(near(first, 'op')).toBe(true);
    expect(near(last, 'lz')).toBe(true);
  });

  it('gives the LZ three approach paths', () => {
    expect(Object.values(MAP.enemyPaths).filter((p) => p.zone === 'lz')).toHaveLength(3);
  });
});

describe('validateMap catches mistakes', () => {
  it('points outside the map', () => {
    const m = {
      ...MAP,
      props: [...MAP.props, { kind: 'hay' as const, pos: [900, 0] as const, rot: 0 }],
    };
    expect(some(check(m), 'outside the map')).toBe(true);
  });

  it('a building on a road', () => {
    const m: MapData = {
      ...MAP,
      buildings: [
        ...MAP.buildings,
        { id: 'oops', kind: 'house', pos: [-60, 62], rot: 0, size: [8, 8] },
      ],
    };
    expect(some(check(m), 'building oops is on road main_road')).toBe(true);
  });

  it('overlapping buildings and duplicate ids', () => {
    const b = MAP.buildings.find((x) => x.id === 'v_w1')!;
    const m: MapData = {
      ...MAP,
      buildings: [...MAP.buildings, { ...b, pos: [b.pos[0] + 3, b.pos[1]] }],
    };
    const errors = check(m);
    expect(some(errors, 'is used twice')).toBe(true);
    expect(some(errors, 'overlaps')).toBe(true);
  });

  it('a missing or unprotected clinic', () => {
    const noClinic: MapData = {
      ...MAP,
      buildings: MAP.buildings.filter((b) => b.kind !== 'clinic'),
    };
    expect(some(check(noClinic), 'exactly one clinic')).toBe(true);
    const unprotected: MapData = {
      ...MAP,
      buildings: MAP.buildings.map((b) => (b.kind === 'clinic' ? { ...b, protected: false } : b)),
    };
    expect(some(check(unprotected), 'not marked protected')).toBe(true);
  });

  it('unknown or disconnected routes', () => {
    expect(
      some(check({ ...MAP, routeOrder: [...MAP.routeOrder, 'nowhere'] }), 'unknown route'),
    ).toBe(true);
    const order = [...MAP.routeOrder];
    [order[1], order[2]] = [order[2], order[1]];
    expect(some(check({ ...MAP, routeOrder: order }), 'not where')).toBe(true);
  });

  it('spawn points inside buildings', () => {
    const clinic = MAP.buildings.find((b) => b.kind === 'clinic')!;
    const m: MapData = { ...MAP, spawnPoints: { ...MAP.spawnPoints, village: [clinic.pos] } };
    expect(some(check(m), 'inside building clinic')).toBe(true);
  });

  it('vehicle paths that leave the roads', () => {
    const m: MapData = {
      ...MAP,
      vehiclePaths: {
        ...MAP.vehiclePaths,
        cross_country: [
          [0, 300],
          [200, 300],
        ],
      },
    };
    expect(some(check(m), 'vehicle path cross_country leaves the road')).toBe(true);
  });

  it('a road crossing the stream without a bridge', () => {
    expect(some(check({ ...MAP, bridges: [] }), 'without a bridge')).toBe(true);
  });
});

describe('map geometry helpers', () => {
  it('tests points against rotated rectangles', () => {
    const r = { x: 10, z: 0, rot: Math.PI / 2, hw: 5, hd: 1 };
    // Rotated 90°: long along z.
    expect(inRect(r, 10, 4)).toBe(true);
    expect(inRect(r, 14, 0)).toBe(false);
  });

  it('detects rectangle overlap with the separating-axis test', () => {
    const a = { x: 0, z: 0, rot: 0, hw: 2, hd: 2 };
    expect(rectsOverlap(a, { x: 3.5, z: 0, rot: 0, hw: 2, hd: 2 })).toBe(true);
    expect(rectsOverlap(a, { x: 4.5, z: 0, rot: 0, hw: 2, hd: 2 })).toBe(false);
    // A diamond whose corner pokes in.
    expect(rectsOverlap(a, { x: 4.5, z: 0, rot: Math.PI / 4, hw: 2, hd: 2 })).toBe(true);
  });

  it('turns walls into one rect per segment, long along the segment', () => {
    const [r] = wallRects({
      kind: 'wall',
      points: [
        [0, 0],
        [0, 20],
      ],
      height: 2,
      thickness: 1,
    });
    expect(inRect(r, 0, 18)).toBe(true);
    expect(inRect(r, 2, 10)).toBe(false);
  });

  it('samples polylines, measures distance to them and finds crossings', () => {
    const line = [
      [0, 0],
      [10, 0],
    ] as const;
    expect(samplePolyline(line, 1)).toHaveLength(11);
    expect(distanceToPolyline(line, 5, 3)).toBeCloseTo(3);
    expect(distanceToPolyline(line, 13, 4)).toBeCloseTo(5);
    expect(
      crossings(line, [
        [5, -5],
        [5, 5],
      ]),
    ).toEqual([[5, 0]]);
  });
});
