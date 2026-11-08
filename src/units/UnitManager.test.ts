import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { applyRadial } from '../combat/Damage';
import { WEAPONS } from '../gunship/weaponDefs';
import { INFANTRY } from './unitDefs';
import { UnitManager, enemyAccuracy, type UnitsConfig } from './UnitManager';

const DT = 1 / 60;
const flat = () => 0;
// Long first leg so the team is still walking during short tests.
const ROUTE = [
  { x: 0, z: 0 },
  { x: 0, z: -2000 },
];

function rig(cfg: UnitsConfig = CONFIG) {
  const bus = new EventBus<GameEvents>();
  const units = new UnitManager(flat, bus, createRng(1), ROUTE, { cfg });
  const log: string[] = [];
  bus.on('missionFailed', (e) => log.push(`failed:${e.reason}`));
  bus.on('unitKilled', (e) => log.push(`killed:${e.by}`));
  return { bus, units, log };
}

const step = (u: UnitManager, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) u.update(DT);
};

describe('enemyAccuracy', () => {
  it('is best up close and falls linearly to the far value at max range', () => {
    const cfg = { accuracyNear: 0.6, accuracyFar: 0.2 };
    expect(enemyAccuracy(0, 200, cfg)).toBeCloseTo(0.6);
    expect(enemyAccuracy(100, 200, cfg)).toBeCloseTo(0.4);
    expect(enemyAccuracy(200, 200, cfg)).toBeCloseTo(0.2);
    expect(enemyAccuracy(500, 200, cfg)).toBeCloseTo(0.2);
  });
});

