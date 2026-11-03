import { Vector3 } from 'three';

/**
 * Pure math for the sensor camera, kept free of DOM and rendering so it can be unit tested.
 * World axes: +x = east, −z = north, +y = up.
 */

/** Compass heading (0 = north, 90 = east) of a horizontal direction. */
export function headingDeg(dirX: number, dirZ: number): number {
  const deg = (Math.atan2(dirX, -dirZ) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Wraps an angle in degrees to (−180, 180]. */
export function wrapDeg(deg: number): number {
  let d = ((deg % 360) + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Horizontal unit vectors for slewing:
 * `forward` points from the camera toward the aim point (away from the aircraft, along the ground),
 * `right` is screen-right projected onto the ground.
 */
export function groundBasis(
  camPos: Vector3,
  aim: Vector3,
  outForward: Vector3,
  outRight: Vector3,
): void {
  outForward.set(aim.x - camPos.x, 0, aim.z - camPos.z);
  if (outForward.lengthSq() < 1e-9) outForward.set(0, 0, -1);
  outForward.normalize();
  // right = forward × up
  outRight.set(-outForward.z, 0, outForward.x);
}

/** Ground meters covered by one screen pixel at the given range and vertical FOV. */
export function metersPerPixel(slantRange: number, fovDeg: number, viewportHeight: number): number {
  const fov = (fovDeg * Math.PI) / 180;
  return (2 * slantRange * Math.tan(fov / 2)) / viewportHeight;
}

const fwd = new Vector3();
const right = new Vector3();

/**
 * Moves the aim point by a mouse delta, in screen space:
 * mouse right → view pans right, mouse up → view pans away from the aircraft.
 * Because the scale comes from the FOV, sensitivity automatically gets finer when zoomed in.
 *
 * Forward motion is divided by sin(depression) to cancel the foreshortening of ground seen at an
 * angle, so the ground under the cursor tracks the mouse the same in both axes.
 */
export function slewAim(
  aim: Vector3,
  camPos: Vector3,
  dxPx: number,
  dyPx: number,
  fovDeg: number,
  viewportHeight: number,
  sensitivity: number,
  minDepressionSin: number,
): void {
  const slant = camPos.distanceTo(aim);
  if (slant < 1e-6) return;
  const mpp = metersPerPixel(slant, fovDeg, viewportHeight) * sensitivity;
  const sinDep = Math.max((camPos.y - aim.y) / slant, minDepressionSin);
  groundBasis(camPos, aim, fwd, right);
  aim.addScaledVector(right, dxPx * mpp);
  aim.addScaledVector(fwd, (-dyPx * mpp) / sinDep);
}

/** Keeps a point within a horizontal radius of a center (the sensor gimbal limit). */
export function clampToRadius(point: Vector3, center: Vector3, radius: number): void {
  const dx = point.x - center.x;
  const dz = point.z - center.z;
  const d = Math.hypot(dx, dz);
  if (d > radius) {
    point.x = center.x + (dx / d) * radius;
    point.z = center.z + (dz / d) * radius;
  }
}

/** Exponential approach: frame-rate independent smoothing toward a target. */
export function approach(current: number, target: number, dt: number, tau: number): number {
  if (tau <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
