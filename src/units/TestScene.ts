import { Path, type PathPoint } from '../ai/Paths';
import { CONFIG } from '../config';
import { range, type Rng } from '../core/rng';
import type { RoutePoint } from './Squad';
import type { UnitManager } from './UnitManager';
import { INFANTRY } from './unitDefs';
import type { VehicleManager } from './VehicleManager';
import { VEHICLES, type VehicleDef } from './vehicleDefs';

/**
 * TEMPORARY M4/M5 test scene (M6 brings the real map, M7 the mission script): Ridgeback walks
 * around the west and south of the placeholder village, back and forth, while enemy groups
 * keep arriving from every direction and convoys drive in on four roads.
 */
export const TEST_ROUTE: readonly RoutePoint[] = [
  { x: -430, z: 300 },
  { x: -260, z: 210 },
  { x: -190, z: 20 },
  { x: -175, z: -190 },
  { x: 40, z: -235 },
  { x: 250, z: -175 },
  { x: 330, z: -125 },
];

/**
 * Roads from the map edge toward the team's route, each ending ~200 m short of it, where trucks
 * unload and technicals open fire (west, north, east and south).
 */
export const TEST_ROADS: readonly (readonly PathPoint[])[] = [
  [
    { x: -780, z: -60 },
    { x: -560, z: -30 },
    { x: -420, z: -70 },
    { x: -340, z: -60 },
  ],
  [
    { x: 130, z: -780 },
    { x: 90, z: -600 },
    { x: 115, z: -440 },
  ],
  [
    { x: 780, z: -40 },
    { x: 640, z: -70 },
    { x: 530, z: -30 },
  ],
  [
    { x: -40, z: 780 },
    { x: -110, z: 580 },
    { x: -190, z: 420 },
  ],
];

export type TestSceneConfig = { readonly [K in keyof typeof CONFIG.testScene]: number };

/** Enemies stay inside the playable map (with a margin). */
const MAP_LIMIT = CONFIG.map.size / 2 - 20;

/** Keeps groups of enemies coming at the team, up to `maxEnemies` alive at once. */
export class WaveSpawner {
  private timer: number;
  private started = false;

  constructor(
    private readonly rng: Rng,
    private readonly cfg: TestSceneConfig = CONFIG.testScene,
  ) {
    this.timer = cfg.waveInterval;
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

  /** One group at a random bearing from the team, respecting the alive cap. */
  spawnGroup(units: UnitManager): number {
    const c = this.cfg;
    const room = c.maxEnemies - units.aliveEnemies;
    const size = Math.min(room, Math.round(range(this.rng, c.groupMin, c.groupMax)));
    if (size <= 0) return 0;
    const team = units.teamPosition;
    const bearing = range(this.rng, 0, Math.PI * 2);
    const dist = range(this.rng, c.spawnMin, c.spawnMax);
    const cx = clamp(team.x + Math.sin(bearing) * dist);
    const cz = clamp(team.z + Math.cos(bearing) * dist);
    let n = 0;
    for (let k = 0; k < size; k++) {
      const def = this.rng() < c.machineGunnerChance ? INFANTRY.machineGunner : INFANTRY.rifleman;
      const x = clamp(cx + range(this.rng, -c.groupRadius, c.groupRadius));
      const z = clamp(cz + range(this.rng, -c.groupRadius, c.groupRadius));
      if (units.spawnEnemy(def, x, z)) n++;
    }
    return n;
  }
}

function clamp(v: number): number {
  return Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, v));
}

/**
 * Sends a convoy every `convoyInterval` seconds down the road that ends nearest the team: a
 * truck in front, sometimes a technical and an APC behind it, `convoyGap` meters apart.
 */
export class ConvoySpawner {
  readonly roads: readonly Path[];
  private timer: number;

  constructor(
    private readonly rng: Rng,
    roads: readonly (readonly PathPoint[])[] = TEST_ROADS,
    private readonly cfg: TestSceneConfig = CONFIG.testScene,
  ) {
    this.roads = roads.map((r) => new Path(r));
    this.timer = cfg.convoyFirst;
  }

  /** Returns how many vehicles were spawned this tick. */
  update(dt: number, units: UnitManager, vehicles: VehicleManager): number {
    this.timer -= dt;
    if (this.timer > 0) return 0;
    this.timer += this.cfg.convoyInterval;
    return this.send(this.nearestRoad(units), vehicles);
  }

  /** The road whose end is closest to Ridgeback right now. */
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
