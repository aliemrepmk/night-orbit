import { describe, expect, it } from 'vitest';
import { WEAPONS, WEAPON_ORDER, cycleWeapon } from './weaponDefs';

describe('cycleWeapon', () => {
  it('moves forward and wraps around', () => {
    expect(cycleWeapon('25', 1)).toBe('40');
    expect(cycleWeapon('40', 1)).toBe('105');
    expect(cycleWeapon('105', 1)).toBe('25');
  });

  it('moves backward and wraps around', () => {
    expect(cycleWeapon('25', -1)).toBe('105');
    expect(cycleWeapon('105', -1)).toBe('40');
  });
});

describe('weapon balance (PLAN.md §9)', () => {
  const w = WEAPONS;

  it('matches the plan: rate, capacity, reload, speed, spread, damage, radii', () => {
    expect(1 / w['25'].interval).toBeCloseTo(10);
    expect(1 / w['25'].heatPerShot / (1 / w['25'].interval)).toBeCloseTo(4); // 4 s to overheat
    expect([w['40'].capacity, w['40'].interval, w['40'].reload]).toEqual([5, 0.45, 2.2]);
    expect([w['105'].capacity, w['105'].reload]).toEqual([1, 5]);
    expect(WEAPON_ORDER.map((id) => w[id].shellSpeed)).toEqual([900, 750, 600]);
    expect(WEAPON_ORDER.map((id) => w[id].spread)).toEqual([1.5, 2.5, 4]);
    expect(WEAPON_ORDER.map((id) => w[id].damage)).toEqual([70, 200, 1500]);
    expect(WEAPON_ORDER.map((id) => w[id].blastRadius)).toEqual([2.5, 8, 22]);
  });

  it('gives each heavier weapon a bigger blast, slower shell and wider spread', () => {
    for (let i = 1; i < WEAPON_ORDER.length; i++) {
      const a = w[WEAPON_ORDER[i - 1]];
      const b = w[WEAPON_ORDER[i]];
      expect(b.blastRadius).toBeGreaterThan(a.blastRadius);
      expect(b.shellSpeed).toBeLessThan(a.shellSpeed);
      expect(b.spread).toBeGreaterThan(a.spread);
      expect(b.fx.shakeDeg).toBeGreaterThan(a.fx.shakeDeg);
    }
  });

  it('keeps the inner radius inside the blast and the danger-close radius outside it', () => {
    for (const id of WEAPON_ORDER) {
      expect(w[id].innerRadius).toBeLessThan(w[id].blastRadius);
      expect(w[id].dangerClose).toBeGreaterThan(w[id].blastRadius);
    }
  });

  it('gives tracers to the cannons but not the howitzer', () => {
    expect(WEAPON_ORDER.map((id) => w[id].tracer)).toEqual([true, true, false]);
  });
});
