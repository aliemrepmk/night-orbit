import { Vector3 } from 'three';
import { CONFIG, type OrbitConfig } from '../config';
import { headingDeg } from './sensorMath';

/**
 * The aircraft: flies a counter-clockwise (left-hand) circle around an orbit center.
 * The center glides smoothly toward whatever the mission says to focus on.
 *
 * World axes: +x = east, −z = north, +y = up.
 */
export class Gunship {
  readonly position = new Vector3();
  readonly center = new Vector3();
  readonly targetCenter = new Vector3();
  /** Orbit angle in radians; 0 = due east of the center. */
  angle = 0;
  time = 0;

  constructor(private readonly cfg: OrbitConfig = CONFIG.orbit) {
    this.updatePosition();
  }

  /** Ask the orbit to drift toward a new center (e.g. the next mission zone). */
  setFocus(x: number, z: number): void {
    this.targetCenter.set(x, 0, z);
  }

  /** A fresh run (M8 restart): back to the start of the orbit, centered on (x, z). */
  reset(x: number, z: number): void {
    this.angle = 0;
    this.time = 0;
    this.snapTo(x, z);
  }

  /** Jump instantly (used at mission start). */
  snapTo(x: number, z: number): void {
    this.targetCenter.set(x, 0, z);
    this.center.set(x, 0, z);
    this.updatePosition();
  }

  update(dt: number): void {
    this.time += dt;
    this.angle = (this.angle + ((2 * Math.PI) / this.cfg.period) * dt) % (2 * Math.PI);
    const k = 1 - Math.exp(-dt / this.cfg.centerGlideTau);
    this.center.x += (this.targetCenter.x - this.center.x) * k;
    this.center.z += (this.targetCenter.z - this.center.z) * k;
    this.updatePosition();
  }

  /** Direction of travel in compass degrees (0 = north, 90 = east). */
  get headingDeg(): number {
    // Derivative of (cos a, −sin a) with respect to a.
    return headingDeg(-Math.sin(this.angle), -Math.cos(this.angle));
  }

  private updatePosition(): void {
    const { radius, altitude, bobAmplitude, bobFrequency } = this.cfg;
    this.position.set(
      this.center.x + Math.cos(this.angle) * radius,
      altitude + Math.sin(this.time * bobFrequency * 2 * Math.PI) * bobAmplitude,
      this.center.z - Math.sin(this.angle) * radius,
    );
  }
}
