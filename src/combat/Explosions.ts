import { Vector3 } from 'three';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Effects } from '../fx/Effects';
import type { Sensor } from '../gunship/Sensor';
import type { Ordnance } from '../gunship/weaponDefs';
import type { SensorFX } from '../render/SensorFX';
import { applyRadial, falloff, type Damageable } from './Damage';

export type Side = 'enemy' | 'friendly';

/** A damageable thing that also says what it is and whose side it's on. */
export interface Target extends Damageable {
  /** `aircraft`: the extraction helicopter (a friendly, M7). */
  readonly kind: 'infantry' | 'vehicle' | 'aircraft';
  readonly side: Side;
  /** An AA gun (M8+ Phase E): its kill gets the "Triple-A destroyed" call, not "vehicle". */
  readonly aa?: boolean;
}

/**
 * Camera shake for an impact `distanceToAim` meters from where the sensor is looking: full
 * strength within the blast radius, fading to zero `shakeReach` blast radii away.
 */
export function shakeFor(w: Ordnance, distanceToAim: number): number {
  const r = w.blastRadius;
  return w.fx.shakeDeg * falloff(distanceToAim, r, r * (w.fx.shakeReach ?? CONFIG.fx.shakeReach));
}

/**
 * Sensor whiteout for an impact in view: stronger the more of the picture the blast fills
 * (`viewHalfHeight` = meters from the screen center to the top edge at the target).
 */
export function whiteoutFor(w: Ordnance, viewHalfHeight: number, inView: boolean): number {
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
    /** Every target within `radius` (ground distance) of `center`: the unit spatial grid. */
    private readonly targetsNear: (center: Vector3, radius: number) => readonly Target[],
  ) {}

  detonate(point: Vector3, w: Ordnance, onGround: boolean): void {
    // Query out to the danger-close distance: it is wider than the blast.
    const near = this.targetsNear(point, Math.max(w.blastRadius, w.dangerClose));
    let friendlyKilled = false;
    let aircraftKilled = false;
    let enemiesHit = 0;
    for (const hit of applyRadial(point, w, near)) {
      const t = hit.target as Target;
      if (t.side !== 'friendly' && t.kind !== 'aircraft') enemiesHit++;
      if (t.alive) continue;
      if (t.kind === 'aircraft') aircraftKilled = true;
      else if (t.side === 'friendly') friendlyKilled = true;
      else this.bus.emit('unitKilled', { kind: t.kind, by: w.id, aa: t.aa });
    }
    if (aircraftKilled) {
      // Kestrel 6 (M7): the player's own round brought the extraction helicopter down.
      this.bus.emit('friendlyKilledByPlayer', { weapon: w.id });
      this.bus.emit('missionFailed', { reason: 'helicopter_friendly_fire' });
    }
    this.checkFriendlies(point, w, near, friendlyKilled);

    this.effects.explosion(point, w, onGround);

    const distanceToAim = point.distanceTo(this.sensor.aim);
    this.sensor.addShake(shakeFor(w, distanceToAim), w.fx.shakeSeconds);

    const cam = this.sensor.camera;
    const p = this.ndc.copy(point).project(cam);
    const inView = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1;
    const halfHeight = this.sensor.slantRange * Math.tan((this.sensor.fovDeg * Math.PI) / 360);
    this.sensorFx.triggerWhiteout(whiteoutFor(w, halfHeight, inView));

    this.bus.emit('impact', { pos: point, weapon: w.id, distanceToAim, enemiesHit });
  }

  /**
   * PLAN.md §7.7: killing a friendly fails the mission; an impact within the weapon's
   * danger-close distance of a (surviving) friendly raises a danger-close warning.
   */
  private checkFriendlies(
    point: Vector3,
    w: Ordnance,
    near: readonly Target[],
    friendlyKilled: boolean,
  ): void {
    if (friendlyKilled) {
      this.bus.emit('friendlyKilledByPlayer', { weapon: w.id });
      this.bus.emit('missionFailed', { reason: 'friendly_fire' });
      return;
    }
    let closest = Infinity;
    for (const t of near) {
      if (t.side === 'friendly' && t.alive)
        closest = Math.min(closest, t.position.distanceTo(point));
    }
    if (closest < w.dangerClose) this.bus.emit('dangerClose', { weapon: w.id, distance: closest });
  }
}
