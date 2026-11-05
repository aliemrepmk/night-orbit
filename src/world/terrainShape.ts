import { createNoise2D } from 'simplex-noise';
import { createRng } from '../core/rng';
import type { MapData, Vec2 } from './mapTypes';

/** How far beyond its edge a road's grade blends back into the hillside (meters). */
const ROAD_SHOULDER = 3;
const ROAD_BLEND = 10;
/** The stream bed is flat for its width, its banks slope over this many meters. */
const STREAM_BANK = 7;
/** Width (m) over which the ground rises from the valley floor to the full mountain height. */
const VALLEY_RAMP = 650;

/** Nearest point on a polyline to (x, z), with the distance to it. */
interface Nearest {
  d: number;
  x: number;
  z: number;
}

function nearestOn(points: readonly Vec2[], x: number, z: number, out: Nearest): Nearest {
  out.d = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
    const px = ax + vx * t;
    const pz = az + vz * t;
    const d = Math.hypot(px - x, pz - z);
    if (d < out.d) {
      out.d = d;
      out.x = px;
      out.z = pz;
    }
  }
  return out;
}

/** Bounding box of a polyline grown by `pad`, for cheap rejection. */
function bounds(points: readonly Vec2[], pad: number) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The map's ground height at (x, z) (PLAN.md §7.12), in layers:
 * 1. gentle simplex hills (`hillHeight`), rising into mountains beyond `valleyStart`
 * 2. flattened under the village, farmyard, crossroads, OP and quarry (`flats`)
 * 3. roads level across their width, following the ground along their length
 * 4. the stream cut `depth` meters into it
 */
export function mapHeightField(map: MapData): (x: number, z: number) => number {
  const t = map.terrain;
  const noise = createNoise2D(createRng(t.seed));
  const hills = (x: number, z: number) => {
    const broad = noise(x / 650, z / 650);
    const detail = noise(x / 220 + 31.7, z / 220 - 12.3);
    const valley = smoothstep(
      t.valleyStart,
      t.valleyStart + VALLEY_RAMP,
      Math.max(Math.abs(x), Math.abs(z)),
    );
    return t.hillHeight * (0.7 * broad + 0.3 * detail) + t.valleyRise * valley;
  };

  const flats = map.flats.map((f) => ({ ...f, height: hills(f.center[0], f.center[1]) }));
  const leveled = (x: number, z: number) => {
    let h = hills(x, z);
    for (const f of flats) {
      const d = Math.hypot(x - f.center[0], z - f.center[1]);
      const w = 1 - smoothstep(f.radius, f.radius + f.falloff, d);
      if (w > 0) h += (f.height - h) * w;
    }
    return h;
  };

  const roads = map.roads.map((r) => ({
    points: r.points,
    half: r.width / 2 + ROAD_SHOULDER,
    box: bounds(r.points, r.width / 2 + ROAD_SHOULDER + ROAD_BLEND),
  }));
  const stream = map.stream;
  const streamBox = bounds(stream.points, stream.width / 2 + STREAM_BANK);
  const near: Nearest = { d: 0, x: 0, z: 0 };

  return (x, z) => {
    let h = leveled(x, z);
    // Roads: blend toward the grade at the nearest point of the centerline (so both sides of
    // the road sit at the same height). The strongest (nearest) road wins at junctions.
    let best = 0;
    let grade = h;
    for (const r of roads) {
      if (x < r.box.minX || x > r.box.maxX || z < r.box.minZ || z > r.box.maxZ) continue;
      nearestOn(r.points, x, z, near);
      const w = 1 - smoothstep(r.half, r.half + ROAD_BLEND, near.d);
      if (w > best) {
        best = w;
        grade = leveled(near.x, near.z);
      }
    }
    if (best > 0) h += (grade - h) * best;
    // The stream: a flat bed `depth` below the surrounding ground, sloping banks.
    if (x >= streamBox.minX && x <= streamBox.maxX && z >= streamBox.minZ && z <= streamBox.maxZ) {
      nearestOn(stream.points, x, z, near);
      const cut = 1 - smoothstep(stream.width / 2, stream.width / 2 + STREAM_BANK, near.d);
      h -= stream.depth * cut;
    }
    return h;
  };
}