describe('UnitManager', () => {
  it('starts with four Ridgeback members in formation and full team health', () => {
    const { units } = rig();
    expect(units.friendlies).toHaveLength(4);
    expect(units.friendlies.every((f) => f.alive && f.side === 'friendly')).toBe(true);
    expect(units.team.value).toBe(CONFIG.ridgeback.health);
  });

  it('moves Ridgeback along its route in formation', () => {
    const { units } = rig();
    step(units, 10);
    const lead = units.friendlies[0];
    expect(lead.position.z).toBeLessThan(-15); // walking north at 2.2 m/s
    for (let i = 1; i < 4; i++) {
      const d = units.friendlies[i].position.distanceTo(lead.position);
      expect(d).toBeGreaterThan(2); // spread out, not stacked
      expect(d).toBeLessThan(CONFIG.ridgeback.spacing * 3);
    }
  });

  it('enemies out of range advance on the team, then stop and fire inside their range', () => {
    // A team that holds still and doesn't shoot back, so only the enemy's behavior is tested.
    const still: UnitsConfig = {
      ...CONFIG,
      ridgeback: { ...CONFIG.ridgeback, speed: 0, fireRange: 0 },
    };
    const { units } = rig(still);
    const e = units.spawnEnemy(INFANTRY.rifleman, 400, 0)!;
    e.assault = false; // a long-range shooter (assaulters have their own test)
    e.standoff = 0.8; // stops at 160 m
    step(units, 1);
    expect(e.state).toBe('moving');
    expect(units.team.value).toBe(100);
    step(units, 120);
    expect(e.state).toBe('firing');
    const d = Math.hypot(e.position.x - units.teamPosition.x, e.position.z - units.teamPosition.z);
    expect(d).toBeLessThanOrEqual(INFANTRY.rifleman.range + 10);
    expect(units.team.value).toBeLessThan(100);
    let tracer = false;
    for (let k = 0; k < 60 && !tracer; k++) {
      step(units, 0.05);
      tracer = units.tracers.some((t) => t.active && t.side === 'enemy');
    }
    expect(tracer).toBe(true);
  });

  it('enemy fire at a concealed team (under the forest) drains less (M8+ Phase D)', () => {
    const lost = (concealment: number) => {
      const bus = new EventBus<GameEvents>();
      const units = new UnitManager(flat, bus, createRng(1), ROUTE, {
        world: { lineOfSight: () => true, pushOut: () => false, concealment: () => concealment },
      });
      const lead = units.friendlies[0].position;
      const e = units.spawnEnemy(INFANTRY.machineGunner, lead.x + 100, lead.z)!;
      e.standoff = 0.95;
      const before = units.team.value;
      step(units, 2);
      return before - units.team.value;
    };
    const open = lost(1);
    expect(open).toBeGreaterThan(0);
    expect(lost(0.5)).toBeCloseTo(open * 0.5, 0);
  });

  it('drains team health by dps × accuracy × time while enemies fire', () => {
    const { units } = rig();
    const lead = units.friendlies[0].position;
    const e = units.spawnEnemy(INFANTRY.machineGunner, lead.x + 100, lead.z)!;
    e.standoff = 0.95;
    const before = units.team.value;
    step(units, 2);
    const lost = before - units.team.value;
    // Distance stays ~100 m (the team walks north); accuracy ≈ 0.6 → 0.25 over 250 m.
    const expected = INFANTRY.machineGunner.dps * enemyAccuracy(100, 250) * 2;
    expect(lost).toBeGreaterThan(expected * 0.8);
    expect(lost).toBeLessThan(expected * 1.25);
  });

  it('fails the mission exactly once when team health reaches 0 (overrun)', () => {
    const { units, log } = rig();
    const lead = units.friendlies[0].position;
    for (let i = 0; i < 30; i++) units.spawnEnemy(INFANTRY.machineGunner, lead.x + 30 + i, lead.z);
    step(units, 30);
    expect(units.team.overrun).toBe(true);
    expect(log.filter((l) => l === 'failed:team_overrun')).toHaveLength(1);
  });

  it('enemy fire never kills individual friendlies (only team health drops)', () => {
    const { units } = rig();
    const lead = units.friendlies[0].position;
    for (let i = 0; i < 10; i++) units.spawnEnemy(INFANTRY.rifleman, lead.x + 50, lead.z + i * 3);
    step(units, 20);
    expect(units.friendlies.every((f) => f.alive && f.hp === 100)).toBe(true);
  });

  it('Ridgeback shoots back while holding and slowly kills enemies (counted as team kills)', () => {
    const short: UnitsConfig = { ...CONFIG, ridgeback: { ...CONFIG.ridgeback, holdTime: 1e9 } };
    const bus = new EventBus<GameEvents>();
    const units = new UnitManager(flat, bus, createRng(4), [ROUTE[0], { x: 0, z: -1 }], {
      cfg: short,
    });
    const kills: string[] = [];
    bus.on('unitKilled', (e) => kills.push(e.by));
    step(units, 1); // reach the 1 m waypoint and hold
    expect(units.squad.moving).toBe(false);
    for (let i = 0; i < 6; i++) units.spawnEnemy(INFANTRY.rifleman, 150, i * 4);
    step(units, 60);
    expect(kills.length).toBeGreaterThan(0);
    expect(kills.every((k) => k === 'team')).toBe(true);
    expect(units.aliveEnemies).toBeLessThan(6);
    expect(units.tracers.some((t) => t.side === 'friendly')).toBe(true);
  });

  it('keeps soldiers apart (separation) instead of stacking on one spot', () => {
    const { units } = rig();
    const group = Array.from({ length: 8 }, () => units.spawnEnemy(INFANTRY.rifleman, 300, 300)!);
    step(units, 5);
    let minD = Infinity;
    for (let i = 0; i < group.length; i++)
      for (let j = i + 1; j < group.length; j++)
        minD = Math.min(minD, group[i].position.distanceTo(group[j].position));
    expect(minD).toBeGreaterThan(0.8);
  });

  it('finds targets near a blast through the grid, matching a brute-force scan', () => {
    const { units } = rig();
    const rng = createRng(9);
    for (let i = 0; i < 100; i++)
      units.spawnEnemy(INFANTRY.rifleman, rng() * 400 - 200, rng() * 400 - 200);
    units.update(DT);
    const center = new Vector3(20, 0, -30);
    for (const r of [5, 22, 33, 80]) {
      const got = new Set(units.targetsNear(center, r));
      const all = [...units.enemies, ...units.friendlies].filter((u) => u.alive);
      const want = all.filter(
        (u) => Math.hypot(u.position.x - center.x, u.position.z - center.z) <= r,
      );
      expect(got.size).toBe(want.length);
      for (const u of want) expect(got.has(u)).toBe(true);
    }
  });

  it('recycles the longest-dead body once the unit budget is full, never a living soldier', () => {
    const small: UnitsConfig = { ...CONFIG, infantry: { ...CONFIG.infantry, maxUnits: 8 } };
    const { units } = rig(small);
    const four = [0, 1, 2, 3].map((i) => units.spawnEnemy(INFANTRY.rifleman, 500 + i * 5, 500)!);
    expect(units.spawnEnemy(INFANTRY.rifleman, 0, 500)).toBeNull(); // 4 friendlies + 4 enemies
    applyRadial(four[1].position.clone(), WEAPONS['40'], [four[1]]);
    step(units, 2);
    applyRadial(four[2].position.clone(), WEAPONS['40'], [four[2]]);
    step(units, 2);
    const reused = units.spawnEnemy(INFANTRY.machineGunner, 0, 500);
    expect(reused).toBe(four[1]); // dead the longest
    expect(reused!.alive).toBe(true);
    expect(units.enemies).toHaveLength(4);
  });

  it('includes added vehicles in blast queries while they are alive', () => {
    const { units } = rig();
    const truck = {
      kind: 'vehicle' as const,
      side: 'enemy' as const,
      position: new Vector3(300, 0, 300),
      armor: { '25': 0.5, '40': 1, '105': 1, gunrun: 1, bomb: 1 },
      hp: 300,
      get alive() {
        return this.hp > 0;
      },
      takeDamage(a: number) {
        this.hp -= a;
      },
    };
    units.addTarget(truck);
    units.update(DT);
    expect(units.targetsNear(truck.position, 5)).toContain(truck);
    truck.hp = 0;
    units.update(DT);
    expect(units.targetsNear(truck.position, 5)).not.toContain(truck);
  });
});

