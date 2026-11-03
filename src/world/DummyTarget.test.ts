import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyRadial } from '../combat/Damage';
import { BODY_COOLING, FIRE, HEAT, WRECK_COOLING } from '../fx/Heat';
import { WEAPONS } from '../gunship/weaponDefs';
import { DummyTarget } from './DummyTarget';

const DT = 1 / 60;
const flat = () => 0;
const circuit = { cx: 0, cz: 0, r: 20, speed: 2, phase: 0 };
const step = (t: DummyTarget, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) t.update(DT);
};

describe('DummyTarget (infantry)', () => {
  it('walks its circuit while alive, at walking speed', () => {
    const t = new DummyTarget('infantry', circuit, flat, 1);
    const start = t.position.clone();
    step(t, 1);
    expect(t.position.distanceTo(start)).toBeCloseTo(2, 1);
    expect(t.heat).toBe(HEAT.soldier);
  });

  it('dies from a 40 mm hit, is flung away from the blast, then lies still', () => {
    const t = new DummyTarget('infantry', circuit, flat, 1);
    const blast = t.position.clone().add(new Vector3(-2, 0, 0)); // blast to its west
    applyRadial(blast, WEAPONS['40'], [t]);
    expect(t.alive).toBe(false);
    expect(t.state).toBe('flung');
    const x0 = t.position.x;
    step(t, 1.5);
    expect(t.state).toBe('down');
    expect(t.position.x).toBeGreaterThan(x0 + 2); // thrown east, away from the blast
    const rest = t.position.clone();
    step(t, 2);
    expect(t.position.distanceTo(rest)).toBe(0); // bodies don't walk
  });

  it('cools from soldier heat to 0.35 over 60 s after death', () => {
    const t = new DummyTarget('infantry', circuit, flat, 1);
    t.takeDamage(500, '105', t.position.clone());
    step(t, 1);
    expect(t.heat).toBeLessThan(HEAT.soldier);
    step(t, 60);
    expect(t.heat).toBe(BODY_COOLING.to);
  });

  it('survives a near miss from a single 25 mm round (70 damage max)', () => {
    const t = new DummyTarget('infantry', circuit, flat, 1);
    applyRadial(t.position.clone(), WEAPONS['25'], [t]);
    expect(t.alive).toBe(true);
    applyRadial(t.position.clone(), WEAPONS['25'], [t]);
    expect(t.alive).toBe(false);
  });
});

describe('DummyTarget (vehicle)', () => {
  it('shrugs off 25 mm (armor 0.5), smokes below half health, burns when destroyed', () => {
    const t = new DummyTarget('vehicle', circuit, flat, 1.2, 3);
    for (let i = 0; i < 5; i++) applyRadial(t.position.clone(), WEAPONS['25'], [t]); // 5 × 35 = 175
    expect(t.alive).toBe(true);
    expect(t.smoking).toBe(true);
    applyRadial(t.position.clone(), WEAPONS['40'], [t]);
    expect(t.alive).toBe(false);
    expect(t.burning).toBe(true);
    step(t, 1);
    expect(t.heat).toBeGreaterThanOrEqual(FIRE.min);
  });

  it('stops burning after 40 s and cools to a cold wreck', () => {
    const t = new DummyTarget('vehicle', circuit, flat, 1.2);
    t.takeDamage(1000, '105', t.position.clone());
    step(t, 41);
    expect(t.burning).toBe(false);
    step(t, 61);
    expect(t.heat).toBe(WRECK_COOLING.to);
  });
});
