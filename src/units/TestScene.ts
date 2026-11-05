import { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import { range, type Rng } from '../core/rng';
import type { RoutePoint } from './Squad';
import type { UnitManager } from './UnitManager';
import { INFANTRY } from './unitDefs';
import type { VehicleManager } from './VehicleManager';
import { VEHICLES, type VehicleDef } from './vehicleDefs';
import { MAP } from '../world/MapData';
import { toPathPoints, type MapData, type Vec2 } from '../world/mapTypes';

/**
 * TEMPORARY test scene on the real map (M7's mission script replaces it): Ridgeback walks its
 * whole journey (OP → fields → village → crossroads → LZ) back and forth, enemy groups keep
 * arriving along the map's approach paths and at its spawn points, and convoys drive the map's
 * vehicle paths.
 */

/** Ridgeback's full journey: every route segment in order, joined into one route. */
export function journeyRoute(map: MapData = MAP): RoutePoint[] {
  const out: RoutePoint[] = [];
  for (const id of map.routeOrder) {
    for (const [x, z] of map.friendlyRoutes[id]) {
      const last = out[out.length - 1];
      if (!last || Math.hypot(last.x - x, last.z - z) > 1) out.push({ x, z });
    }
  }
  return out;
}

export type TestSceneConfig = { readonly [K in keyof typeof CONFIG.testScene]: number };

/** Enemies stay inside the playable map (with a margin). */
const MAP_LIMIT = CONFIG.map.size / 2 - 20;

/** A place a group can appear: an approach path's start (the group then follows it), or a spawn point. */
interface SpawnSite {
  readonly x: number;
  readonly z: number;
  readonly path: Path | null;
  /** Time it was last used (anti spawn-camping). */
  lastUsed: number;
}

/** One soldier of a group waiting to appear (groups trickle in, they don't pop in at once). */
interface Pending {
  at: number;
  x: number;
  z: number;
  path: Path | null;
  machineGunner: boolean;
}

/**
 * Keeps groups of enemies coming at the team, up to `maxEnemies` alive at once. Against spawn
 * camping (user feedback, M6): a group appears at a random site between `spawnMin` and
 * `spawnMax` from the team that the sensor is NOT looking at and that hasn't been used for
 * `spawnCooldown` s, scattered over `groupRadius`, one soldier every `trickleInterval` s.
 */
export class WaveSpawner {
  private timer: number;
  private started = false;
  private time = 0;
  private readonly sites: SpawnSite[] = [];
  private readonly pending: Pending[] = [];

  constructor(
    private readonly rng: Rng,
    private readonly cfg: TestSceneConfig = CONFIG.testScene,
    /** Approach paths and spawn points come from here; null = random bearings only. */
    map: MapData | null = MAP,
  ) {
    this.timer = cfg.waveInterval;
    if (!map) return;
    for (const p of Object.values(map.enemyPaths)) {
      const path = new Path(toPathPoints(p.points));
      this.sites.push({ x: path.start.x, z: path.start.z, path, lastUsed: -Infinity });
    }
    for (const [x, z] of Object.values(map.spawnPoints).flat()) {
      // A spawn point at a path's start is that path's site already.
      if (this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) continue;
      this.sites.push({ x, z, path: null, lastUsed: -Infinity });
    }
  }

  /** Soldiers still waiting to appear. */
  get queued(): number {
    return this.pending.length;
  }

  /**
   * Queues new groups on schedule and lets queued soldiers appear. `aim` is where the sensor
   * is looking (no group appears near it). Returns how many soldiers appeared this tick.
   */
  update(dt: number, units: UnitManager, aim: { x: number; z: number } | null = null): number {
    this.time += dt;
    if (!this.started) {
      this.started = true;
      for (let g = 0; g < this.cfg.initialGroups; g++) this.queueGroup(units, aim);
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer += this.cfg.waveInterval;
        this.queueGroup(units, aim);
      }
    }
    let n = 0;
    while (this.pending.length > 0 && this.pending[0].at <= this.time) {
      const p = this.pending.shift()!;
      if (units.aliveEnemies >= this.cfg.maxEnemies) continue;
      const def = p.machineGunner ? INFANTRY.machineGunner : INFANTRY.rifleman;
      if (units.spawnEnemy(def, p.x, p.z, { path: p.path })) n++;
    }
    return n;
  }

  /** Spawns one whole group right away (tests, tools). */
  spawnGroup(units: UnitManager, aim: { x: number; z: number } | null = null): number {
    this.queueGroup(units, aim, 0);
    let n = 0;
    for (const p of this.pending.splice(0)) {
      const def = p.machineGunner ? INFANTRY.machineGunner : INFANTRY.rifleman;
      if (units.spawnEnemy(def, p.x, p.z, { path: p.path })) n++;
    }
    return n;
  }

  /** Picks a site and queues one group there; returns its size. */
  private queueGroup(
    units: UnitManager,
    aim: { x: number; z: number } | null,
    interval = this.cfg.trickleInterval,
  ): number {
    const c = this.cfg;
    const room = c.maxEnemies - units.aliveEnemies - this.pending.length;
    const size = Math.min(room, Math.round(range(this.rng, c.groupMin, c.groupMax)));
    if (size <= 0) return 0;
    const site = this.pickSite(units, aim);
    let cx: number;
    let cz: number;
    let path: Path | null = null;
    if (site) {
      site.lastUsed = this.time;
      cx = site.x;
      cz = site.z;
      path = site.path;
    } else {
      const team = units.teamPosition;
      const bearing = range(this.rng, 0, Math.PI * 2);
      const dist = range(this.rng, c.spawnMin, c.spawnMax);
      cx = clamp(team.x + Math.sin(bearing) * dist);
      cz = clamp(team.z + Math.cos(bearing) * dist);
    }
    // Queue after anything already waiting, so groups don't overlap in time either.
    let at = Math.max(
      this.time,
      this.pending.length ? this.pending[this.pending.length - 1].at : 0,
    );
    for (let k = 0; k < size; k++) {
      at += k === 0 ? 0 : interval * range(this.rng, 0.6, 1.4);
      this.pending.push({
        at,
        x: clamp(cx + range(this.rng, -c.groupRadius, c.groupRadius)),
        z: clamp(cz + range(this.rng, -c.groupRadius, c.groupRadius)),
        path,
        machineGunner: this.rng() < c.machineGunnerChance,
      });
    }
    return size;
  }

  /** A random rested site in the ring around the team, away from the sensor's aim point. */
  private pickSite(units: UnitManager, aim: { x: number; z: number } | null): SpawnSite | null {
    const c = this.cfg;
    const team = units.teamPosition;
    const ok = (s: SpawnSite, rested: boolean) => {
      const d = Math.hypot(s.x - team.x, s.z - team.z);
      if (d < c.spawnMin || d > c.spawnMax) return false;
      if (aim && Math.hypot(s.x - aim.x, s.z - aim.z) < c.avoidAimRadius) return false;
      return !rested || this.time - s.lastUsed >= c.spawnCooldown;
    };
    // Prefer rested sites; if every site in range was used recently, take any not in view.
    let pool = this.sites.filter((s) => ok(s, true));
    if (pool.length === 0) pool = this.sites.filter((s) => ok(s, false));
    return pool.length ? pool[Math.floor(this.rng() * pool.length)] : null;
  }
}

