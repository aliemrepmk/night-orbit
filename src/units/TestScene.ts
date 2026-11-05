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

/** Keeps groups of enemies coming at the team, up to `maxEnemies` alive at once. */
export class WaveSpawner {
  private timer: number;
  private started = false;

  private readonly paths: Path[];

  constructor(
    private readonly rng: Rng,
    private readonly cfg: TestSceneConfig = CONFIG.testScene,
    /** Approach paths and spawn points come from here; null = random bearings only. */
    private readonly map: MapData | null = MAP,
  ) {
    this.timer = cfg.waveInterval;
    this.paths = map
      ? Object.values(map.enemyPaths).map((p) => new Path(toPathPoints(p.points)))
      : [];
  }

  /** Returns how many enemies were spawned this tick. */
  update(dt: number, units: UnitManager): number {
    let spawned = 0;
    if (!this.started) {
      this.started = true;
      for (let g = 0; g < this.cfg.initialGroups; g++) spawned += this.spawnGroup(units);
      return spawned;
    }
    this.timer -= dt;
    if (this.timer > 0) return 0;
    this.timer += this.cfg.waveInterval;
    return this.spawnGroup(units);
  }

  /**
   * One group, respecting the alive cap: at the start of a map approach path between `spawnMin`
   * and `spawnMax` from the team (the group follows the path), else at a spawn point in that
   * ring, else at a random bearing.
   */
  spawnGroup(units: UnitManager): number {
    const c = this.cfg;
    const room = c.maxEnemies - units.aliveEnemies;
    const size = Math.min(room, Math.round(range(this.rng, c.groupMin, c.groupMax)));
    if (size <= 0) return 0;
    const team = units.teamPosition;
    const inRing = (p: Vec2) => {
      const d = Math.hypot(p[0] - team.x, p[1] - team.z);
      return d >= c.spawnMin && d <= c.spawnMax;
    };
    let cx: number;
    let cz: number;
    let path: Path | null = null;
    const paths = this.paths.filter((p) => inRing([p.start.x, p.start.z]));
    const spawns = this.map ? Object.values(this.map.spawnPoints).flat().filter(inRing) : [];
    if (paths.length > 0) {
      path = paths[Math.floor(this.rng() * paths.length)];
      cx = path.start.x;
      cz = path.start.z;
    } else if (spawns.length > 0) {
      [cx, cz] = spawns[Math.floor(this.rng() * spawns.length)];
    } else {
      const bearing = range(this.rng, 0, Math.PI * 2);
      const dist = range(this.rng, c.spawnMin, c.spawnMax);
      cx = clamp(team.x + Math.sin(bearing) * dist);
      cz = clamp(team.z + Math.cos(bearing) * dist);
    }
    let n = 0;
    for (let k = 0; k < size; k++) {
      const def = this.rng() < c.machineGunnerChance ? INFANTRY.machineGunner : INFANTRY.rifleman;
      const x = clamp(cx + range(this.rng, -c.groupRadius, c.groupRadius));
      const z = clamp(cz + range(this.rng, -c.groupRadius, c.groupRadius));
      if (units.spawnEnemy(def, x, z, { path })) n++;
    }
    return n;
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
