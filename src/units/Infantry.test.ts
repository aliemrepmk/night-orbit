import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyRadial } from '../combat/Damage';
import { CONFIG } from '../config';
import { BODY_COOLING, HEAT } from '../fx/Heat';
import { WEAPONS } from '../gunship/weaponDefs';
import { Infantry } from './Infantry';
import { INFANTRY } from './unitDefs';

const DT = 1 / 60;
const flat = () => 0;
const step = (u: Infantry, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) u.update(DT);
};

function soldier(x = 0, z = 0): Infantry {
  const u = new Infantry(0, 'enemy', INFANTRY.rifleman, flat);
  u.spawn(INFANTRY.rifleman, x, z);
  return u;
}

describe('Infantry', () => {
  it('spawns alive and warm, standing on the ground', () => {
    const u = soldier(10, -5);
    expect(u.alive).toBe(true);
    expect(u.hp).toBe(100);
    expect(u.heat).toBe(HEAT.soldier);
    expect(u.position.y).toBeCloseTo(CONFIG.infantry.lift);
    expect(u.state).toBe('idle');
  });

  it('walks with its velocity, follows the ground, turns to face where it goes and animates', () => {
    const hill = (x: number) => x * 0.1;
    const u = new Infantry(0, 'enemy', INFANTRY.rifleman, hill);
    u.spawn(INFANTRY.rifleman, 0, 0, 0); // facing +z
    u.velocity.set(2, 0, 0); // walking east (+x)
    step(u, 2);
    expect(u.position.x).toBeCloseTo(4, 5);
    expect(u.position.y).toBeCloseTo(0.4 + CONFIG.infantry.lift, 5);
    expect(u.heading).toBeCloseTo(Math.PI / 2, 2); // atan2(1, 0)
    expect(u.state).toBe('moving');
    expect(u.walkPhase).toBeGreaterThan(0);
    u.velocity.set(0, 0, 0);
    u.update(DT);
    expect(u.state).toBe('idle');
  });

  it('turns the short way around and no faster than the turn rate', () => {
    const u = soldier();
    u.heading = Math.PI - 0.1;
    u.turnToward(-Math.PI + 0.1, DT); // 0.2 rad away across ±π
    expect(u.heading).toBeGreaterThan(Math.PI - 0.1);
    const before = u.heading;
    u.turnToward(0, DT);
    expect(Math.abs(u.heading - before)).toBeCloseTo(CONFIG.infantry.turnRate * DT, 6);
  });

  it('is killed by a 40 mm hit, flung away from the blast, then lies still and cools', () => {
    const u = soldier();
    const blast = u.position.clone().add(new Vector3(-2, 0, 0)); // blast to its west
    applyRadial(blast, WEAPONS['40'], [u]);
    expect(u.alive).toBe(false);
    expect(u.state).toBe('flung');
    expect(u.killedBy).toBe('40');
    const x0 = u.position.x;
    step(u, 1.5);
    expect(u.state).toBe('dead');
    expect(u.position.x).toBeGreaterThan(x0 + 2); // thrown east, away from the blast
    expect(u.position.y).toBeCloseTo(CONFIG.infantry.downLift);
    const rest = u.position.clone();
    step(u, 2);
    expect(u.position.distanceTo(rest)).toBe(0);
    expect(u.heat).toBeLessThan(HEAT.soldier);
    step(u, 60);
    expect(u.heat).toBe(BODY_COOLING.to);
  });

  it('survives one 25 mm round (70 damage) but not two', () => {
    const u = soldier();
    applyRadial(u.position.clone(), WEAPONS['25'], [u]);
    expect(u.alive).toBe(true);
    applyRadial(u.position.clone(), WEAPONS['25'], [u]);
    expect(u.alive).toBe(false);
  });

  it('comes back fully alive when respawned (recycled slot)', () => {
    const u = soldier();
    u.takeDamage(500, '105', u.position.clone());
    step(u, 3);
    u.spawn(INFANTRY.machineGunner, 50, 50);
    expect(u.alive).toBe(true);
    expect(u.def.type).toBe('machineGunner');
    expect(u.state).toBe('idle');
    expect(u.killedBy).toBeNull();
    expect(u.heat).toBe(HEAT.soldier);
  });
});
