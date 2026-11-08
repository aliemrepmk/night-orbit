import { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import { range, type Rng } from '../core/rng';
import type { RoutePoint } from './Squad';
import type { UnitManager } from './UnitManager';
import { INFANTRY, type InfantryType } from './unitDefs';
import type { VehicleManager } from './VehicleManager';
import { VEHICLES, type VehicleDef } from './vehicleDefs';
import { MAP } from '../world/MapData';
import { toPathPoints, type MapData, type Vec2, type ZoneId } from '../world/mapTypes';

/**
 * Where enemies come from on the map (PLAN.md §7.12, §7.14): groups that appear along the map's
 * approach paths and at its spawn points, trickling in away from where the sensor looks. The
 * mission script asks for groups at named sites (`queueAt`) and switches the background waves
 * on and off per zone (`auto`, `zone`). `ConvoySpawner` is the old free-running convoy loop
 * (kept for tests and tools; the mission sends its own convoys).
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

export type SpawningConfig = { readonly [K in keyof typeof CONFIG.spawning]: number };

/** Enemies stay inside the playable map (with a margin). */
const MAP_LIMIT = CONFIG.map.size / 2 - 20;

/** A place a group can appear: an approach path's start (the group then follows it), or a spawn point. */
interface SpawnSite {
  /** Enemy path id, or `zone:index` for a spawn point (how the mission script names it). */
  readonly id: string;
  readonly zone: ZoneId | null;
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
  /** Soldier type (a machine gunner by chance, or what the mission asked for). */
  type: InfantryType;
}

/**
 * Keeps groups of enemies coming at the team, up to `maxEnemies` alive at once. Against spawn
 * camping (user feedback, M6): a group appears at a random site between `spawnMin` and
 * `spawnMax` from the team that the sensor is NOT looking at and that hasn't been used for
 * `spawnCooldown` s, scattered over `groupRadius`, one soldier every `trickleInterval` s.
 */
export class WaveSpawner {
  /** Background waves on schedule (off: only the groups the mission asks for). */
  auto = true;
  /** Background waves only use sites of this zone (null: any site around the team). */
  zone: ZoneId | null = null;
  /** A background group was queued at (x, z) (M8+ Phase F: the radio calls it out). */
  onGroup: (x: number, z: number, size: number) => void = () => {};
  /** Seconds between background waves (starts at the config's). */
  waveInterval: number;
  private timer: number;
  private started = false;
  private time = 0;
  private readonly sites: SpawnSite[] = [];
  private readonly pending: Pending[] = [];

  constructor(
    private readonly rng: Rng,
    private readonly cfg: SpawningConfig = CONFIG.spawning,
    /** Approach paths and spawn points come from here; null = random bearings only. */
    private readonly map: MapData | null = MAP,
  ) {
    this.timer = this.waveInterval = cfg.waveInterval;
    if (!map) return;
    for (const [id, p] of Object.entries(map.enemyPaths)) {
      const path = new Path(toPathPoints(p.points));
      this.sites.push({
        id,
        zone: p.zone,
        x: path.start.x,
        z: path.start.z,
        path,
        lastUsed: -Infinity,
      });
    }
    for (const [zone, points] of Object.entries(map.spawnPoints) as [ZoneId, readonly Vec2[]][]) {
      points.forEach(([x, z], i) => {
        // A spawn point at a path's start is that path's site already.
        if (this.sites.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) return;
        this.sites.push({ id: `${zone}:${i}`, zone, x, z, path: null, lastUsed: -Infinity });
      });
    }
  }

  /** True if `id` names a site (an enemy path id or `zone:index`), for checking mission data. */
  hasSite(id: string): boolean {
    return this.siteById(id) !== null;
  }

  /**
   * The mission asks for a group of `count` at a named site (PLAN.md §7.14 `spawnWave`): they
   * trickle in like any group (and follow the site's approach path, if it has one). `zone:index`
   * names a spawn point; a spawn point at a path's start resolves to that path. Returns how many
   * were queued (fewer near the enemy cap), or 0 for an unknown site.
   */
  queueAt(units: UnitManager, id: string, count: number, type?: InfantryType): number {
    const site = this.siteById(id);
    if (!site) return 0;
    site.lastUsed = this.time;
    return this.enqueue(units, site.x, site.z, site.path, count, this.cfg.trickleInterval, type);
  }

  /** Drops every soldier still waiting to appear (phase skips). */
  clearQueue(): void {
    this.pending.length = 0;
  }

  private siteById(id: string): SpawnSite | null {
    const direct = this.sites.find((s) => s.id === id);
    if (direct) return direct;
    // `zone:index` of a spawn point that was merged into a path's site.
    const m = /^([a-z]+):(\d+)$/.exec(id);
    const pt = m ? this.map?.spawnPoints[m[1] as ZoneId]?.[Number(m[2])] : undefined;
    if (!pt) return null;
    return this.sites.find((s) => Math.hypot(s.x - pt[0], s.z - pt[1]) < 5) ?? null;
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
    if (!this.auto) {
      this.started = true; // the opening groups belong to the free-running mode only
      this.timer = this.waveInterval;
    } else if (!this.started) {
      this.started = true;
      for (let g = 0; g < this.cfg.initialGroups; g++) this.queueGroup(units, aim);
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer += this.waveInterval;
        this.queueGroup(units, aim);
      }
    }
    let n = 0;
    while (this.pending.length > 0 && this.pending[0].at <= this.time) {
      const p = this.pending.shift()!;
      if (units.aliveEnemies >= this.cfg.maxEnemies) continue;
      const def = INFANTRY[p.type];
      if (units.spawnEnemy(def, p.x, p.z, { path: p.path })) n++;
    }
    return n;
  }

  /** Spawns one whole group right away (tests, tools). */
  spawnGroup(units: UnitManager, aim: { x: number; z: number } | null = null): number {
    this.queueGroup(units, aim, 0);
    let n = 0;
    for (const p of this.pending.splice(0)) {
      const def = INFANTRY[p.type];
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
    const n = this.enqueue(units, cx, cz, path, size, interval);
    if (n > 0) this.onGroup(cx, cz, n);
    return n;
  }

  /** Queues `count` soldiers (capped by room under `maxEnemies`) scattered around (cx, cz). */
  private enqueue(
    units: UnitManager,
    cx: number,
    cz: number,
    path: Path | null,
    count: number,
    interval: number,
    type?: InfantryType,
  ): number {
    const c = this.cfg;
    const room = c.maxEnemies - units.aliveEnemies - this.pending.length;
    const size = Math.min(room, count);
    if (size <= 0) return 0;
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
        type: type ?? (this.rng() < c.machineGunnerChance ? 'machineGunner' : 'rifleman'),
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
      if (this.zone && s.zone !== this.zone) return false;
      return !rested || this.time - s.lastUsed >= c.spawnCooldown;
    };
    // Prefer rested sites; if every site in range was used recently, take any not in view.
    let pool = this.sites.filter((s) => ok(s, true));
    if (pool.length === 0) pool = this.sites.filter((s) => ok(s, false));
    // Zone waves with no site in the ring: any site of the zone the sensor isn't looking at.
    if (pool.length === 0 && this.zone) {
      pool = this.sites.filter(
        (s) =>
          s.zone === this.zone &&
          (!aim || Math.hypot(s.x - aim.x, s.z - aim.z) >= c.avoidAimRadius),
      );
    }
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
    private readonly cfg: SpawningConfig = CONFIG.spawning,
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
