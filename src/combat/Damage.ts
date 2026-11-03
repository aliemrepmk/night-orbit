import type { Vector3 } from 'three';
import type { WeaponDef, WeaponId } from '../gunship/weaponDefs';

/** Damage multiplier per weapon (PLAN.md §7.10: 25 mm barely scratches an APC). */
export type Armor = Readonly<Record<WeaponId, number>>;

export const UNARMORED: Armor = { '25': 1, '40': 1, '105': 1 };
export const ARMOR = {
  none: UNARMORED,
  truck: { '25': 0.5, '40': 1, '105': 1 },
  technical: { '25': 0.6, '40': 1, '105': 1 },
  apc: { '25': 0.05, '40': 0.4, '105': 1 },
} as const satisfies Record<string, Armor>;

/** Anything a blast can hurt: soldiers, vehicles, (later) friendlies. */
export interface Damageable {
  readonly position: Vector3;
  readonly alive: boolean;
  readonly armor: Armor;
  takeDamage(amount: number, weapon: WeaponId, from: Vector3): void;
}

export interface Hit {
  readonly target: Damageable;
  readonly damage: number;
  readonly distance: number;
}

/** 1 inside `inner`, 0 at and beyond `outer`, smooth (smoothstep) in between. */
export function falloff(distance: number, inner: number, outer: number): number {
  if (distance <= inner) return 1;
  if (distance >= outer) return 0;
  const t = (distance - inner) / (outer - inner);
  return 1 - t * t * (3 - 2 * t);
}

/** Damage a weapon deals at `distance` from the impact to a target with `armor`. */
export function damageAt(w: WeaponDef, distance: number, armor: Armor = UNARMORED): number {
  return w.damage * falloff(distance, w.innerRadius, w.blastRadius) * armor[w.id];
}

/**
 * Applies a blast at `center` to every living target in range (PLAN.md §7.7) and reports who
 * was hurt. Later milestones pass a spatial-grid query instead of every unit.
 */
export function applyRadial(center: Vector3, w: WeaponDef, targets: Iterable<Damageable>): Hit[] {
  const hits: Hit[] = [];
  for (const target of targets) {
    if (!target.alive) continue;
    const distance = target.position.distanceTo(center);
    if (distance >= w.blastRadius) continue;
    const damage = damageAt(w, distance, target.armor);
    if (damage <= 0) continue;
    target.takeDamage(damage, w.id, center);
    hits.push({ target, damage, distance });
  }
  return hits;
}
