import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Terrain } from './Terrain';

// Small terrain so tests are fast; same algorithm as the real one.
const CFG = { size: 400, cellSize: 10, seed: 99, hillHeight: 28 };
const terrain = new Terrain(CFG);

describe('Terrain', () => {
  it('is deterministic for a given seed', () => {
    const again = new Terrain(CFG);
    expect(again.heights).toEqual(terrain.heights);
    const other = new Terrain({ ...CFG, seed: 100 });
    expect(other.heights).not.toEqual(terrain.heights);
  });

  it('has gentle hills within the configured height', () => {
    for (const h of terrain.heights) expect(Math.abs(h)).toBeLessThanOrEqual(CFG.hillHeight);
  });

  it('heightAt() returns the exact vertex height at grid vertices', () => {
    for (const [i, j] of [
      [0, 0],
      [5, 7],
      [20, 13],
      [40, 40],
    ]) {
      const x = -terrain.half + i * terrain.cellSize;
      const z = -terrain.half + j * terrain.cellSize;
      expect(terrain.heightAt(x, z)).toBeCloseTo(terrain.vertexHeight(i, j), 5);
    }
  });

  it('heightAt() lies exactly on the rendered triangles', () => {
    const geo = terrain.buildGeometry();
    const pos = geo.getAttribute('position');
    const idx = geo.getIndex()!;
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    // Check the centroid of a sample of triangles.
    for (let t = 0; t < idx.count; t += 3 * 97) {
      a.fromBufferAttribute(pos, idx.getX(t));
      b.fromBufferAttribute(pos, idx.getX(t + 1));
      c.fromBufferAttribute(pos, idx.getX(t + 2));
      const cx = (a.x + b.x + c.x) / 3;
      const cy = (a.y + b.y + c.y) / 3;
      const cz = (a.z + b.z + c.z) / 3;
      expect(terrain.heightAt(cx, cz)).toBeCloseTo(cy, 4);
    }
  });

  it('builds triangles whose normals point up', () => {
    const geo = terrain.buildGeometry();
    const normals = geo.getAttribute('normal');
    for (let k = 0; k < normals.count; k += 50) expect(normals.getY(k)).toBeGreaterThan(0.5);
  });

  it('clamps queries outside the mesh to the edge', () => {
    expect(terrain.heightAt(-10_000, -10_000)).toBeCloseTo(terrain.vertexHeight(0, 0), 5);
    const last = terrain.n - 1;
    expect(terrain.heightAt(10_000, 10_000)).toBeCloseTo(terrain.vertexHeight(last, last), 5);
  });
});
