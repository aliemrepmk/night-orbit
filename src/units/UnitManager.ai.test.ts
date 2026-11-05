import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CoverSet } from '../ai/CoverPoints';
import { Path } from '../ai/Paths';
import { applyRadial } from '../combat/Damage';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { WEAPONS } from '../gunship/weaponDefs';
import { Collision } from '../world/Collision';
import { INFANTRY } from './unitDefs';
import { UnitManager, type UnitOptions, type UnitsConfig, type UnitWorld } from './UnitManager';

const DT = 1 / 60;
const flat = () => 0;
const ROUTE = [
  { x: 0, z: 0 },
  { x: 0, z: -2000 },
];
/** A team that holds still and doesn't shoot back, so only enemy behavior is tested. */
const STILL: UnitsConfig = {
  ...CONFIG,
  ridgeback: { ...CONFIG.ridgeback, speed: 0, fireRange: 0 },
};

function rig(opts: UnitOptions = {}) {
  const bus = new EventBus<GameEvents>();
  const units = new UnitManager(flat, bus, createRng(1), ROUTE, { cfg: STILL, ...opts });
  return { bus, units };
}

const step = (u: UnitManager, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) u.update(DT);
};
const distToTeam = (u: UnitManager, p: Vector3) =>
  Math.hypot(p.x - u.teamPosition.x, p.z - u.teamPosition.z);

