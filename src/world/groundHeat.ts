import { createNoise2D } from 'simplex-noise';
import { createRng } from '../core/rng';
import { HEAT } from '../fx/Heat';
import type { FieldDef, FieldKind, Vec2 } from './mapTypes';

/** Where in the soil range (0 = coolest, 1 = warmest) each kind of field sits. */
const FIELD_LEVEL: Readonly<Record<FieldKind, number>> = {
  plowed: 0.85, // bare dark soil keeps the day's heat
  stubble: 0.55,
  grass: 0.12, // vegetation cools fastest at night
  gravel: 1, // the quarry floor: bare stone, the warmest open ground
};

/**
 * Heat field of the ground: broad warm/cool patches plus finer variation, and inside the map's
 * `fields` a level per field kind (plowed warm, grass cool) with furrow stripes. Always within
 * [HEAT.soilMin, HEAT.soilMax]. Roads and water are their own meshes on top.
 */
export function createGroundHeat(
  seed: number,
  fields: readonly FieldDef[] = [],
): (x: number, z: number) => number {
  const noise = createNoise2D(createRng(seed));
  const span = HEAT.soilMax - HEAT.soilMin;
  return (x, z) => {
    for (const f of fields) {
      if (!inPolygon(f.polygon, x, z)) continue;
      // Furrows: faint stripes along the field's first edge, plus a little noise.
      const [ax, az] = f.polygon[0];
      const [bx, bz] = f.polygon[1];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const across = ((x - ax) * -(bz - az) + (z - az) * (bx - ax)) / len;
      const furrow = f.kind === 'grass' || f.kind === 'gravel' ? 0 : 0.08 * Math.sin(across * 1.6);
      const u = FIELD_LEVEL[f.kind] + furrow + 0.06 * noise(x / 25, z / 25);
      return HEAT.soilMin + span * Math.min(1, Math.max(0, u));
    }
    // Patches ~150 m across with fairly sharp edges, so they read as fields.
    const patch = smoothstep(-0.25, 0.25, noise(x / 150, z / 150));
    const fine = noise(x / 35 + 17.1, z / 35 - 4.2);
    const u = 0.6 * patch + 0.4 * (0.5 + 0.5 * fine); // 0..1
    return HEAT.soilMin + span * u;
  };
}

function smoothstep(a: number, b: number, v: number): number {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Even-odd point-in-polygon test on the ground plane. */
export function inPolygon(poly: readonly Vec2[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
