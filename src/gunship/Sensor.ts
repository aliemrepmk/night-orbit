import { PerspectiveCamera, Vector3 } from 'three';
import { CONFIG, type SensorConfig } from '../config';
import type { Gunship } from './Gunship';
import { WEAPONS, cycleWeapon, type WeaponId } from './weaponDefs';
import { approach, clampToRadius, headingDeg, slewAim, wrapDeg } from './sensorMath';

/** Anything that can report ground height (the terrain, or a flat stub in tests). */
export interface HeightSource {
  heightAt(x: number, z: number): number;
}

const DEG = Math.PI / 180;

/**
 * The gunship's sensor turret / camera.
 *
 * It is GROUND-STABILIZED: the player controls a point on the ground (`aim`), and the camera
 * always looks at it from wherever the aircraft currently is. With no mouse input the crosshair
 * stays on the same spot while the plane circles.
 */
export class Sensor {
  readonly aim = new Vector3();
  readonly camera: PerspectiveCamera;
  weapon: WeaponId = '105';
  /** Current (animated) field of view. */
  fovDeg: number = WEAPONS['105'].fovDeg;
  private time = 0;
  /** Current camera shake amplitude in degrees (decays exponentially). */
  shakeDeg = 0;

  constructor(
    private readonly gunship: Gunship,
    private readonly ground: HeightSource,
    aspect: number,
    private readonly cfg: SensorConfig = CONFIG.sensor,
  ) {
    this.camera = new PerspectiveCamera(this.fovDeg, aspect, cfg.near, cfg.far);
    this.aim.copy(gunship.center);
    this.constrainAim();
    this.syncCamera();
  }

  get targetFovDeg(): number {
    return WEAPONS[this.weapon].fovDeg;
  }

  /** Straight-line distance from the aircraft to the aim point. */
  get slantRange(): number {
    return this.gunship.position.distanceTo(this.aim);
  }

  /** Compass heading the sensor is looking toward. */
  get lookHeadingDeg(): number {
    return headingDeg(this.aim.x - this.gunship.position.x, this.aim.z - this.gunship.position.z);
  }

  /** Sensor azimuth relative to the aircraft's nose (negative = left). */
  get relativeAzimuthDeg(): number {
    return wrapDeg(this.lookHeadingDeg - this.gunship.headingDeg);
  }

  /** Depression angle below the horizon, in degrees (positive = looking down). */
  get depressionDeg(): number {
    return Math.asin((this.gunship.position.y - this.aim.y) / this.slantRange) / DEG;
  }

  selectWeapon(id: WeaponId): boolean {
    if (id === this.weapon) return false;
    this.weapon = id;
    return true;
  }

  cycleWeapon(direction: 1 | -1): void {
    this.weapon = cycleWeapon(this.weapon, direction);
  }

  /** Applies a mouse delta in CSS pixels. */
  slew(dxPx: number, dyPx: number, viewportHeight: number): void {
    if (dxPx === 0 && dyPx === 0) return;
    slewAim(
      this.aim,
      this.gunship.position,
      dxPx,
      dyPx,
      this.fovDeg,
      viewportHeight,
      this.cfg.sensitivity,
      this.cfg.minDepressionSin,
    );
    this.constrainAim();
  }

  /** Adds camera shake (impacts, 105 mm recoil). Shakes don't stack beyond the strongest + 50%. */
  addShake(deg: number): void {
    this.shakeDeg = Math.max(this.shakeDeg, deg) + 0.5 * Math.min(this.shakeDeg, deg);
  }

  /** Fixed-step update: zoom animation, shake decay, gimbal limit (the orbit center may move). */
  update(dt: number): void {
    this.time += dt;
    this.shakeDeg *= Math.exp(-dt / this.cfg.shakeTau);
    if (this.shakeDeg < 1e-4) this.shakeDeg = 0;
    this.fovDeg = approach(this.fovDeg, this.targetFovDeg, dt, this.cfg.zoomTau);
    this.constrainAim();
  }

  /** Points the camera from the aircraft at the aim point. Call once per rendered frame. */
  syncCamera(): void {
    const cam = this.camera;
    cam.position.copy(this.gunship.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.aim);

    if (this.cfg.jitterDeg > 0) {
      const t = this.time;
      const j = this.cfg.jitterDeg * DEG;
      cam.rotateY(j * (Math.sin(t * 1.7) + 0.5 * Math.sin(t * 4.3 + 1.1)));
      cam.rotateX(j * (Math.sin(t * 1.3 + 2.0) + 0.5 * Math.sin(t * 3.7)));
    }
    if (this.shakeDeg > 0) {
      // Fast, irregular shake (incommensurate frequencies) that doesn't move the aim point.
      const t = this.time;
      const k = this.shakeDeg * DEG;
      cam.rotateY(k * Math.sin(t * 61.0) * Math.cos(t * 23.3));
      cam.rotateX(k * Math.sin(t * 53.7 + 1.3) * Math.cos(t * 31.1));
    }

    if (cam.fov !== this.fovDeg) {
      cam.fov = this.fovDeg;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private constrainAim(): void {
    clampToRadius(this.aim, this.gunship.center, this.cfg.gimbalRadius);
    this.aim.y = this.ground.heightAt(this.aim.x, this.aim.z);
  }
}
