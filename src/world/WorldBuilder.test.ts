import { Mesh, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Collision } from './Collision';
import { MAP } from './MapData';
import { Terrain } from './Terrain';
import { mapHeightField } from './terrainShape';
import { buildingRect, inRect, wallRects } from './validateMap';
import { WorldBuilder } from './WorldBuilder';

const terrain = new Terrain(CONFIG.terrain, mapHeightField(MAP));
const collision = new Collision(terrain, terrain.maxHeight + 2);
const world = new WorldBuilder(MAP, terrain, collision);

describe('WorldBuilder', () => {
  it('gives every building, wall segment, prop and bridge a collision box (+ the generator)', () => {
    const wallSegments = MAP.walls.reduce((n, w) => n + w.points.length - 1, 0);
    const expected =
      MAP.buildings.length + 1 + wallSegments + MAP.props.length + MAP.bridges.length;
    expect(collision.boxes).toHaveLength(expected);
  });

  it('regression: draws every instance (no pool overflows) and a roof on every house', () => {
    expect(world.droppedInstances).toBe(0);
    expect(world.roofCount).toBe(MAP.buildings.filter((b) => b.kind === 'house').length);
  });

  it('builds the forest and finds the fuel depot tanks (M8+ Phase D)', () => {
    expect(world.forestTreeCount).toBeGreaterThan(1200);
    expect(world.explosives.map((e) => e.id).sort()).toEqual([
      'depot_tank1',
      'depot_tank2',
      'depot_tank3',
    ]);
    for (const e of world.explosives) expect(e.radius).toBeGreaterThan(3);
  });

  it('marks the clinic (and its generator) as protected', () => {
    expect(world.protectedBoxes).toHaveLength(2);
    const clinic = MAP.buildings.find((b) => b.kind === 'clinic')!;
    const box = collision.boxes[world.protectedBoxes[1]];
    expect(box.center.x).toBeCloseTo(clinic.pos[0]);
    expect(box.center.z).toBeCloseTo(clinic.pos[1]);
  });

  it('stands buildings on the ground: walls reach below it and rise above it', () => {
    for (const b of MAP.buildings) {
      const g = terrain.heightAt(b.pos[0], b.pos[1]);
      const box = collision.boxes.find(
        (x) => Math.abs(x.center.x - b.pos[0]) < 1e-6 && Math.abs(x.center.z - b.pos[1]) < 1e-6,
      )!;
      if (b.kind !== 'canopy') expect(box.center.y - box.half.y).toBeLessThan(g);
      expect(box.center.y + box.half.y).toBeGreaterThan(g + 2.5);
    }
  });

  it('a shell aimed at a roof hits the building, one aimed at a field hits the ground', () => {
    const v = MAP.buildings.find((b) => b.id === 'v_e1')!;
    const roof = collision.raycast(new Vector3(v.pos[0], 700, v.pos[1]), new Vector3(0, -1, 0))!;
    expect(roof.kind).toBe('building');
    const field = collision.raycast(new Vector3(-560, 700, 260), new Vector3(0, -1, 0))!;
    expect(field.kind).toBe('ground');
  });

  it('places cover only on open ground, around buildings and along hedges and walls', () => {
    expect(world.cover.points.length).toBeGreaterThan(200);
    const solids = [
      ...MAP.buildings.filter((b) => b.kind !== 'canopy').map((b) => buildingRect(b)),
      ...MAP.walls.flatMap((w) => wallRects(w)),
    ];
    for (const p of world.cover.points) {
      expect(solids.some((r) => inRect(r, p.x, p.z))).toBe(false);
    }
    // Some cover lines the fields' hedgerows.
    const hedge = MAP.walls.find((w) => w.kind === 'hedge')!;
    const [a, b] = hedge.points;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    expect(world.cover.points.some((p) => Math.hypot(p.x - mid[0], p.z - mid[1]) < 10)).toBe(true);
  });

  it('lets people cross the stream on the bridge deck instead of wading through the bed', () => {
    const b = MAP.bridges[0];
    const bed = terrain.heightAt(b.at[0], b.at[1]);
    expect(world.surfaceAt(b.at[0], b.at[1])).toBeGreaterThan(bed + 0.5);
    expect(world.surfaceAt(-500, 260)).toBe(terrain.heightAt(-500, 260)); // elsewhere: the ground
  });

  it('draws the whole map in a handful of draw calls', () => {
    let meshes = 0;
    world.root.traverse((o) => {
      if (o instanceof Mesh) meshes++;
    });
    // ground + roads + stream + the instanced kinds (boxes, rough, roofs, trees, forest, tanks)
    expect(meshes).toBeLessThanOrEqual(MAP.roads.length + 8);
  });
});

describe('WorldBuilder geometry', () => {
  it('builds roads and the stream from real numbers (regression: [x, z] tuples read as NaN)', () => {
    world.root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      const pos = o.geometry.getAttribute('position');
      for (let k = 0; k < Math.min(pos.count, 200); k++)
        expect(Number.isFinite(pos.getY(k))).toBe(true);
    });
  });
});
