/** Anything with a ground position (only x and z are used). */
export interface Positioned {
  readonly position: { readonly x: number; readonly z: number };
}

/** Cell coordinates fit in 16 bits each: ±32k cells × 20 m covers far more than the map. */
const OFFSET = 32768;

/**
 * Uniform grid over the ground plane (PLAN.md §7.11): rebuilt every tick, used for blast
 * queries, separation and nearest-target lookups so they don't scan every unit.
 * Queries are 2D (x/z): callers that need 3D distance filter the candidates further.
 */
export class SpatialGrid<T extends Positioned> {
  private readonly cells = new Map<number, T[]>();
  /** Cells that hold something since the last `clear()` (so clearing is cheap). */
  private readonly used: T[][] = [];

  constructor(readonly cellSize: number) {}

  clear(): void {
    for (const cell of this.used) cell.length = 0;
    this.used.length = 0;
  }

  insert(item: T): void {
    const key = this.key(this.cell(item.position.x), this.cell(item.position.z));
    let cell = this.cells.get(key);
    if (!cell) {
      cell = [];
      this.cells.set(key, cell);
    }
    if (cell.length === 0) this.used.push(cell);
    cell.push(item);
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const item of items) this.insert(item);
  }

  /** Everything within `radius` of (x, z) on the ground plane, appended to `out`. */
  queryRadius(x: number, z: number, radius: number, out: T[] = []): T[] {
    const r2 = radius * radius;
    const i0 = this.cell(x - radius);
    const i1 = this.cell(x + radius);
    const j0 = this.cell(z - radius);
    const j1 = this.cell(z + radius);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const cell = this.cells.get(this.key(i, j));
        if (!cell) continue;
        for (const item of cell) {
          const dx = item.position.x - x;
          const dz = item.position.z - z;
          if (dx * dx + dz * dz <= r2) out.push(item);
        }
      }
    }
    return out;
  }

  /**
   * The closest item to (x, z) within `maxRadius` that passes `accept`, or null.
   * Searches rings of cells outward and stops once no closer item can exist.
   */
  nearest(x: number, z: number, maxRadius: number, accept: (item: T) => boolean): T | null {
    const ci = this.cell(x);
    const cj = this.cell(z);
    const maxRing = Math.ceil(maxRadius / this.cellSize) + 1;
    let best: T | null = null;
    let bestD2 = maxRadius * maxRadius;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Anything in this ring or beyond is at least (ring − 1) cells away.
      const minDist = Math.max(0, ring - 1) * this.cellSize;
      if (best && minDist * minDist > bestD2) break;
      for (let i = ci - ring; i <= ci + ring; i++) {
        for (let j = cj - ring; j <= cj + ring; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== ring) continue; // ring edge only
          const cell = this.cells.get(this.key(i, j));
          if (!cell) continue;
          for (const item of cell) {
            const dx = item.position.x - x;
            const dz = item.position.z - z;
            const d2 = dx * dx + dz * dz;
            if (d2 <= bestD2 && accept(item)) {
              best = item;
              bestD2 = d2;
            }
          }
        }
      }
    }
    return best;
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private key(i: number, j: number): number {
    return (i + OFFSET) * 65536 + (j + OFFSET);
  }
}
