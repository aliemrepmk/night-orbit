export type WeaponId = '25' | '40' | '105';

/**
 * - `auto`: fires while the trigger is held, limited by a barrel-heat bar (no clip).
 * - `semi`: one shot per click, limited by a fire-rate gate and a clip.
 * - `single`: one shot per click, then a long reload.
 */
export type FireMode = 'auto' | 'semi' | 'single';

/** What one impact looks like (consumed by `combat/Explosions.ts`). */
export interface ImpactFx {
  /** Flash sprite size in meters and how many hot debris points fly out. */
  readonly flashSize: number;
  readonly debris: number;
  readonly debrisSpeed: number;
  /** Smoke puffs and how big they grow. */
  readonly smoke: number;
  readonly smokeSize: number;
  readonly craterRadius: number;
  /** Expanding hot ring on the ground (105 mm only). */
  readonly shockwave: boolean;
  /** Camera shake in degrees when the impact is at the aim point. */
  readonly shakeDeg: number;
  /** Brief sensor whiteout (0–1) when the impact is in view. */
  readonly whiteout: number;
}

export interface WeaponDef {
  readonly id: WeaponId;
  readonly label: string;
  /** Vertical field of view of the sensor while this weapon is selected. */
  readonly fovDeg: number;

  readonly fireMode: FireMode;
  /** Minimum seconds between shots. */
  readonly interval: number;
  /** Rounds per clip (`auto` weapons use heat instead; capacity is ignored). */
  readonly capacity: number;
  /** Seconds to reload a clip, or the forced cooldown after overheating (`auto`). */
  readonly reload: number;
  /** `auto` only: barrel heat added per shot (1 = overheated) and passive cooling per second. */
  readonly heatPerShot: number;
  readonly coolRate: number;

  /** Meters per second. Flight time = distance / speed, so moving targets must be led. */
  readonly shellSpeed: number;
  /** Impact points scatter uniformly within this radius (meters) around the aimed point. */
  readonly spread: number;
  readonly tracer: boolean;

  readonly damage: number;
  /** Full damage inside `innerRadius`, falling smoothly to zero at `blastRadius` (meters). */
  readonly innerRadius: number;
  readonly blastRadius: number;
  /** Friendlies inside this distance of an impact trigger a danger-close warning (M4). */
  readonly dangerClose: number;
  /** Surviving enemies within this distance panic and run for a few seconds (§7.11 morale). */
  readonly panicRadius: number;

  readonly fx: ImpactFx;
}

/** Balance values from PLAN.md §9. These WILL be tuned in playtesting. */
export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  '25': {
    id: '25',
    label: '25MM',
    fovDeg: 5,
    fireMode: 'auto',
    interval: 0.1, // 10 shots/s
    capacity: 0,
    reload: 3, // overheat cooldown
    heatPerShot: 1 / 40, // overheats after 4 s of continuous fire
    coolRate: 0.35,
    shellSpeed: 900,
    spread: 1.5,
    tracer: true,
    damage: 70,
    innerRadius: 0.8,
    blastRadius: 2.5,
    dangerClose: 4,
    panicRadius: 0,
    fx: {
      flashSize: 2.5,
      debris: 6,
      debrisSpeed: 9,
      smoke: 1,
      smokeSize: 3,
      craterRadius: 0.6,
      shockwave: false,
      shakeDeg: 0.01,
      whiteout: 0,
    },
  },
  '40': {
    id: '40',
    label: '40MM',
    fovDeg: 12,
    fireMode: 'semi',
    interval: 0.45,
    capacity: 5,
    reload: 2.2,
    heatPerShot: 0,
    coolRate: 0,
    shellSpeed: 750,
    spread: 2.5,
    tracer: true,
    damage: 200,
    innerRadius: 3,
    blastRadius: 8,
    dangerClose: 12,
    panicRadius: 10,
    fx: {
      flashSize: 8,
      debris: 24,
      debrisSpeed: 16,
      smoke: 4,
      smokeSize: 8,
      craterRadius: 2,
      shockwave: false,
      shakeDeg: 0.05,
      whiteout: 0.15,
    },
  },
  '105': {
    id: '105',
    label: '105MM',
    fovDeg: 28,
    fireMode: 'single',
    interval: 0,
    capacity: 1,
    reload: 5,
    heatPerShot: 0,
    coolRate: 0,
    shellSpeed: 600,
    spread: 4,
    tracer: false, // invisible until impact, like the real thing
    damage: 1500,
    innerRadius: 8,
    blastRadius: 22,
    dangerClose: 33,
    panicRadius: 45,
    fx: {
      flashSize: 26,
      debris: 70,
      debrisSpeed: 30,
      smoke: 10,
      smokeSize: 22,
      craterRadius: 5,
      shockwave: true,
      shakeDeg: 0.25,
      whiteout: 0.6,
    },
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = ['25', '40', '105'];

/** Next weapon in the list when cycling (wraps around). */
export function cycleWeapon(current: WeaponId, direction: 1 | -1): WeaponId {
  const i = WEAPON_ORDER.indexOf(current);
  const n = WEAPON_ORDER.length;
  return WEAPON_ORDER[(i + direction + n) % n];
}
