import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '../gunship/weaponDefs';
import { ARMOR, applyRadial, damageAt, falloff, type Armor, type Damageable } from './Damage';

function dummy(x: number, armor: Armor = ARMOR.none, hp = 100): Damageable & { hp: number } {
  return {
    position: new Vector3(x, 0, 0),
    armor,
    hp,
    get alive() {
      return this.hp > 0;
    },
    takeDamage(amount: number, _w: WeaponId) {
      this.hp -= amount;
    },
  };
}

describe('falloff', () => {
  it('is full inside the inner radius and zero at the blast radius', () => {
    expect(falloff(0, 3, 8)).toBe(1);
    expect(falloff(3, 3, 8)).toBe(1);
    expect(falloff(8, 3, 8)).toBe(0);
    expect(falloff(50, 3, 8)).toBe(0);
  });

  it('decreases monotonically in between', () => {
    let prev = 1;
    for (let d = 3; d <= 8; d += 0.05) {
      const f = falloff(d, 3, 8);
      expect(f).toBeLessThanOrEqual(prev);
      prev = f;
    }
  });
});

describe('damage', () => {
  it('kills infantry (100 HP) at the center with every weapon', () => {
    for (const id of WEAPON_ORDER) expect(damageAt(WEAPONS[id], 0)).toBeGreaterThanOrEqual(70);
    expect(damageAt(WEAPONS['40'], 0)).toBeGreaterThanOrEqual(100);
  });

  it('applies armor: 25 mm barely scratches an APC, 105 mm hits it fully', () => {
    expect(damageAt(WEAPONS['25'], 0, ARMOR.apc)).toBeCloseTo(70 * 0.05);
    expect(damageAt(WEAPONS['105'], 0, ARMOR.apc)).toBe(1500);
  });

  it('hurts only living targets inside the blast, scaled by distance', () => {
    const w = WEAPONS['40'];
    const near = dummy(1);
    const edge = dummy(6);
    const far = dummy(20);
    const dead = dummy(0, ARMOR.none, 0);
    const hits = applyRadial(new Vector3(), w, [near, edge, far, dead]);
    expect(hits.map((h) => h.target)).toEqual([near, edge]);
    expect(near.hp).toBe(100 - 200);
    expect(edge.hp).toBeGreaterThan(near.hp);
    expect(edge.hp).toBeLessThan(100);
    expect(far.hp).toBe(100);
    expect(dead.hp).toBe(0);
  });

  it('a 105 mm round kills infantry well beyond the 40 mm blast radius', () => {
    const t = dummy(12);
    applyRadial(new Vector3(), WEAPONS['105'], [t]);
    expect(t.alive).toBe(false);
  });
});
