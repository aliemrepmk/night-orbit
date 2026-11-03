import { HEAT } from './Heat';

/**
 * What the night-vision (image-intensifier) sensor sees: reflected starlight and moonlight in the
 * near-infrared, plus things that emit light. This is data, the NV counterpart of `Heat.ts`.
 *
 * - ALBEDO (0–1): how much near-IR light a surface reflects. Vegetation reflects near-IR strongly
 *   (chlorophyll), so trees and grass look bright under NV while bare soil and asphalt look dark:
 *   roughly the opposite of thermal, so each sensor reveals different things.
 * - GLOW (0–1): light an object emits itself (added on top of reflected light).
 */
export const ALBEDO = {
  soilBare: 0.18,
  grass: 0.35,
  road: 0.15,
  tree: 0.8,
  wall: 0.45,
  roof: 0.32,
  /** Unlit window glass. */
  window: 0.12,
  chimney: 0.3,
  water: 0.05,
  /** Camouflage fabric: blends into the ground (NV doesn't single out people like thermal). */
  soldier: 0.3,
  vehicleBody: 0.28,
} as const;

export const GLOW = {
  none: 0,
  /** A lit room seen through a window: the brightest steady thing in a village at night. */
  litWindow: 0.85,
  fire: 0.9,
  /** Friendly IR strobes (M4) blink at this level and are only visible to the NV sensor. */
  irStrobe: 1.0,
  flash: 1.0,
} as const;

/** The three channels every object carries: what thermal sees (heat) and what NV sees. */
export interface Signature {
  readonly heat: number;
  readonly albedo: number;
  readonly glow: number;
}

export function signature(heat: number, albedo: number, glow: number = GLOW.none): Signature {
  return { heat, albedo, glow };
}

/**
 * Near-IR albedo of open ground, derived from its heat: warm patches are bare (plowed) soil,
 * which is dark in NV; cool patches are grass, which is bright. So fields swap brightness between
 * the two sensors.
 */
export function groundAlbedo(heat: number): number {
  const t = Math.min(1, Math.max(0, (heat - HEAT.soilMin) / (HEAT.soilMax - HEAT.soilMin)));
  return ALBEDO.grass + (ALBEDO.soilBare - ALBEDO.grass) * t;
}
