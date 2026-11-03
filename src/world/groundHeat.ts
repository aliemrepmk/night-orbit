import { createNoise2D } from 'simplex-noise';
import { createRng } from '../core/rng';
import { HEAT } from '../fx/Heat';

/**
 * Heat field of bare soil: broad warm/cool patches (like plowed vs. fallow fields) plus finer
 * variation. Always within [HEAT.soilMin, HEAT.soilMax]. Roads and water come from MapData in M6.
 */
export function createGroundHeat(seed: number): (x: number, z: number) => number {
  const noise = createNoise2D(createRng(seed));
  const span = HEAT.soilMax - HEAT.soilMin;
  return (x, z) => {
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
