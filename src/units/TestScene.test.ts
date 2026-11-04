import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { TEST_ROUTE, WaveSpawner } from './TestScene';
import { UnitManager } from './UnitManager';

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
