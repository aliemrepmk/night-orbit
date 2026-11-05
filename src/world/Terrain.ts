import { BufferAttribute, BufferGeometry } from 'three';
import { createNoise2D } from 'simplex-noise';
import { CONFIG, type TerrainConfig } from '../config';
import { createRng } from '../core/rng';

/**
 * Heightmap terrain on a regular grid.
 *
 * Each grid cell is split into two triangles along the diagonal from (i+1, j) to (i, j+1).
 * `heightAt()` interpolates on exactly those triangles, so the value it returns lies
 * exactly on the rendered surface (aim points and units never float or sink).
 */
export class Terrain {
  readonly size: number;
  readonly cellSize: number;
  /** Vertices per side. */
  readonly n: number;
  readonly half: number;
  /** Row-major heights: index = j * n + i, where i runs along x and j along z. */
  readonly heights: Float32Array;
  /** Highest vertex (bounds ray marching in `Collision`). */
  readonly maxHeight: number;

  /**
   * `height` gives the ground shape (the map's `mapHeightField` in the game); without it the
   * terrain is plain rolling noise hills from `cfg` (tests, tools).
   */
  constructor(cfg: TerrainConfig = CONFIG.terrain, height?: (x: number, z: number) => number) {
    this.size = cfg.size;
    this.cellSize = cfg.cellSize;
    this.half = cfg.size / 2;
    this.n = Math.round(cfg.size / cfg.cellSize) + 1;
    this.heights = new Float32Array(this.n * this.n);

    const noise = createNoise2D(createRng(cfg.seed));
    const at = height ?? ((x: number, z: number) => rawHeight(noise, x, z, cfg.hillHeight));
    let max = -Infinity;
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * this.cellSize;
        const z = -this.half + j * this.cellSize;
        const h = at(x, z);
        this.heights[j * this.n + i] = h;
        if (h > max) max = h;
      }
    }
    this.maxHeight = max;
  }

  /** Height of the grid vertex (i, j). */
  vertexHeight(i: number, j: number): number {
    return this.heights[j * this.n + i];
  }

  /** Surface height at world (x, z). Points outside the mesh use the nearest edge. */
  heightAt(x: number, z: number): number {
    const max = this.n - 1;
    const gx = clamp((x + this.half) / this.cellSize, 0, max);
    const gz = clamp((z + this.half) / this.cellSize, 0, max);
    const i = Math.min(Math.floor(gx), max - 1);
    const j = Math.min(Math.floor(gz), max - 1);
    const u = gx - i;
    const v = gz - j;

    const h00 = this.vertexHeight(i, j);
    const h10 = this.vertexHeight(i + 1, j);
    const h01 = this.vertexHeight(i, j + 1);
    const h11 = this.vertexHeight(i + 1, j + 1);

    if (u + v <= 1) return h00 + u * (h10 - h00) + v * (h01 - h00);
    return h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  }

  /** Builds the render mesh. Triangulation must match `heightAt()`. */
  buildGeometry(): BufferGeometry {
    const { n } = this;
    const positions = new Float32Array(n * n * 3);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        positions[k] = -this.half + i * this.cellSize;
        positions[k + 1] = this.vertexHeight(i, j);
        positions[k + 2] = -this.half + j * this.cellSize;
      }
    }

    const cells = (n - 1) * (n - 1);
    const index = new Uint32Array(cells * 6);
    let p = 0;
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i; // (i, j)
        const b = a + 1; // (i+1, j)
        const c = a + n; // (i, j+1)
        const d = c + 1; // (i+1, j+1)
        // Counter-clockwise seen from above → normals point up.
        index[p++] = a;
        index[p++] = c;
        index[p++] = b;
        index[p++] = b;
        index[p++] = c;
        index[p++] = d;
      }
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setIndex(new BufferAttribute(index, 1));
    geo.computeVertexNormals();
    return geo;
  }
}

/** Two octaves of simplex noise give broad hills with some smaller rolls. */
function rawHeight(
  noise: (x: number, y: number) => number,
  x: number,
  z: number,
  hillHeight: number,
): number {
  const broad = noise(x / 650, z / 650);
  const detail = noise(x / 220 + 31.7, z / 220 - 12.3);
  return hillHeight * (0.7 * broad + 0.3 * detail);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
