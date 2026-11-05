import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { ConvoySpawner, WaveSpawner, journeyRoute } from './TestScene';
import { MAP } from '../world/MapData';

const TEST_ROUTE = journeyRoute();
import { UnitManager } from './UnitManager';
import { VehicleManager } from './VehicleManager';

const DT = 1 / 60;
const flat = () => 0;
const cfg = CONFIG.testScene;

function rig() {
  const units = new UnitManager(flat, new EventBus<GameEvents>(), createRng(2), TEST_ROUTE);
  const spawner = new WaveSpawner(createRng(3));
  return { units, spawner };
}

describe('journeyRoute', () => {
  it('joins every route segment from the OP to the LZ without repeating the joints', () => {
    const route = journeyRoute();
    const total = MAP.routeOrder.reduce((n, id) => n + MAP.friendlyRoutes[id].length, 0);
    expect(route).toHaveLength(total - (MAP.routeOrder.length - 1));
    expect(route[0]).toEqual({ x: MAP.zones.op.center[0], z: MAP.zones.op.center[1] });
    expect(route[route.length - 1]).toEqual({
      x: MAP.zones.lz.center[0],
      z: MAP.zones.lz.center[1],
    });
  });
});

describe('WaveSpawner', () => {
  /** Records where every soldier appears (they start walking right away). */
  function recordSpawns(units: UnitManager) {
    const at: { x: number; z: number; t: number }[] = [];
    const orig = units.spawnEnemy.bind(units);
    let t = 0;
    units.spawnEnemy = (def, x, z, opts) => {
      at.push({ x, z, t });
      return orig(def, x, z, opts);
    };
    return { at, tick: (dt: number) => (t += dt) };
  }

  it('starts with a few groups at the configured distance from the team, trickling in', () => {
    const { units, spawner } = rig();
    const rec = recordSpawns(units);
    expect(spawner.update(DT, units)).toBe(1); // one soldier at a time, not a whole group
    for (let k = 0; k < 60 * 30; k++) {
      rec.tick(DT);
      spawner.update(DT, units);
    }
    const first = rec.at.filter((s) => s.t < cfg.waveInterval);
    expect(first.length).toBeGreaterThanOrEqual(cfg.groupMin);
    const team = units.teamPosition;
    for (const s of rec.at) {
      const d = Math.hypot(s.x - team.x, s.z - team.z);
      expect(d).toBeGreaterThan(cfg.spawnMin - cfg.groupRadius * 1.5);
      expect(d).toBeLessThan(cfg.spawnMax + cfg.groupRadius * 1.5);
    }
  });

  it('never spawns where the sensor is looking (anti spawn-camping)', () => {
    const { units, spawner } = rig();
    const team = units.teamPosition;
    // Stare at a real site in range of the team the whole time.
    const sites = [
      ...Object.values(MAP.enemyPaths).map((p) => p.points[0]),
      ...Object.values(MAP.spawnPoints).flat(),
    ].filter(([x, z]) => {
      const d = Math.hypot(x - team.x, z - team.z);
      return d >= cfg.spawnMin && d <= cfg.spawnMax;
    });
    expect(sites.length).toBeGreaterThan(1);
    const aim = { x: sites[0][0], z: sites[0][1] };
    const rec = recordSpawns(units);
    for (let k = 0; k < 60 * 90; k++) spawner.update(DT, units, aim);
    expect(rec.at.length).toBeGreaterThan(cfg.groupMin);
    const margin = cfg.avoidAimRadius - cfg.groupRadius * Math.SQRT2;
    for (const p of rec.at) expect(Math.hypot(p.x - aim.x, p.z - aim.z)).toBeGreaterThan(margin);
  });

  it('rests a site after using it, so the next groups come from elsewhere', () => {
    const { units, spawner } = rig();
    const rec = recordSpawns(units);
    for (let k = 0; k < 60 * 25; k++) spawner.update(DT, units);
    // Cluster the spawns by site (within 2 × groupRadius) and look at the first three groups.
    const centers: { x: number; z: number }[] = [];
    for (const s of rec.at) {
      if (!centers.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < cfg.groupRadius * 2.9)) {
        centers.push(s);
      }
    }
    expect(centers.length).toBeGreaterThanOrEqual(Math.min(3, cfg.initialGroups));
  });

  it('never has more than maxEnemies alive, and adds a group every wave interval', () => {
    const { units, spawner } = rig();
    spawner.update(DT, units);
    const first = units.aliveEnemies;
    for (let k = 0; k < Math.round(cfg.waveInterval / DT) + 1; k++) spawner.update(DT, units);
    expect(units.aliveEnemies).toBeGreaterThan(first);
    for (let k = 0; k < 60 * 120; k++) {
      spawner.update(DT, units);
      expect(units.aliveEnemies).toBeLessThanOrEqual(cfg.maxEnemies);
    }
    expect(units.aliveEnemies).toBe(cfg.maxEnemies);
  });

  it('keeps spawns inside the playable map', () => {
    const { units, spawner } = rig();
    for (let k = 0; k < 60 * 60; k++) spawner.update(DT, units);
    for (const e of units.enemies) {
      expect(Math.abs(e.position.x)).toBeLessThanOrEqual(CONFIG.map.size / 2);
      expect(Math.abs(e.position.z)).toBeLessThanOrEqual(CONFIG.map.size / 2);
    }
  });

  it('sends groups along the map approach paths when one starts in range', () => {
    const { units, spawner } = rig();
    spawner.update(DT, units);
    const withPath = units.enemies.filter((e) => e.path !== null);
    expect(withPath.length).toBeGreaterThan(0);
    for (const e of withPath) {
      expect(
        Math.hypot(e.position.x - e.path!.start.x, e.position.z - e.path!.start.z),
      ).toBeLessThan(cfg.groupRadius * 1.5);
    }
  });

  it('falls back to random bearings without a map', () => {
    const units = new UnitManager(flat, new EventBus<GameEvents>(), createRng(2), TEST_ROUTE);
    const spawner = new WaveSpawner(createRng(3), cfg, null);
    expect(spawner.update(DT, units)).toBeGreaterThan(0);
    expect(units.enemies.every((e) => e.path === null)).toBe(true);
  });

  it('mixes in machine gunners (about one in six)', () => {
    const { units, spawner } = rig();
    for (let g = 0; g < 10; g++) spawner.spawnGroup(units);
    const mg = units.enemies.filter((e) => e.def.type === 'machineGunner').length;
    expect(mg / units.enemies.length).toBeGreaterThan(0.05);
    expect(mg / units.enemies.length).toBeLessThan(0.35);
  });
});

