import { Vector3 } from 'three';
import type { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { range, type Rng } from '../core/rng';
import { INFANTRY } from './unitDefs';
import type { UnitManager } from './UnitManager';
import { Vehicle, type VehicleConfig } from './Vehicle';
import type { VehicleDef } from './vehicleDefs';

/**
 * Owns every enemy vehicle (PLAN.md §7.10, §6 step 8): drives them along their roads, keeps
 * them from driving through each other or through wrecks (they queue behind moving vehicles
 * and swerve around wrecks and stopped ones; only with no room to pass do they stop and unload
 * early), unloads trucks, fires mounted guns at Ridgeback,
 * and lets soldiers bail out of burning wrecks. Vehicles are blast targets in the unit grid.
 */
export class VehicleManager {
  readonly vehicles: Vehicle[] = [];
  private readonly gun = new Vector3();
  private readonly drop = new Vector3();

  constructor(
    private readonly units: UnitManager,
    private readonly groundAt: (x: number, z: number) => number,
    private readonly bus: EventBus<GameEvents>,
    private readonly rng: Rng,
    private readonly cfg: VehicleConfig = CONFIG.vehicles,
    /** Chance an unloaded soldier is a machine gunner (PLAN.md §9: 1 in 6). */
    private readonly machineGunnerChance = 1 / 6,
  ) {}

  get alive(): number {
    let n = 0;
    for (const v of this.vehicles) if (v.inUse && v.alive) n++;
    return n;
  }

  /** Living vehicles carrying the mission tag `tag`. */
  aliveTagged(tag: string): number {
    let n = 0;
    for (const v of this.vehicles) if (v.inUse && v.alive && v.tag === tag) n++;
    return n;
  }

  /** Dev cheat `K`: every living vehicle becomes a wreck. */
  destroyAll(): number {
    let n = 0;
    for (const v of this.vehicles) {
      if (!v.inUse || !v.alive) continue;
      v.takeDamage(v.hp * 100 + 1e6, 'team', v.position);
      if (!v.alive) n++;
    }
    return n;
  }

  /**
   * Starts a vehicle `s` meters along `path`. Uses a new slot while under the budget, then
   * recycles the oldest cooled-down wreck or empty parked truck; null if none can go.
   */
  spawn(def: VehicleDef, path: Path, s = 0): Vehicle | null {
    let v: Vehicle | null = null;
    if (this.vehicles.length < this.cfg.maxVehicles) {
      v = new Vehicle(def, this.groundAt, this.vehicles.length + 1, this.cfg);
      this.vehicles.push(v);
      this.units.addTarget(v);
    } else {
      let bestAge = -1;
      for (const o of this.vehicles) {
        const age =
          o.state === 'unused'
            ? Infinity
            : o.state === 'destroyed' && o.sinceDeath >= this.cfg.wreckMinAge
              ? o.sinceDeath
              : o.state === 'parked'
                ? 1e6 // empty trucks go first: they're no longer part of the fight
                : -1;
        if (age > bestAge) {
          bestAge = age;
          v = o;
        }
      }
      if (bestAge < 0) v = null;
    }
    if (!v) return null;
    const cargo = def.cargoMax > 0 ? Math.round(range(this.rng, def.cargoMin, def.cargoMax)) : 0;
    v.spawn(def, path, s, cargo);
    v.thinkTimer = range(this.rng, 0, this.cfg.thinkInterval);
    return v;
  }

  update(dt: number): void {
    for (const v of this.vehicles) {
      if (!v.inUse) continue;
      if (!v.alive) {
        if (!v.deathHandled) this.onDestroyed(v);
        v.update(dt);
        continue;
      }
      if (v.state === 'driving') this.driveStep(v, dt);
      if (v.state === 'unloading') this.unloadStep(v, dt);
      if (v.def.dps > 0) this.gunStep(v, dt);
    }
  }

  /**
   * True if a vehicle or wreck sits just ahead of `v` on its lane. The look-ahead grows with
   * braking distance, so a fast vehicle still stops `blockDistance` short.
   */
  blocked(v: Vehicle): boolean {
    return this.look(v).blocked;
  }

  /**
   * What is ahead of `v`: `blocked` if it must brake now (a moving vehicle in its lane, or an
   * obstacle it can't get around yet), and `obstacle`, the nearest wreck or stopped vehicle in
   * its lane that it could swerve around (M7 play test: wrecks used to plug the road for good).
   */
  private look(v: Vehicle): { blocked: boolean; obstacle: Vehicle | null } {
    const c = this.cfg;
    const reach = c.blockDistance + (v.speed * v.speed) / (2 * c.brake);
    const h = v.roadHeading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    let blocked = false;
    let obstacle: Vehicle | null = null;
    let nearest = Infinity;
    for (const o of this.vehicles) {
      if (o === v || !o.inUse) continue;
      const rx = o.position.x - v.position.x;
      const rz = o.position.z - v.position.z;
      const ahead = rx * fx + rz * fz;
      if (ahead <= 0 || ahead > reach) continue;
      const side = rx * fz - rz * fx; // + toward (cos h, −sin h), like `lateral`
      // Already swerving: what matters is where it is going, not where it is now.
      const steer = o === v.passing ? v.lateralTarget - v.lateral : 0;
      if (Math.abs(side - steer) >= c.blockWidth) {
        // Off to the side, but too close to slip past before the swerve is done.
        if (Math.abs(side) < c.blockWidth && ahead < this.clearance(v, o)) blocked = true;
        continue;
      }
      if (o.alive && o.state === 'driving') blocked = true; // queue behind a moving vehicle
      else if (ahead < nearest) {
        nearest = ahead;
        obstacle = o;
      }
    }
    return { blocked, obstacle };
  }

  /** Nose-to-tail distance between two vehicles, plus a little room. */
  private clearance(a: Vehicle, b: Vehicle): number {
    return (a.def.length + b.def.length) / 2 + 2;
  }

  private driveStep(v: Vehicle, dt: number): void {
    const c = this.cfg;
    const look = this.look(v);
    const obstacle = look.obstacle;
    let blocked = look.blocked;
    if (obstacle && obstacle !== v.passing) {
      // Pass on the side away from it, if that stays near the road.
      const h = v.roadHeading;
      const rx = obstacle.position.x - v.position.x;
      const rz = obstacle.position.z - v.position.z;
      const at = rx * Math.cos(h) - rz * Math.sin(h) + v.lateral; // its offset from the centerline
      const target = at >= 0 ? at - c.swerveOffset : at + c.swerveOffset;
      if (Math.abs(target) <= c.swerveMax) {
        v.passing = obstacle;
        v.lateralTarget = target;
      } else blocked = true; // no room (wrecks side by side): stop, as before
    } else if (obstacle) {
      // Still in its lane after picking a side: slide over before reaching it.
      if (Math.abs(v.lateralTarget - v.lateral) > 0.3) {
        const d = obstacle.position.distanceTo(v.position);
        if (d < this.clearance(v, obstacle)) blocked = true;
      }
    }
    // Past what it was going around: back to the middle of the road.
    if (v.passing && !obstacle && this.behind(v, v.passing)) {
      v.passing = null;
      v.lateralTarget = 0;
    }
    v.drive(dt, blocked, v.passing ? c.swerveSpeed : Infinity);
    // Waiting for its own swerve to finish isn't being stuck.
    const swerving = v.passing !== null && Math.abs(v.lateralTarget - v.lateral) > 0.3;
    v.blockedFor = blocked && v.speed === 0 && !swerving ? v.blockedFor + dt : 0;
    // At its spot, or stuck behind a wreck/queue for a while: stop here (PLAN.md §7.10).
    if (v.arrived || v.blockedFor >= c.blockedWait) {
      v.speed = 0;
      v.state = v.cargo > 0 ? 'unloading' : v.def.cargoMax > 0 ? 'parked' : 'stopped';
    }
  }

  /** True once `o` is fully behind `v` (its tail clear of `v`'s rear). */
  private behind(v: Vehicle, o: Vehicle): boolean {
    const h = v.roadHeading;
    const ahead =
      (o.position.x - v.position.x) * Math.sin(h) + (o.position.z - v.position.z) * Math.cos(h);
    return ahead < -this.clearance(v, o);
  }

  /** One soldier climbs out of the back every `unloadInterval` seconds. */
  private unloadStep(v: Vehicle, dt: number): void {
    v.unloadTimer -= dt;
    if (v.unloadTimer > 0) return;
    v.unloadTimer = this.cfg.unloadInterval;
    this.dropPoint(v, 1.5);
    const def = this.rng() < this.machineGunnerChance ? INFANTRY.machineGunner : INFANTRY.rifleman;
    const home = v.path?.start;
    if (this.units.spawnEnemy(def, this.drop.x, this.drop.z, { home })) v.cargo--;
    else v.cargo = 0; // no room for more soldiers: the rest stay inside
    if (v.cargo <= 0) v.state = 'parked';
  }

  /** Mounted gun: pick the nearest friendly now and then; fire while it is in range and sight. */
  private gunStep(v: Vehicle, dt: number): void {
    if (v.state === 'driving' && !v.def.firesWhileMoving) return;
    this.gun.set(v.position.x, v.position.y - v.def.lift + v.def.gunHeight, v.position.z);
    v.thinkTimer -= dt;
    if (v.thinkTimer <= 0) {
      v.thinkTimer += this.cfg.thinkInterval;
      const t = this.units.nearestFriendlyTo(v.position);
      const inRange =
        t !== null &&
        Math.hypot(t.position.x - v.position.x, t.position.z - v.position.z) <= v.def.range;
      v.target = inRange && this.units.canSeeFrom(this.gun, t) ? t : null;
    }
    const t = v.target;
    if (!t || !t.alive) return;
    this.units.damageTeam(v.position, t, v.def.dps, v.def.range, dt);
    v.fireTimer -= dt;
    if (v.fireTimer <= 0) {
      v.fireTimer = range(this.rng, this.cfg.burstMin, this.cfg.burstMax);
      this.units.burstFrom(this.gun, t, v.def.burst, 'enemy', true);
    }
  }

  /** Soldiers still inside bail out and run (`bailChance`) or die with it (player kills). */
  private onDestroyed(v: Vehicle): void {
    v.deathHandled = true;
    v.target = null;
    const by = v.killedBy ?? 'team';
    for (let k = 0; k < v.cargo; k++) {
      if (this.rng() < this.cfg.bailChance) {
        this.dropPoint(v, range(this.rng, 1, 4));
        const e = this.units.spawnEnemy(INFANTRY.rifleman, this.drop.x, this.drop.z, {
          home: v.path?.start,
        });
        if (e) this.units.scare(e, v.position.x, v.position.z, range(this.rng, 4, 7));
      } else {
        this.bus.emit('unitKilled', { kind: 'infantry', by });
      }
    }
    v.cargo = 0;
  }

  /** A spot behind the vehicle (tailgate), scattered sideways. */
  private dropPoint(v: Vehicle, back: number): Vector3 {
    const fx = Math.sin(v.heading);
    const fz = Math.cos(v.heading);
    const side = range(this.rng, -1.5, 1.5);
    const behind = v.def.length / 2 + back;
    return this.drop.set(
      v.position.x - fx * behind - fz * side,
      0,
      v.position.z - fz * behind + fx * side,
    );
  }
}
