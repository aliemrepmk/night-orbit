import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { ConvoySpawner, TEST_ROADS, TEST_ROUTE, WaveSpawner } from './TestScene';
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

describe('WaveSpawner', () => {
  it('starts with a few groups at the configured distance from the team', () => {
    const { units, spawner } = rig();
    const n = spawner.update(DT, units);
    expect(n).toBeGreaterThanOrEqual(cfg.initialGroups * cfg.groupMin);
    expect(n).toBeLessThanOrEqual(cfg.initialGroups * cfg.groupMax);
    const team = units.teamPosition;
    for (const e of units.enemies) {
      const d = Math.hypot(e.position.x - team.x, e.position.z - team.z);
      expect(d).toBeGreaterThan(cfg.spawnMin - cfg.groupRadius * 1.5);
      expect(d).toBeLessThan(cfg.spawnMax + cfg.groupRadius * 1.5);
    }
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

  it('keeps every test road inside the map and ending near the team route', () => {
    for (const road of TEST_ROADS) {
      for (const p of road) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(CONFIG.map.size / 2);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(CONFIG.map.size / 2);
      }
      const end = road[road.length - 1];
      const nearest = Math.min(...TEST_ROUTE.map((r) => Math.hypot(r.x - end.x, r.z - end.z)));
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
