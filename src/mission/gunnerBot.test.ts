import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../gunship/weaponDefs';
import { createWorld } from './battle';
import {
  chooseWeapon,
  GunnerSim,
  preferredWeapons,
  SKILLS,
  threatScore,
  type Contact,
  type FireCheck,
} from './gunnerBot';
import { DEFAULT_ROLL } from './missionDef';

const soldier = (x: number, z: number, cluster = 1, weight = 1): Contact => ({
  kind: 'infantry',
  x,
  z,
  weight,
  cluster,
});
const ALL_READY = { '25': true, '40': true, '105': true } as const;
const clear: FireCheck = { ready: ALL_READY, friendly: 500, protectedDist: 500, margin: 0 };

describe('gunner bot decisions (M10 balance)', () => {
  it('a soldier near Ridgeback outranks the same soldier far away; AA counts wherever it is', () => {
    expect(threatScore(soldier(20, 0), 0, 0)).toBeGreaterThan(threatScore(soldier(400, 0), 0, 0));
    const aaNear = { ...soldier(20, 0), kind: 'aa' as const, weight: 3 };
    const aaFar = { ...aaNear, x: 400 };
    expect(threatScore(aaNear, 0, 0)).toBe(threatScore(aaFar, 0, 0));
    // A group is worth more than one soldier at the same spot.
    expect(threatScore(soldier(100, 0, 5), 0, 0)).toBeGreaterThan(
      threatScore(soldier(100, 0), 0, 0),
    );
  });

  it('prefers the 105 mm for vehicles and groups, the 40 mm for a single soldier', () => {
    expect(preferredWeapons({ ...soldier(0, 0), kind: 'vehicle' })[0]).toBe('105');
    expect(preferredWeapons(soldier(0, 0, 4))[0]).toBe('105');
    expect(preferredWeapons(soldier(0, 0))[0]).toBe('40');
  });

  it('steps down a gun rather than fire danger close, and holds fire when even the 25 mm is', () => {
    const group = soldier(0, 0, 4);
    expect(chooseWeapon(group, clear)).toBe('105');
    const near105 = { ...clear, friendly: WEAPONS['105'].dangerClose - 1 };
    expect(chooseWeapon(group, near105)).toBe('40');
    const near40 = { ...clear, friendly: WEAPONS['40'].dangerClose - 1 };
    expect(chooseWeapon(group, near40)).toBe('25');
    expect(chooseWeapon(group, { ...clear, friendly: 1 })).toBeNull();
  });

  it('leaves room for its own aim error near friendlies and the clinic', () => {
    const one = soldier(0, 0);
    const edge = WEAPONS['40'].dangerClose + 5; // clear of the 40 mm's line, not by 10 m
    expect(chooseWeapon(one, { ...clear, friendly: edge })).toBe('40');
    expect(chooseWeapon(one, { ...clear, friendly: edge, margin: 10 })).toBe('25');
    expect(chooseWeapon(one, { ...clear, protectedDist: 30, margin: 30 })).toBeNull();
  });

  it('skips guns that are not ready (reloading, overheated)', () => {
    const ready = { '25': true, '40': false, '105': false };
    expect(chooseWeapon(soldier(0, 0), { ...clear, ready })).toBe('25');
    expect(chooseWeapon({ ...soldier(0, 0), kind: 'vehicle' }, { ...clear, ready })).toBeNull();
  });

  it('plays the real mission headless: fires all three guns, kills, and fails nothing', () => {
    const sim = new GunnerSim(createWorld(), DEFAULT_ROLL, SKILLS.sharp);
    const r = sim.run(1 / 30, 240); // calibration and most of the fields
    expect(r.result).toBe('timeout');
    expect(r.failure).toBe('');
    expect(r.kills).toBeGreaterThan(10);
    expect(r.shots['105']).toBeGreaterThan(0);
    expect(r.shots['40'] + r.shots['25']).toBeGreaterThan(0);
    expect(r.phases.map((p) => p.id).slice(0, 2)).toEqual(['calibration', 'fields']);
  });
});