describe('ConvoySpawner', () => {
  function convoyRig() {
    const bus = new EventBus<GameEvents>();
    const units = new UnitManager(flat, bus, createRng(2), TEST_ROUTE);
    const vehicles = new VehicleManager(units, flat, bus, createRng(3));
    return { units, vehicles, spawner: new ConvoySpawner(createRng(4)) };
  }

  it('uses the map vehicle paths, each ending near the team journey', () => {
    const { spawner } = convoyRig();
    expect(spawner.roads).toHaveLength(Object.keys(MAP.vehiclePaths).length);
    for (const road of spawner.roads) {
      const nearest = Math.min(
        ...TEST_ROUTE.map((r) => Math.hypot(r.x - road.end.x, r.z - road.end.z)),
      );
      expect(nearest).toBeLessThan(260);
    }
  });

  it('sends the first convoy after convoyFirst seconds, led by a truck, vehicles spaced out', () => {
    const { units, vehicles, spawner } = convoyRig();
    let n = 0;
    for (let t = 0; t < cfg.convoyFirst - 1; t += DT) n += spawner.update(DT, units, vehicles);
    expect(n).toBe(0);
    for (let t = 0; t < 2; t += DT) n += spawner.update(DT, units, vehicles);
    expect(n).toBeGreaterThanOrEqual(1);
    const live = vehicles.vehicles.filter((v) => v.inUse);
    expect(live[0].def.type).toBe('truck');
    for (let i = 1; i < live.length; i++) {
      expect(live[i - 1].s - live[i].s).toBeCloseTo(cfg.convoyGap);
    }
  });

  it('uses the road that ends nearest the team', () => {
    const { units, spawner } = convoyRig();
    const road = spawner.nearestRoad(units);
    const t = units.teamPosition;
    const d = Math.hypot(road.end.x - t.x, road.end.z - t.z);
    for (const r of spawner.roads) {
      expect(d).toBeLessThanOrEqual(Math.hypot(r.end.x - t.x, r.end.z - t.z));
    }
  });
});
