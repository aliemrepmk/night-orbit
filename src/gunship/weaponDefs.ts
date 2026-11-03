export type WeaponId = '25' | '40' | '105';

export interface WeaponDef {
  readonly id: WeaponId;
  readonly label: string;
  /** Vertical field of view of the sensor while this weapon is selected. */
  readonly fovDeg: number;
}

// M1 only needs the zoom level. Fire rate, damage, etc. are added in M3.
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  '25': { id: '25', label: '25MM', fovDeg: 5 },
  '40': { id: '40', label: '40MM', fovDeg: 12 },
  '105': { id: '105', label: '105MM', fovDeg: 28 },
};

export const WEAPON_ORDER: readonly WeaponId[] = ['25', '40', '105'];

/** Next weapon in the list when cycling (wraps around). */
export function cycleWeapon(current: WeaponId, direction: 1 | -1): WeaponId {
  const i = WEAPON_ORDER.indexOf(current);
  const n = WEAPON_ORDER.length;
  return WEAPON_ORDER[(i + direction + n) % n];
}
