import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Path } from '../ai/Paths';
import { applyRadial, damageAt } from '../combat/Damage';
import { FIRE } from '../fx/Heat';
import { WEAPONS } from '../gunship/weaponDefs';
import { Vehicle } from './Vehicle';
import { VEHICLES } from './vehicleDefs';

const DT = 1 / 60;
const flat = () => 0;
const ROAD = new Path([
  { x: 0, z: 0 },
  { x: 0, z: -200 },
  { x: 150, z: -200 },
]);

function make(type: keyof typeof VEHICLES = 'truck') {
  const v = new Vehicle(VEHICLES[type], flat, 1);
  v.spawn(VEHICLES[type], ROAD, 0, 7);
  return v;
}

describe('Vehicle', () => {
  it('drives its road at cruising speed and reaches the end', () => {
    const v = make();
    let t = 0;
    let maxSpeed = 0;
    while (!v.arrived && t < 120) {
      v.drive(DT, false);
      maxSpeed = Math.max(maxSpeed, v.speed);
      t += DT;
    }
    expect(v.arrived).toBe(true);
    expect(v.position.x).toBeCloseTo(150);
    expect(v.position.z).toBeCloseTo(-200);
    expect(maxSpeed).toBeCloseTo(VEHICLES.truck.speed, 1);
    expect(t).toBeGreaterThan(ROAD.length / VEHICLES.truck.speed); // corner + acceleration cost time
  });

  it('slows down for the corner and turns smoothly toward the new direction', () => {
    const v = make();
    let cornerSpeed = Infinity;
    let maxJump = 0;
    let last = v.heading;
    while (!v.arrived) {
      v.drive(DT, false);
      if (Math.abs(v.s - 200) < 2) cornerSpeed = Math.min(cornerSpeed, v.speed);
      maxJump = Math.max(
        maxJump,
        Math.abs(Math.atan2(Math.sin(v.heading - last), Math.cos(v.heading - last))),
      );
      last = v.heading;
    }
    expect(cornerSpeed).toBeLessThan(VEHICLES.truck.speed * 0.6);
    expect(maxJump).toBeLessThan(0.05); // no instant snap at the corner
    expect(v.heading).toBeCloseTo(Math.PI / 2, 1); // facing east at the end
  });

  it('brakes to a stop when blocked', () => {
    const v = make();
    for (let k = 0; k < 600; k++) v.drive(DT, false);
    const s0 = v.s;
    for (let k = 0; k < 180; k++) v.drive(DT, true);
    expect(v.speed).toBe(0);
    expect(v.s - s0).toBeLessThan(10); // braking distance at 9 m/s, 7 m/s²
  });

  it('applies armor multipliers per weapon (an APC shrugs off 25 mm)', () => {
    for (const type of ['truck', 'technical', 'apc'] as const) {
      const v = make(type);
      const at = v.position.clone();
      const hits = applyRadial(at, WEAPONS['25'], [v]);
      expect(hits[0].damage).toBeCloseTo(WEAPONS['25'].damage * VEHICLES[type].armor['25']);
    }
    expect(damageAt(WEAPONS['25'], 0, VEHICLES.apc.armor)).toBeCloseTo(3.5);
    expect(damageAt(WEAPONS['105'], 0, VEHICLES.apc.armor)).toBe(1500);
  });

  it('goes intact → smoking below half health → destroyed (burning, then cooling)', () => {
    const v = make();
    const from = new Vector3();
    expect(v.smoking).toBe(false);
    v.takeDamage(160, '40', from);
    expect(v.smoking).toBe(true);
    expect(v.alive).toBe(true);
    v.takeDamage(200, '40', from);
    expect(v.state).toBe('destroyed');
    expect(v.killedBy).toBe('40');
    expect(v.smoking).toBe(false);
    expect(v.burning).toBe(true);
    const hot = v.heat;
    for (let k = 0; k < 60 * (FIRE.duration + 30); k++) v.update(DT);
    expect(v.burning).toBe(false);
    expect(v.heat).toBeLessThan(hot);
  });

  it('stops moving once destroyed and ignores further damage', () => {
    const v = make();
    for (let k = 0; k < 300; k++) v.drive(DT, false);
    v.takeDamage(1e4, '105', new Vector3());
    const p = v.position.clone();
    for (let k = 0; k < 300; k++) v.drive(DT, false);
    expect(v.position.distanceTo(p)).toBe(0);
    v.takeDamage(10, '25', new Vector3());
    expect(v.killedBy).toBe('105');
  });
});
