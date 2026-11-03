import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Effects } from '../fx/Effects';
import type { Sensor } from '../gunship/Sensor';
import type { WeaponDef } from '../gunship/weaponDefs';
import type { SensorFX } from '../render/SensorFX';
import { applyRadial, falloff, type Damageable } from './Damage';

/** A damageable thing that also says what it is (for kill events). */
export interface Target extends Damageable {
  readonly kind: 'infantry' | 'vehicle';
}

/**
 * Camera shake for an impact `distanceToAim` meters from where the sensor is looking: full
 * strength within the blast radius, fading to zero `shakeReach` blast radii away.
 */
export function shakeFor(w: WeaponDef, distanceToAim: number): number {
  const r = w.blastRadius;
  return w.fx.shakeDeg * falloff(distanceToAim, r, r * CONFIG.fx.shakeReach);
}

/**
 * Sensor whiteout for an impact in view: stronger the more of the picture the blast fills
 * (`viewHalfHeight` = meters from the screen center to the top edge at the target).
 */
export function whiteoutFor(w: WeaponDef, viewHalfHeight: number, inView: boolean): number {
  if (!inView || w.fx.whiteout <= 0) return 0;
  const fill = Math.min(1, (w.blastRadius * CONFIG.fx.whiteoutReach) / viewHalfHeight);
  return w.fx.whiteout * fill;
}

/**
 * One impact, end to end (PLAN.md §7.7): radial damage, flash/debris/smoke/crater/shockwave,
 * camera shake, sensor whiteout, and `impact` / `unitKilled` events (audio listens to these).
 */
export class Explosions {
  private readonly ndc = new Vector3();

  constructor(
    private readonly effects: Effects,
    private readonly sensor: Sensor,
    private readonly sensorFx: SensorFX,
    private readonly bus: EventBus<GameEvents>,
    private readonly targets: () => Iterable<Target>,
  ) {}

  detonate(point: Vector3, w: WeaponDef, onGround: boolean): void {
    for (const hit of applyRadial(point, w, this.targets())) {
      const t = hit.target as Target;
      if (!t.alive) this.bus.emit('unitKilled', { kind: t.kind, by: w.id });
    }

    this.effects.explosion(point, w, onGround);

    const distanceToAim = point.distanceTo(this.sensor.aim);
    this.sensor.addShake(shakeFor(w, distanceToAim));

    const cam = this.sensor.camera;
    const p = this.ndc.copy(point).project(cam);
    const inView = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
    const halfHeight = this.sensor.slantRange * Math.tan((this.sensor.fovDeg * Math.PI) / 360);
    this.sensorFx.triggerWhiteout(whiteoutFor(w, halfHeight, inView));

    this.bus.emit('impact', { pos: point, weapon: w.id, distanceToAim });
  }
}