describe('UnitManager mission hooks (M7)', () => {
  it('counts and routs the enemies inside a circle (zone clear / safety valve)', () => {
    const { units } = rig();
    for (let i = 0; i < 4; i++) units.spawnEnemy(INFANTRY.rifleman, 300 + i * 3, 0);
    units.spawnEnemy(INFANTRY.rifleman, -300, 0);
    expect(units.enemiesWithin(300, 0, 30)).toBe(4);
    expect(units.routEnemiesWithin(300, 0, 30, 20)).toBe(4);
    expect(units.enemies.filter((e) => e.action === 'flee')).toHaveLength(4);
  });

  it('kill-all (cheat K) kills every enemy as Ridgeback kills, not the player', () => {
    const { units, log } = rig();
    for (let i = 0; i < 3; i++) units.spawnEnemy(INFANTRY.rifleman, 200, i * 5);
    expect(units.killAllEnemies()).toBe(3);
    expect(units.aliveEnemies).toBe(0);
    expect(log).toEqual(['killed:team', 'killed:team', 'killed:team']);
  });

  it('placeTeam puts the anchor and every member at the spot, holding', () => {
    const { units } = rig();
    units.placeTeam(500, 200);
    expect(units.squad.arrived).toBe(true);
    for (const f of units.friendlies) {
      expect(Math.hypot(f.position.x - 500, f.position.z - 200)).toBeLessThan(15);
    }
  });

  it('once boarded, Ridgeback can no longer be targeted or hit', () => {
    const { units } = rig();
    units.boarded = true;
    expect(units.nearestFriendlyTo(new Vector3(0, 0, 0))).toBeNull();
    step(units, 0.1);
    const near = units.targetsNear(units.friendlies[0].position, 10);
    expect(near.filter((t) => t.side === 'friendly')).toHaveLength(0);
  });
});

describe('UnitManager: enemies fire on Kestrel 6 while it is low (M7)', () => {
  function airRig(exposed: boolean) {
    // Ridgeback holds its fire, so the soldier lives long enough to choose a target.
    const r = rig({ ...CONFIG, ridgeback: { ...CONFIG.ridgeback, fireRange: 0 } });
    const air = {
      position: new Vector3(0, 0, -60),
      exposed,
      taken: 0,
      takeFire(a: number) {
        this.taken += a;
      },
    };
    r.units.airTarget = air;
    r.units.squad.halt();
    // A rifleman 40 m from the helicopter, further from the team: it switches to the aircraft.
    r.units.spawnEnemy(INFANTRY.rifleman, 0, -100);
    return { ...r, air };
  }

  it('soldiers in range shoot the landed helicopter (with tracers)', () => {
    const { units, air } = airRig(true);
    let tracers = false;
    for (let k = 0; k < 6 * 60; k++) {
      units.update(DT);
      tracers ||= units.tracers.some((t) => t.active && t.side === 'enemy');
    }
    expect(air.taken).toBeGreaterThan(0);
    expect(units.enemies[0].shootsAir).toBe(true);
    expect(tracers).toBe(true);
    expect(units.team.value).toBe(units.team.max); // busy with the helicopter, not the team
  });

  it('nobody can hit it while it is high', () => {
    const { units, air } = airRig(false);
    step(units, 6);
    expect(air.taken).toBe(0);
  });
});