function clamp(v: number): number {
  return Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, v));
}

/**
 * Sends a convoy every `convoyInterval` seconds along the map vehicle path that ends nearest the
 * team: a truck in front, sometimes a technical and an APC behind it, `convoyGap` meters apart.
 */
export class ConvoySpawner {
  readonly roads: readonly Path[];
  private timer: number;

  constructor(
    private readonly rng: Rng,
    roads: readonly (readonly Vec2[])[] = Object.values(MAP.vehiclePaths),
    private readonly cfg: TestSceneConfig = CONFIG.testScene,
  ) {
    this.roads = roads.map((r) => new Path(toPathPoints(r)));
    this.timer = cfg.convoyFirst;
  }

  /** Returns how many vehicles were spawned this tick. */
  update(dt: number, units: UnitManager, vehicles: VehicleManager): number {
    this.timer -= dt;
    if (this.timer > 0) return 0;
    this.timer += this.cfg.convoyInterval;
    return this.send(this.nearestRoad(units), vehicles);
  }

  /** The vehicle path whose end is closest to Ridgeback right now. */
  nearestRoad(units: UnitManager): Path {
    const t = units.teamPosition;
    let best = this.roads[0];
    let bestD = Infinity;
    for (const r of this.roads) {
      const d = Math.hypot(r.end.x - t.x, r.end.z - t.z);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  send(road: Path, vehicles: VehicleManager): number {
    const convoy: VehicleDef[] = [VEHICLES.truck];
    if (this.rng() < this.cfg.technicalChance) convoy.push(VEHICLES.technical);
    if (this.rng() < this.cfg.apcChance) convoy.push(VEHICLES.apc);
    let n = 0;
    for (let k = 0; k < convoy.length; k++) {
      // The lead starts farthest along, the rest queue up behind it.
      const s = (convoy.length - 1 - k) * this.cfg.convoyGap;
      if (vehicles.spawn(convoy[k], road, s)) n++;
    }
    return n;
  }
}
