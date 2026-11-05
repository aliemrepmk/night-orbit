import { Vector3 } from 'three';
import { CoverSet, type CoverPoint } from '../ai/CoverPoints';
import { decide } from '../ai/EnemyBrain';
import type { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { range, type Rng } from '../core/rng';
import type { Target } from '../combat/Explosions';
import { WEAPONS, type WeaponId } from '../gunship/weaponDefs';
import { Infantry } from './Infantry';
import { SpatialGrid } from './SpatialGrid';
import { Squad, type RoutePoint } from './Squad';
import { TeamHealth } from './TeamHealth';
import { INFANTRY, type InfantryDef } from './unitDefs';

/** A short visual tracer flying between two soldiers (no damage of its own). */
export interface GroundTracer {
  readonly from: Vector3;
  readonly to: Vector3;
  age: number;
  duration: number;
  active: boolean;
  side: 'enemy' | 'friendly';
}

/**
 * Fraction of an enemy's DPS that hurts the team at distance `d` (PLAN.md §7.8): best up
 * close, worst at the edge of its range.
 */
export function enemyAccuracy(
  d: number,
  maxRange: number,
  cfg: { readonly accuracyNear: number; readonly accuracyFar: number } = CONFIG.enemyFire,
): number {
  const t = Math.min(1, Math.max(0, d / maxRange));
  return cfg.accuracyNear + (cfg.accuracyFar - cfg.accuracyNear) * t;
}

type Numeric<T> = { readonly [K in keyof T]: number };

/** The config slices the unit simulation reads (numbers widened so tests can override them). */
export interface UnitsConfig {
  readonly infantry: Numeric<typeof CONFIG.infantry>;
  readonly enemyFire: Numeric<typeof CONFIG.enemyFire>;
  readonly ridgeback: Numeric<typeof CONFIG.ridgeback>;
  readonly groundFire: Numeric<typeof CONFIG.groundFire>;
  readonly ai: Numeric<typeof CONFIG.ai>;
}

/** What soldiers need to know about the world: what blocks sight and what blocks walking. */
export interface UnitWorld {
  lineOfSight(from: Vector3, to: Vector3): boolean;
  /** Moves (x, z) out of any building (grown by `radius`) into `out`; true if it moved. */
  pushOut(x: number, z: number, radius: number, out: { x: number; z: number }): boolean;
}

/** Open ground: nothing blocks anything (tests, and before a map exists). */
export const OPEN_GROUND: UnitWorld = {
  lineOfSight: () => true,
  pushOut: (x, z, _r, out) => {
    out.x = x;
    out.z = z;
    return false;
  },
};

export interface UnitOptions {
  readonly world?: UnitWorld;
  readonly cover?: CoverSet;
  readonly cfg?: UnitsConfig;
}

export interface SpawnOptions {
  /** Where a broken soldier runs back to (defaults to the spawn point). */
  readonly home?: { readonly x: number; readonly z: number };
  /** Approach path to follow before heading straight for Ridgeback. */
  readonly path?: Path | null;
}

/** Spatial grid cell size (PLAN.md §7.11: 20 m). */
const CELL = 20;

/**
 * Owns every soldier on both sides (PLAN.md §7.8–7.11, §6 step 7). Enemies think at 4 Hz
 * (`ai/EnemyBrain`): advance on Ridgeback, take cover at free cover points, fire when they can
 * see it (draining team health), and panic or break when blasts and losses shake them.
 * Ridgeback walks its route in formation and shoots back while holding. A spatial grid serves
 * blast, separation and nearest-target queries. Pure logic: rendering lives in `InfantryRenderer`.
 */
export class UnitManager {
  readonly enemies: Infantry[] = [];
  readonly friendlies: Infantry[] = [];
  readonly team: TeamHealth;
  readonly squad: Squad;
  readonly tracers: GroundTracer[] = [];
  /** Non-infantry targets (vehicles) that blasts can hit. */
  private readonly others: Target[] = [];
  private readonly grid = new SpatialGrid<Target>(CELL);
  /** Result buffers: blast queries and separation must not share one. */
  private readonly scratch: Target[] = [];
  private readonly neighbors: Target[] = [];
  private readonly slotPos = new Vector3();
  private readonly aimPos = new Vector3();
  private readonly eyeA = new Vector3();
  private readonly eyeB = new Vector3();
  private readonly pushed = { x: 0, z: 0 };
  private readonly world: UnitWorld;
  readonly cover: CoverSet;
  private readonly cfg: UnitsConfig;
  private nextId = 0;
  private nextTracer = 0;
  private failed = false;
  time = 0;
  /** Called for every visible burst (Game hooks the muzzle-flash effect in). */
  onMuzzleFlash: (at: Vector3) => void = () => {};

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly bus: EventBus<GameEvents>,
    private readonly rng: Rng,
    route: readonly RoutePoint[],
    options: UnitOptions = {},
  ) {
    const cfg = (this.cfg = options.cfg ?? CONFIG);
    this.world = options.world ?? OPEN_GROUND;
    this.cover = options.cover ?? new CoverSet();
    this.team = new TeamHealth(cfg.ridgeback);
    this.squad = new Squad(route, cfg.ridgeback);
    for (let i = 0; i < 4; i++) {
      const f = new Infantry(this.nextId++, 'friendly', INFANTRY.ridgeback, groundAt, cfg.infantry);
      this.squad.slot(i, this.slotPos);
      f.spawn(INFANTRY.ridgeback, this.slotPos.x, this.slotPos.z, this.squad.heading);
      f.fireTimer = range(rng, 0, cfg.ridgeback.fireIntervalMax);
      this.friendlies.push(f);
    }
    for (let i = 0; i < cfg.groundFire.maxTracers; i++) {
      this.tracers.push({
        from: new Vector3(),
        to: new Vector3(),
        age: 0,
        duration: 0,
        active: false,
        side: 'enemy',
      });
    }
    this.rebuildGrid();
    // Morale (PLAN.md §7.11): survivors of a big blast nearby panic and run.
    bus.on('impact', (e) => this.onImpact(e.pos, e.weapon));
  }

  /** Adds a non-infantry target (vehicle) that blasts and the grid should know about. */
  addTarget(t: Target): void {
    this.others.push(t);
  }

  get aliveEnemies(): number {
    let n = 0;
    for (const e of this.enemies) if (e.alive) n++;
    return n;
  }

  /** Squad center (the leader's slot), e.g. for the orbit to follow. */
  get teamPosition(): Vector3 {
    return this.squad.anchor;
  }

  /**
   * Spawns an enemy at (x, z). Reuses the longest-dead body once the unit budget is full;
   * returns null if every slot holds a living soldier.
   */
  spawnEnemy(def: InfantryDef, x: number, z: number, opts: SpawnOptions = {}): Infantry | null {
    let u: Infantry | null = null;
    if (this.enemies.length + this.friendlies.length < this.cfg.infantry.maxUnits) {
      u = new Infantry(this.nextId++, 'enemy', def, this.groundAt, this.cfg.infantry);
      this.enemies.push(u);
    } else {
      for (const e of this.enemies) {
        if (!e.alive && e.state === 'dead' && (!u || e.sinceDeath > u.sinceDeath)) u = e;
      }
      if (!u) return null;
    }
    const f = this.friendlies[0];
    u.spawn(def, x, z, Math.atan2(f.position.x - x, f.position.z - z));
    const ef = this.cfg.enemyFire;
    u.standoff = range(this.rng, ef.standoffMin, ef.standoffMax);
    u.thinkTimer = range(this.rng, 0, this.cfg.infantry.thinkInterval); // staggered thinking
    u.fireTimer = range(this.rng, 0, ef.burstMax);
    if (opts.home) u.home.set(opts.home.x, 0, opts.home.z);
    u.path = opts.path ?? null;
    return u;
  }

  /** Living targets within `radius` (ground distance) of `center`, for blasts. */
  targetsNear(center: Vector3, radius: number): Target[] {
    this.scratch.length = 0;
    return this.grid.queryRadius(center.x, center.z, radius, this.scratch);
  }

  update(dt: number): void {
    this.time += dt;
    this.squad.update(dt);
    this.handleDeaths();
    this.rebuildGrid();
    for (let i = 0; i < this.friendlies.length; i++) this.updateFriendly(this.friendlies[i], i, dt);
    for (const e of this.enemies) if (e.alive) this.updateEnemy(e, dt);
    for (const f of this.friendlies) this.integrate(f, dt);
    for (const e of this.enemies) this.integrate(e, dt);
    this.updateTracers(dt);

    this.team.update(dt);
    if (this.team.overrun && !this.failed) {
      this.failed = true;
      this.bus.emit('missionFailed', { reason: 'team_overrun' });
    }
  }

  private rebuildGrid(): void {
    this.grid.clear();
    for (const f of this.friendlies) if (f.alive) this.grid.insert(f);
    for (const e of this.enemies) if (e.alive) this.grid.insert(e);
    for (const o of this.others) if (o.alive) this.grid.insert(o);
  }

  /** Ridgeback member: keep its formation slot; while holding, shoot the nearest enemy. */
  private updateFriendly(f: Infantry, index: number, dt: number): void {
    if (!f.alive) {
      f.velocity.set(0, 0, 0);
      return;
    }
    const slot = this.squad.slot(index, this.slotPos);
    this.arrive(f, slot.x, slot.z, f.def.speed);

    const rb = this.cfg.ridgeback;
    f.fireTimer -= dt;
    if (this.squad.moving || f.fireTimer > 0) return;
    f.fireTimer = range(this.rng, rb.fireIntervalMin, rb.fireIntervalMax);
    const target = this.grid.nearest(
      f.position.x,
      f.position.z,
      rb.fireRange,
      (t) => t.side === 'enemy' && t.kind === 'infantry' && t.alive && this.canSee(f, t),
    ) as Infantry | null;
    if (!target) return;
    f.turnToward(Math.atan2(target.position.x - f.position.x, target.position.z - f.position.z), 1);
    this.burst(f, target, 'friendly');
    const hit = rb.hitChance * (target.crouched ? this.cfg.ai.coverHitFactor : 1);
    if (this.rng() < hit) {
      target.takeDamage(target.def.hp, 'team', f.position);
      if (!target.alive) this.bus.emit('unitKilled', { kind: 'infantry', by: 'team' });
    }
  }

  /** One enemy tick: think every `thinkInterval` (staggered), then carry out the decision. */
  private updateEnemy(e: Infantry, dt: number): void {
    e.thinkTimer -= dt;
    if (e.thinkTimer <= 0 || !e.target) {
      e.thinkTimer += this.cfg.infantry.thinkInterval;
      if (e.thinkTimer <= 0) e.thinkTimer = this.cfg.infantry.thinkInterval;
      this.think(e);
    }
    this.act(e, dt);
    this.separate(e);
  }

  /** Gathers the situation and asks `EnemyBrain.decide` what to do (PLAN.md §7.11). */
  private think(e: Infantry): void {
    const ai = this.cfg.ai;
    const t = (e.target = this.nearestFriendly(e));
    const dist = t
      ? Math.hypot(t.position.x - e.position.x, t.position.z - e.position.z)
      : Infinity;
    // Line of sight only matters once the target is in range (saves most of the checks).
    const los = t !== null && dist <= e.def.range && this.canSee(e, t);

    const shaken = e.stress >= ai.lossesToBreak || e.wounded;
    let roll = 1;
    if (shaken) {
      roll = this.rng();
      e.stress = 0;
      e.wounded = false;
    }

    let found: CoverPoint | null = null;
    if (!e.cover && t && e.fleeLeft <= 0 && dist <= e.def.range * ai.coverEngageFactor) {
      found = this.findCover(e, t, dist);
    }

    const action = decide({
      fleeLeft: e.fleeLeft,
      shaken,
      roll,
      fleeChance: ai.fleeChance,
      hasTarget: t !== null,
      targetDist: dist,
      range: e.def.range,
      standoff: e.standoff,
      lineOfSight: los,
      wasFiring: e.action === 'fire',
      coverReserved: e.cover !== null,
      inCover: e.inCover,
      coverAvailable: found !== null,
    });

    if (action === 'flee' && e.fleeLeft <= 0) this.rout(e, t);
    else if (action === 'takeCover' && !e.cover && found && this.cover.reserve(found, e.id)) {
      e.cover = found;
      e.inCover = false;
    } else if (action === 'advance' && e.cover) {
      // Couldn't see from this cover: move on, and don't come straight back to it.
      e.rejectedCover = e.cover.id;
      this.releaseCover(e);
    }
    e.action = action;
  }

  /** Carries out the current decision every tick (steering, firing). */
  private act(e: Infantry, dt: number): void {
    const t = e.target;
    switch (e.action) {
      case 'flee': {
        e.state = 'fleeing';
        e.fleeLeft -= dt;
        if (e.fleeLeft <= 0) {
          e.fleeLeft = 0;
          e.thinkTimer = 0; // rally: decide again right away
        }
        this.moveToward(e, e.fleeTo.x, e.fleeTo.z, e.def.speed * this.cfg.ai.fleeSpeedFactor);
        return;
      }
      case 'takeCover': {
        const c = e.cover;
        if (!c) {
          e.thinkTimer = 0;
          return;
        }
        e.state = 'moving';
        if (Math.hypot(c.x - e.position.x, c.z - e.position.z) <= this.cfg.ai.coverArrive) {
          e.inCover = true;
          e.velocity.set(0, 0, 0);
          e.state = 'idle';
          e.thinkTimer = 0; // in position: decide whether to fire
          return;
        }
        this.moveToward(e, c.x, c.z, e.def.speed);
        return;
      }
      case 'fire': {
        if (!t || !t.alive) {
          e.thinkTimer = 0;
          return;
        }
        const dx = t.position.x - e.position.x;
        const dz = t.position.z - e.position.z;
        const dist = Math.hypot(dx, dz);
        e.velocity.set(0, 0, 0);
        if (dist > e.def.range) {
          e.thinkTimer = 0; // the target walked out of range
          return;
        }
        e.state = 'firing';
        e.turnToward(Math.atan2(dx, dz), dt);
        this.team.damage(e.def.dps * enemyAccuracy(dist, e.def.range, this.cfg.enemyFire) * dt);
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          const ef = this.cfg.enemyFire;
          e.fireTimer = range(this.rng, ef.burstMin, ef.burstMax);
          this.burst(e, t, 'enemy');
        }
        return;
      }
      case 'advance': {
        e.state = 'moving';
        if (e.path && e.pathS < e.path.length) {
          // Follow the approach path: chase a point a few meters ahead of the last one reached.
          const p = this.aimPos;
          e.path.pointAt(e.pathS, p);
          while (
            e.pathS < e.path.length &&
            Math.hypot(p.x - e.position.x, p.z - e.position.z) < 6
          ) {
            e.pathS += 2;
            e.path.pointAt(e.pathS, p);
          }
          this.moveToward(e, p.x, p.z, e.def.speed);
        } else if (t) {
          this.moveToward(e, t.position.x, t.position.z, e.def.speed);
        }
        return;
      }
      case 'hold':
        e.velocity.set(0, 0, 0);
        e.state = 'idle';
        return;
    }
  }

  /** A broken soldier runs back toward where it came from (or straight away if it's there). */
  private rout(e: Infantry, from: Infantry | null): void {
    const ai = this.cfg.ai;
    this.releaseCover(e);
    e.fleeLeft = range(this.rng, ai.routMin, ai.routMax);
    const hx = e.home.x - e.position.x;
    const hz = e.home.z - e.position.z;
    if (Math.hypot(hx, hz) > 20 || !from) {
      e.fleeTo.set(e.home.x, 0, e.home.z);
    } else {
      this.awayFrom(e, from.position.x, from.position.z, 150);
    }
  }

  /** Survivors near a blast with a panic radius (105 mm) run from it for a few seconds. */
  private onImpact(pos: Vector3, weapon: WeaponId): void {
    const r = WEAPONS[weapon].panicRadius;
    if (r <= 0) return;
    const ai = this.cfg.ai;
    this.neighbors.length = 0;
    this.grid.queryRadius(pos.x, pos.z, r, this.neighbors);
    for (const t of this.neighbors) {
      if (t.side !== 'enemy' || t.kind !== 'infantry' || !t.alive) continue;
      const e = t as Infantry;
      this.releaseCover(e);
      e.action = 'flee';
      e.state = 'fleeing';
      e.fleeLeft = Math.max(e.fleeLeft, range(this.rng, ai.panicMin, ai.panicMax));
      this.awayFrom(e, pos.x, pos.z, 60);
    }
  }

  private awayFrom(e: Infantry, x: number, z: number, dist: number): void {
    let ax = e.position.x - x;
    let az = e.position.z - z;
    const d = Math.hypot(ax, az);
    if (d < 1e-3) {
      ax = Math.cos(e.id);
      az = Math.sin(e.id);
    } else {
      ax /= d;
      az /= d;
    }
    e.fleeTo.set(e.position.x + ax * dist, 0, e.position.z + az * dist);
  }

  /**
   * Nearest free cover point that is worth taking: close to the soldier, within reach of the
   * target, not farther from it than the soldier already is, and either with a view of the
   * target or at least `coverBound` meters closer to it.
   */
  private findCover(e: Infantry, t: Infantry, dist: number): CoverPoint | null {
    const ai = this.cfg.ai;
    const reach = e.def.range * ai.coverReach;
    const eye = this.eyeA;
    this.eyeB.copy(t.position).setY(t.position.y + ai.eyeHeight);
    return this.cover.nearestFree(e.position.x, e.position.z, ai.coverSearchRadius, (p) => {
      if (p.id === e.rejectedCover) return false;
      const d = Math.hypot(p.x - t.position.x, p.z - t.position.z);
      if (d > reach || d > dist + 5) return false;
      // Cover that moves it well forward is worth taking even without a view from it: it
      // bounds from corner to corner toward the team.
      if (d <= dist - ai.coverBound) return true;
      eye.set(p.x, this.groundAt(p.x, p.z) + this.cfg.infantry.lift + ai.eyeHeight, p.z);
      return this.world.lineOfSight(eye, this.eyeB);
    });
  }

  private releaseCover(e: Infantry): void {
    if (e.cover) this.cover.release(e.cover, e.id);
    e.cover = null;
    e.inCover = false;
  }

  /** Eye-to-eye line of sight between two soldiers. */
  private canSee(a: Target, b: Target): boolean {
    const h = this.cfg.ai.eyeHeight;
    this.eyeA.copy(a.position).setY(a.position.y + h);
    this.eyeB.copy(b.position).setY(b.position.y + h);
    return this.world.lineOfSight(this.eyeA, this.eyeB);
  }

  /** Reacts once to each new enemy death: frees its cover and shakes the soldiers around it. */
  private handleDeaths(): void {
    const r2 = this.cfg.ai.moraleRadius ** 2;
    for (const d of this.enemies) {
      if (d.alive || d.deathHandled) continue;
      d.deathHandled = true;
      this.releaseCover(d);
      for (const o of this.enemies) {
        if (!o.alive) continue;
        if ((o.position.x - d.position.x) ** 2 + (o.position.z - d.position.z) ** 2 <= r2) {
          o.stress++;
        }
      }
    }
  }

  /** Moves a soldier, then keeps it out of buildings (it slides along the wall it hit). */
  private integrate(u: Infantry, dt: number): void {
    u.update(dt);
    if (!u.alive) return;
    u.wallLeft = Math.max(0, u.wallLeft - dt);
    if (u.wallLeft === 0) u.slideSign = 0;
    const { x, z } = u.position;
    if (!this.world.pushOut(x, z, this.cfg.ai.bodyRadius, this.pushed)) return;
    const nx = this.pushed.x - x;
    const nz = this.pushed.z - z;
    const n = Math.hypot(nx, nz);
    if (n > 1e-6) u.wallNormal.set(nx / n, 0, nz / n);
    u.wallLeft = this.cfg.ai.wallSlideTime;
    u.position.x = this.pushed.x;
    u.position.z = this.pushed.z;
    u.position.y = this.groundAt(u.position.x, u.position.z) + this.cfg.infantry.lift;
  }

  private nearestFriendly(e: Infantry): Infantry | null {
    let best: Infantry | null = null;
    let bestD = Infinity;
    for (const f of this.friendlies) {
      if (!f.alive) continue;
      const d = (f.position.x - e.position.x) ** 2 + (f.position.z - e.position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  /** Seek a point and slow down when close (arrive steering), plus separation. */
  private arrive(u: Infantry, x: number, z: number, maxSpeed: number): void {
    this.moveToward(u, x, z, maxSpeed);
    this.separate(u);
  }

  /**
   * Arrive steering toward (x, z). After bumping into a wall the part of the velocity going
   * into it is dropped, and a soldier walking straight at it turns along it instead.
   */
  private moveToward(u: Infantry, x: number, z: number, maxSpeed: number): void {
    const dx = x - u.position.x;
    const dz = z - u.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.3) {
      u.velocity.set(0, 0, 0);
      return;
    }
    const speed = Math.min(maxSpeed, dist * 1.5);
    let vx = (dx / dist) * speed;
    let vz = (dz / dist) * speed;
    if (u.wallLeft > 0) {
      const n = u.wallNormal;
      if (vx * n.x + vz * n.z < 0) {
        // Walking into the wall: slide along it instead, in one committed direction (so a
        // target straight behind the wall's middle doesn't make it dither on the spot).
        const tx = -n.z;
        const tz = n.x;
        if (u.slideSign === 0) {
          const along = vx * tx + vz * tz;
          u.slideSign = along > 0 || (along === 0 && u.id % 2 === 0) ? 1 : -1;
        }
        vx = tx * u.slideSign * speed;
        vz = tz * u.slideSign * speed;
      }
    }
    u.velocity.set(vx, 0, vz);
  }

  /** Pushes a soldier away from soldiers closer than the separation distance (via the grid). */
  private separate(u: Infantry): void {
    const { separation, separationStrength } = this.cfg.infantry;
    this.neighbors.length = 0;
    this.grid.queryRadius(u.position.x, u.position.z, separation, this.neighbors);
    for (const o of this.neighbors) {
      if (o === u || o.kind !== 'infantry') continue;
      const dx = u.position.x - o.position.x;
      const dz = u.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      // Exactly on top of each other: push along a direction derived from the id.
      const nx = d > 1e-4 ? dx / d : Math.cos(u.id);
      const nz = d > 1e-4 ? dz / d : Math.sin(u.id);
      const push = separationStrength * (1 - d / separation);
      u.velocity.x += nx * push;
      u.velocity.z += nz * push;
    }
  }

  /** A visible burst: muzzle flash plus a few tracers that scatter around the target. */
  private burst(from: Infantry, to: Infantry, side: 'enemy' | 'friendly'): void {
    this.onMuzzleFlash(from.position);
    const g = this.cfg.groundFire;
    for (let k = 0; k < from.def.burst; k++) {
      const tr = this.tracers[this.nextTracer];
      this.nextTracer = (this.nextTracer + 1) % this.tracers.length;
      tr.from.copy(from.position);
      tr.from.y += 0.3;
      this.aimPos.set(
        to.position.x + range(this.rng, -3, 3),
        to.position.y + range(this.rng, -1, 1),
        to.position.z + range(this.rng, -3, 3),
      );
      tr.to.copy(this.aimPos);
      tr.duration = tr.from.distanceTo(tr.to) / g.tracerSpeed;
      tr.age = -k * 0.07; // rounds leave the barrel one after another
      tr.active = true;
      tr.side = side;
    }
  }

  private updateTracers(dt: number): void {
    for (const tr of this.tracers) {
      if (!tr.active) continue;
      tr.age += dt;
      if (tr.age >= tr.duration) tr.active = false;
    }
  }
}