describe('UnitManager enemy AI (M5)', () => {
  it('runs to a free cover point within reach, crouches there and fires from it', () => {
    const cover = new CoverSet();
    const point = cover.add(160, 10);
    const { units } = rig({ cover });
    const e = units.spawnEnemy(INFANTRY.rifleman, 190, 0)!;
    step(units, 0.5);
    expect(e.cover).toBe(point);
    step(units, 20);
    expect(Math.hypot(e.position.x - 160, e.position.z - 10)).toBeLessThan(1.5);
    expect(e.inCover).toBe(true);
    expect(e.crouched).toBe(true);
    expect(e.state).toBe('firing');
    expect(units.team.value).toBeLessThan(100);
  });

  it('gives one cover point to one soldier only', () => {
    const cover = new CoverSet();
    const point = cover.add(160, 0);
    const { units } = rig({ cover });
    const a = units.spawnEnemy(INFANTRY.rifleman, 185, 0)!;
    const b = units.spawnEnemy(INFANTRY.rifleman, 185, 6)!;
    step(units, 1);
    const holders = [a, b].filter((u) => u.cover === point);
    expect(holders).toHaveLength(1);
    expect(cover.ownerOf(point)).toBe(holders[0].id);
  });

  it('ignores cover that would take it away from the fight or out of reach', () => {
    const cover = new CoverSet();
    cover.add(215, 0); // behind the soldier
    cover.add(400, 0); // far out of range of the team
    const { units } = rig({ cover });
    const e = units.spawnEnemy(INFANTRY.rifleman, 190, 0)!;
    step(units, 1);
    expect(e.cover).toBeNull();
  });

  it('bounds forward to cover without a view, then moves on from it', () => {
    const blind: UnitWorld = {
      lineOfSight: () => false,
      pushOut: (x, z, _r, out) => {
        out.x = x;
        out.z = z;
        return false;
      },
    };
    const cover = new CoverSet();
    const fwd = cover.add(160, 0); // 30 m closer to the team
    const side = cover.add(188, 8); // no closer: needs a view, which nobody has
    const { units } = rig({ cover, world: blind });
    const e = units.spawnEnemy(INFANTRY.rifleman, 190, 0)!;
    step(units, 0.5);
    expect(e.cover).toBe(fwd);
    expect(e.cover).not.toBe(side);
    step(units, 20);
    expect(e.rejectedCover).toBe(fwd.id); // got there, couldn't see, moved on
    expect(e.position.x).toBeLessThan(158);
  });

  it('frees its cover point when it dies', () => {
    const cover = new CoverSet();
    const point = cover.add(160, 0);
    const { units } = rig({ cover });
    const e = units.spawnEnemy(INFANTRY.rifleman, 185, 0)!;
    step(units, 1);
    expect(cover.isFree(point)).toBe(false);
    applyRadial(e.position.clone(), WEAPONS['105'], [e]);
    step(units, DT);
    expect(cover.isFree(point)).toBe(true);
  });

  it('does not fire without line of sight, and keeps advancing instead', () => {
    const blind: UnitWorld = {
      lineOfSight: () => false,
      pushOut: (x, z, _r, out) => {
        out.x = x;
        out.z = z;
        return false;
      },
    };
    const { units } = rig({ world: blind });
    const e = units.spawnEnemy(INFANTRY.rifleman, 120, 0)!;
    step(units, 5);
    expect(units.team.value).toBe(100);
    expect(e.state).toBe('moving');
    expect(distToTeam(units, e.position)).toBeLessThan(115);
  });

  it('walks around a house in its way instead of through it', () => {
    const col = new Collision({ heightAt: () => 0 }, 0);
    const box = { center: new Vector3(150, 3, 0), half: new Vector3(4, 3, 8), rotY: 0 };
    col.addBox(box);
    const world: UnitWorld = {
      lineOfSight: (a, b) => col.lineOfSight(a, b),
      pushOut: (x, z, r, out) => col.pushOut(x, z, r, out),
    };
    const { units } = rig({ world });
    const e = units.spawnEnemy(INFANTRY.rifleman, 175, 0)!;
    e.standoff = 0.3; // wants to get within 60 m: has to pass the house
    let inside = 0;
    for (let k = 0; k < 60 * 40; k++) {
      units.update(DT);
      const inX = Math.abs(e.position.x - box.center.x) < box.half.x;
      const inZ = Math.abs(e.position.z - box.center.z) < box.half.z;
      if (inX && inZ) inside++;
    }
    expect(inside).toBe(0);
    expect(e.position.x).toBeLessThan(140); // got past it
  });

  it('panics and runs from a nearby 105 mm blast, then rallies after a few seconds', () => {
    const { bus, units } = rig();
    const group = [0, 1, 2].map((i) => units.spawnEnemy(INFANTRY.rifleman, 180, i * 4)!);
    step(units, 1);
    const blast = new Vector3(180, 0, 30); // 26–30 m away: hurt nobody, inside 45 m panic radius
    bus.emit('impact', { pos: blast, weapon: '105', distanceToAim: 0 });
    step(units, 0.5);
    for (const e of group) {
      expect(e.state).toBe('fleeing');
      expect(e.cover).toBeNull();
    }
    const before = group.map((e) => e.position.distanceTo(blast));
    step(units, 1.5);
    group.forEach((e, i) => expect(e.position.distanceTo(blast)).toBeGreaterThan(before[i]));
    step(units, CONFIG.ai.panicMax + 1);
    expect(group.some((e) => e.state === 'fleeing')).toBe(false);
  });

  it('a 25 mm impact (no panic radius) scares nobody', () => {
    const { bus, units } = rig();
    const e = units.spawnEnemy(INFANTRY.rifleman, 180, 0)!;
    step(units, 1);
    bus.emit('impact', { pos: new Vector3(181, 0, 0), weapon: '25', distanceToAim: 0 });
    step(units, 0.2);
    expect(e.state).not.toBe('fleeing');
  });

  it('breaks and runs home after losing several comrades nearby (morale)', () => {
    const certain: UnitsConfig = { ...STILL, ai: { ...CONFIG.ai, fleeChance: 1 } };
    const { units } = rig({ cfg: certain });
    const survivor = units.spawnEnemy(INFANTRY.rifleman, 170, 0, { home: { x: 400, z: 0 } })!;
    const doomed = [1, 2, 3].map((i) => units.spawnEnemy(INFANTRY.rifleman, 170, i * 4)!);
    step(units, 1);
    for (const d of doomed) d.takeDamage(500, '40', d.position);
    step(units, 1);
    expect(survivor.state).toBe('fleeing');
    const x0 = survivor.position.x;
    step(units, 3);
    expect(survivor.position.x).toBeGreaterThan(x0 + 5); // heading home (east)
  });

  it('holds its nerve with fleeChance 0 (the morale roll decides)', () => {
    const brave: UnitsConfig = { ...STILL, ai: { ...CONFIG.ai, fleeChance: 0 } };
    const { units } = rig({ cfg: brave });
    const survivor = units.spawnEnemy(INFANTRY.rifleman, 170, 0)!;
    const doomed = [1, 2, 3].map((i) => units.spawnEnemy(INFANTRY.rifleman, 170, i * 4)!);
    step(units, 1);
    for (const d of doomed) d.takeDamage(500, '40', d.position);
    step(units, 2);
    expect(survivor.state).not.toBe('fleeing');
  });

  it('follows its approach path before heading for the team', () => {
    const { units } = rig();
    // A dogleg: north first, then west toward the team.
    const path = new Path([
      { x: 400, z: 300 },
      { x: 400, z: 0 },
      { x: 250, z: 0 },
    ]);
    const e = units.spawnEnemy(INFANTRY.rifleman, 400, 300, { path })!;
    let nearCorner = false;
    for (let k = 0; k < 60 * 200; k++) {
      units.update(DT);
      if (Math.hypot(e.position.x - 400, e.position.z) < 8) nearCorner = true;
    }
    expect(nearCorner).toBe(true);
    expect(e.pathS).toBeGreaterThanOrEqual(path.length);
    expect(e.state).toBe('firing');
  });

  it('Ridgeback does not shoot enemies it cannot see', () => {
    const blind: UnitWorld = {
      lineOfSight: () => false,
      pushOut: (x, z, _r, out) => {
        out.x = x;
        out.z = z;
        return false;
      },
    };
    const holding: UnitsConfig = {
      ...CONFIG,
      ridgeback: { ...CONFIG.ridgeback, holdTime: 1e9, hitChance: 1 },
    };
    const bus = new EventBus<GameEvents>();
    const units = new UnitManager(flat, bus, createRng(4), [ROUTE[0], { x: 0, z: -1 }], {
      cfg: holding,
      world: blind,
    });
    step(units, 1);
    for (let i = 0; i < 4; i++) units.spawnEnemy(INFANTRY.rifleman, 150, i * 4);
    step(units, 20);
    expect(units.aliveEnemies).toBe(4);
  });
});
