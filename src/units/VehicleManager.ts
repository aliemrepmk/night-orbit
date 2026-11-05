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
 * them from driving through each other or through wrecks (a destroyed vehicle blocks the road,
 * so the ones behind stop and unload early), unloads trucks, fires mounted guns at Ridgeback,
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
    const reach = this.cfg.blockDistance + (v.speed * v.speed) / (2 * this.cfg.brake);
    const h = v.roadHeading;
    const fx = Math.sin(h);
    const fz = Math.cos(h);
    for (const o of this.vehicles) {
      if (o === v || !o.inUse) continue;
      const rx = o.position.x - v.position.x;
      const rz = o.position.z - v.position.z;
      const ahead = rx * fx + rz * fz;
      if (ahead <= 0 || ahead > reach) continue;
      if (Math.abs(rx * fz - rz * fx) < this.cfg.blockWidth) return true;
    }
    return false;
  }

  private driveStep(v: Vehicle, dt: number): void {
    const blocked = this.blocked(v);
    v.drive(dt, blocked);
    v.blockedFor = blocked && v.speed === 0 ? v.blockedFor + dt : 0;
    // At its spot, or stuck behind a wreck/queue for a while: stop here (PLAN.md §7.10).
    if (v.arrived || v.blockedFor >= this.cfg.blockedWait) {
      v.speed = 0;
      v.state = v.cargo > 0 ? 'unloading' : v.def.cargoMax > 0 ? 'parked' : 'stopped';
    }
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
