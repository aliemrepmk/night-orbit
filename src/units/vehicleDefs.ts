import { ARMOR, type Armor } from '../combat/Damage';

export type VehicleType = 'truck' | 'technical' | 'apc';

/** What a box part of a vehicle is made of, which sets its heat (`VehicleRenderer`). */
export type PartKind = 'body' | 'engine' | 'exhaust' | 'wheels' | 'gun';

/**
 * One box of a vehicle's box-composite mesh, in the vehicle's frame: +z forward, y up from the
 * ground. `wreck: false` parts are gone once it is destroyed (blown-off cab, turret).
 */
export interface VehiclePart {
  readonly kind: PartKind;
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly wreck: boolean;
}

/** Stats for one vehicle type (PLAN.md §7.10 and §9). These WILL be tuned in playtesting. */
export interface VehicleDef {
  readonly type: VehicleType;
  readonly hp: number;
  readonly armor: Armor;
  /** Cruising speed on straight road (m/s). */
  readonly speed: number;
  /** Mounted gun: damage per second to Ridgeback's team health (before accuracy), and range. */
  readonly dps: number;
  readonly range: number;
  /** Tracers per visible burst. */
  readonly burst: number;
  /** The gun keeps firing on the move (APC turret) instead of only once stopped. */
  readonly firesWhileMoving: boolean;
  /** Soldiers carried (trucks unload them). */
  readonly cargoMin: number;
  readonly cargoMax: number;
  /** Height of the body center above the ground (its blast "position"), gun height, length. */
  readonly lift: number;
  readonly gunHeight: number;
  readonly length: number;
  readonly parts: readonly VehiclePart[];
}

const part = (
  kind: PartKind,
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  wreck = true,
): VehiclePart => ({ kind, at, size, wreck });

export const VEHICLES: Readonly<Record<VehicleType, VehicleDef>> = {
  // Drives in, stops, unloads 6–8 soldiers, then parks.
  truck: {
    type: 'truck',
    hp: 300,
    armor: ARMOR.truck,
    speed: 9,
    dps: 0,
    range: 0,
    burst: 0,
    firesWhileMoving: false,
    cargoMin: 6,
    cargoMax: 8,
    lift: 1.2,
    gunHeight: 0,
    length: 6.4,
    parts: [
      part('body', [0, 1.75, -1.0], [2.4, 1.9, 3.9]), // canvas-covered cargo bed
      part('body', [0, 1.45, 1.95], [2.3, 1.5, 1.9], false), // cab
      part('engine', [0, 1.05, 2.75], [1.8, 0.6, 0.8]),
      part('exhaust', [-1.05, 2.3, 0.9], [0.2, 1.1, 0.2], false),
      part('wheels', [0, 0.5, 0], [2.5, 0.9, 5.4]),
    ],
  },
  // Pickup with a mounted machine gun: drives to a firing spot and hurts the team badly.
  technical: {
    type: 'technical',
    hp: 200,
    armor: ARMOR.technical,
    speed: 11,
    dps: 3.0,
    range: 300,
    burst: 4,
    firesWhileMoving: false,
    cargoMin: 0,
    cargoMax: 0,
    lift: 0.9,
    gunHeight: 2.3,
    length: 4.8,
    parts: [
      part('body', [0, 1.0, -0.9], [2.0, 0.6, 2.3]), // bed
      part('body', [0, 1.3, 0.8], [1.9, 1.0, 1.5], false), // cab
      part('engine', [0, 0.95, 1.95], [1.6, 0.5, 0.9]),
      part('wheels', [0, 0.4, 0], [2.1, 0.7, 4.6]),
      part('gun', [0, 2.0, -0.8], [0.3, 0.6, 1.6], false), // gun on a pintle
    ],
  },
  // Slow armored carrier: its turret fires on the move; only the 105 mm really hurts it.
  apc: {
    type: 'apc',
    hp: 900,
    armor: ARMOR.apc,
    speed: 5,
    dps: 4.0,
    range: 350,
    burst: 3,
    firesWhileMoving: true,
    cargoMin: 0,
    cargoMax: 0,
    lift: 1.3,
    gunHeight: 2.6,
    length: 6.6,
    parts: [
      part('body', [0, 1.35, 0], [2.8, 1.6, 6.4]), // hull
      part('gun', [0, 2.45, 0.3], [1.4, 0.65, 1.8], false), // turret
      part('gun', [0, 2.5, 1.9], [0.2, 0.2, 2.0], false), // barrel
      part('engine', [0, 2.2, -2.4], [2.2, 0.15, 1.2]), // engine deck
      part('exhaust', [1.2, 1.9, -3.0], [0.3, 0.3, 0.4]),
      part('wheels', [0, 0.5, 0], [3.0, 0.9, 6.3]), // tracks
    ],
  },
};
