import { CONFIG } from '../config';
import type { Ordnance } from '../gunship/weaponDefs';

/** A protected building's footprint: a rotated rectangle on the ground. */
export interface Footprint {
  readonly center: { readonly x: number; readonly z: number };
  readonly half: { readonly x: number; readonly z: number };
  readonly rotY: number;
}

/** Ground distance from (x, z) to the rectangle (0 inside it). */
export function footprintDistance(f: Footprint, x: number, z: number): number {
  const dx = x - f.center.x;
  const dz = z - f.center.z;
  // Into the box's frame (three.js rotation about +y).
  const c = Math.cos(f.rotY);
  const s = Math.sin(f.rotY);
  const lx = c * dx - s * dz;
  const lz = s * dx + c * dz;
  const ox = Math.max(0, Math.abs(lx) - f.half.x);
  const oz = Math.max(0, Math.abs(lz) - f.half.z);
  return Math.hypot(ox, oz);
}

/** Nearest distance from (x, z) to any of the footprints (Infinity if none). */
export function nearestFootprint(fs: readonly Footprint[], x: number, z: number): number {
  let best = Infinity;
  for (const f of fs) best = Math.min(best, footprintDistance(f, x, z));
  return best;
}

export type ClinicVerdict = 'hit' | 'nearMiss' | null;

/**
 * The protected-clinic rule (PLAN.md §8 phase 2, §7.19): an impact whose full-damage radius
 * reaches the clinic (or its generator) hits it and fails the mission; one whose blast reaches
 * within `nearMissRadius` of it is a near miss and draws a warning. The same rule covers guns
 * and air strikes, since each carries its own radii.
 */
export function clinicVerdict(
  distance: number,
  w: Ordnance,
  cfg: { readonly hitMinRadius: number; readonly nearMissRadius: number } = CONFIG.clinic,
): ClinicVerdict {
  if (distance <= Math.max(w.innerRadius, cfg.hitMinRadius)) return 'hit';
  if (distance <= Math.max(w.blastRadius, cfg.nearMissRadius)) return 'nearMiss';
  return null;
}

/** The biggest footprint (the clinic itself, not its generator), e.g. for the on-screen marker. */
export function largestFootprint<T extends Footprint>(fs: readonly T[]): T | null {
  let best: T | null = null;
  for (const f of fs) if (!best || f.half.x * f.half.z > best.half.x * best.half.z) best = f;
  return best;
}
