import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { MAP } from './MapData';
import type { MapData } from './mapTypes';
import { Terrain } from './Terrain';
import { mapHeightField } from './terrainShape';

const h = mapHeightField(MAP);

describe('mapHeightField', () => {
  it('is deterministic', () => {
    const again = mapHeightField(MAP);
    for (const [x, z] of [
      [0, 0],
      [-400, 200],
      [600, -700],
    ])
      expect(again(x, z)).toBe(h(x, z));
  });

  it('levels the village and the quarry floor', () => {
    for (const f of MAP.flats) {
      const c = h(f.center[0], f.center[1]);
      for (let a = 0; a < 6; a++) {
        const r = f.radius * 0.7;
        const x = f.center[0] + Math.cos(a) * r;
        const z = f.center[1] + Math.sin(a) * r;
        const nearRoadOrStream = Math.abs(x - -225) < 20; // the stream crosses no flat, but be safe
        if (!nearRoadOrStream) expect(Math.abs(h(x, z) - c)).toBeLessThan(0.6);
      }
    }
  });

  it('keeps roads level across their width', () => {
    for (const road of MAP.roads) {
      const [ax, az] = road.points[0];
      const [bx, bz] = road.points[1];
      const len = Math.hypot(bx - ax, bz - az);
      // Midpoint of the first segment, and the two road edges either side of it.
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const nx = -(bz - az) / len;
      const nz = (bx - ax) / len;
      const w = road.width / 2;
      expect(Math.abs(h(mx + nx * w, mz + nz * w) - h(mx - nx * w, mz - nz * w))).toBeLessThan(0.3);
    }
  });

  it('cuts the stream below its banks', () => {
    const [x, z] = MAP.stream.points[3]; // [-240, 0]
    const bank = (h(x - 20, z) + h(x + 20, z)) / 2;
    expect(bank - h(x, z)).toBeGreaterThan(MAP.stream.depth * 0.6);
  });

  it('keeps the stream shallow at the bridge, so a squad wider than the deck stays dry', () => {
    const b = MAP.bridges[0];
    const bank = h(b.at[0] - 30, b.at[1] - 20);
    for (const dz of [-6, -3, 0, 3, 6]) {
      expect(bank - h(b.at[0], b.at[1] + dz)).toBeLessThan(0.5);
    }
  });

  it('rises into mountains outside the valley', () => {
    const valley = h(0, 0);
    expect(h(1500, 0) - valley).toBeGreaterThan(MAP.terrain.valleyRise * 0.6);
    expect(h(0, -1500) - valley).toBeGreaterThan(MAP.terrain.valleyRise * 0.6);
  });

  it('feeds Terrain, which records its highest point for ray marching', () => {
    const flatMap: MapData = { ...MAP, terrain: { ...MAP.terrain, hillHeight: 0, valleyRise: 0 } };
    const t = new Terrain({ ...CONFIG.terrain, size: 400, cellSize: 10 }, mapHeightField(flatMap));
    expect(t.maxHeight).toBeCloseTo(0, 5);
    const hilly = new Terrain(CONFIG.terrain, h);
    expect(hilly.maxHeight).toBeGreaterThan(MAP.terrain.valleyRise * 0.8);
    expect(hilly.heightAt(0, 40)).toBeCloseTo(h(0, 40), 1);
  });
});
