import { describe, expect, it } from 'vitest';
import { applyRadial } from '../combat/Damage';
import { FIRE, HEAT, WRECK_COOLING } from '../fx/Heat';
import { WEAPONS } from '../gunship/weaponDefs';
import { DummyTarget } from './DummyTarget';

const DT = 1 / 60;
const flat = () => 0;
const circuit = { cx: 0, cz: 0, r: 20, speed: 2, phase: 0 };
const step = (t: DummyTarget, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) t.update(DT);
};

describe('DummyTarget (truck)', () => {
  it('drives its circuit while alive', () => {
    const t = new DummyTarget(circuit, flat, 1.2);
    const start = t.position.clone();
    step(t, 1);
    expect(t.position.distanceTo(start)).toBeCloseTo(2, 1);
    expect(t.heat).toBe(HEAT.vehicleBody);
  });

  it('shrugs off 25 mm (armor 0.5), smokes below half health, burns when destroyed', () => {
    const t = new DummyTarget(circuit, flat, 1.2, 3);
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
    const t = new DummyTarget(circuit, flat, 1.2);
    t.takeDamage(1000, '105', t.position.clone());
    step(t, 41);
    expect(t.burning).toBe(false);
    step(t, 61);
    expect(t.heat).toBe(WRECK_COOLING.to);
  });
});
