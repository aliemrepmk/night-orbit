import { Vector3 } from 'three';
import type { Rng } from '../core/rng';

/**
 * "Aimed point + flight time" ballistics (PLAN.md §7.6): no trajectories are simulated. The
 * impact point is fixed when the shell is fired and the shell arrives after distance / speed,
 * so a moving target has to be led.
 */

export function flightTime(distance: number, shellSpeed: number): number {
  return distance / shellSpeed;
}

/** A point uniformly distributed inside a disc of `radius` (meters): [x, y]. */
export function sampleDisc(rng: Rng, radius: number): [number, number] {
  const r = radius * Math.sqrt(rng()); // sqrt → uniform by area, not clumped at the center
  const a = rng() * Math.PI * 2;
  return [r * Math.cos(a), r * Math.sin(a)];
}

const UP = new Vector3(0, 1, 0);

/**
 * Moves `target` by (dx, dy) meters in the plane perpendicular to the line of sight from
 * `origin`. Re-raycasting through the result spreads impacts across whatever surface is there
 * (roof, wall or ground) instead of leaving them floating.
 */
export function offsetAcrossView(
  origin: Vector3,
  target: Vector3,
  dx: number,
  dy: number,
  out = new Vector3(),
): Vector3 {
  const view = new Vector3().subVectors(target, origin).normalize();
  const right = new Vector3().crossVectors(view, UP).normalize();
  const up = new Vector3().crossVectors(right, view);
  return out.copy(target).addScaledVector(right, dx).addScaledVector(up, dy);
}

/**
 * Where the shells leave the aircraft: below the fuselage and out the left side (gunships
 * orbit counter-clockwise with their guns facing the orbit center). Seen from the sensor,
 * tracers streak in from the side instead of starting at the crosshair.
 */
export function muzzlePosition(
  aircraft: Vector3,
  orbitCenter: Vector3,
  drop: number,
  side: number,
  out = new Vector3(),
): Vector3 {
  const toCenter = new Vector3(orbitCenter.x - aircraft.x, 0, orbitCenter.z - aircraft.z);
  if (toCenter.lengthSq() > 1e-6) toCenter.normalize();
  return out
    .copy(aircraft)
    .addScaledVector(toCenter, side)
    .add(new Vector3(0, -drop, 0));
}
