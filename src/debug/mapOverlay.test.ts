import { describe, expect, it } from 'vitest';
import { MAP } from '../world/MapData';
import { ZONE_TOUR, formatPlacement, mapOverlay, nextTourStop } from './mapOverlay';

describe('mapOverlay', () => {
  const shapes = mapOverlay(MAP, [{ x: 1, z: 2 }], 16);

  it('draws every zone as a labeled circle of the right radius', () => {
    const zones = shapes.filter((s) => s.kind === 'zone');
    expect(zones.map((z) => z.label).sort()).toEqual([
      'CROSSROADS',
      'FIELDS',
      'FOREST',
      'LZ',
      'OP',
      'VILLAGE',
    ]);
    const lz = zones.find((z) => z.label === 'LZ')!;
    expect(lz.points).toHaveLength(16);
    for (const [x, z] of lz.points) {
      expect(Math.hypot(x - MAP.zones.lz.center[0], z - MAP.zones.lz.center[1])).toBeCloseTo(
        MAP.zones.lz.radius,
      );
    }
  });

  it('includes every road, route, enemy path and vehicle path, labeled by id', () => {
    const labels = new Set(shapes.map((s) => s.label));
    for (const r of MAP.roads) expect(labels.has(r.id)).toBe(true);
    for (const id of MAP.routeOrder) expect(labels.has(id)).toBe(true);
    for (const id of Object.keys(MAP.enemyPaths)) expect(labels.has(id)).toBe(true);
    for (const id of Object.keys(MAP.vehiclePaths)) expect(labels.has(id)).toBe(true);
  });

  it('draws spawn and cover points as dots', () => {
    const spawn = shapes.find((s) => s.kind === 'spawn')!;
    expect(spawn.dots).toBe(true);
    expect(spawn.points.length).toBe(Object.values(MAP.spawnPoints).flat().length);
    expect(shapes.find((s) => s.kind === 'cover')!.points).toEqual([[1, 2]]);
  });
});

describe('formatPlacement', () => {
  it('rounds to whole meters, ready to paste into MapData', () => {
    expect(formatPlacement(-123.4, 456.6)).toBe('[-123, 457]');
    expect(formatPlacement(-0.2, 0.4)).toBe('[0, 0]');
  });
});

describe('zone tour (F3)', () => {
  it('visits every zone west to east, then hands the orbit back to the team', () => {
    const seen: string[] = [];
    let stop = nextTourStop(null);
    while (stop !== null) {
      seen.push(stop);
      stop = nextTourStop(stop);
    }
    expect(seen).toEqual([...ZONE_TOUR]);
    expect([...ZONE_TOUR].sort()).toEqual(Object.keys(MAP.zones).sort());
    // Along the journey (west to east), then the forest (the sawmill detour) last.
    const xs = ZONE_TOUR.slice(0, -1).map((z) => MAP.zones[z].center[0]);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(ZONE_TOUR[ZONE_TOUR.length - 1]).toBe('forest');
  });
});
