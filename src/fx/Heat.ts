/**
 * Heat values (0 = cold, 1 = hot) for everything in the world, plus how hot things cool down.
 * This is data: see PLAN.md §7.5. Nothing in the scene has a color, only a heat.
 */
export const HEAT = {
  soilMin: 0.08,
  soilMax: 0.18,
  road: 0.25,
  tree: 0.12,
  wall: 0.22,
  window: 0.45,
  roof: 0.18,
  chimney: 0.7,
  water: 0.02,
  soldier: 0.95,
  vehicleBody: 0.4,
  engine: 1.0,
  exhaust: 0.9,
  flash: 1.0,
} as const;

export interface CoolingCurve {
  /** Heat at t = 0. */
  readonly from: number;
  /** Heat once fully cooled. */
  readonly to: number;
  /** Seconds until `to` is reached. */
  readonly duration: number;
}

/** Dead soldiers: 0.95 → 0.35 over 60 s. */
export const BODY_COOLING: CoolingCurve = { from: HEAT.soldier, to: 0.35, duration: 60 };
/** Fresh craters show where you've fired: 0.8 → 0.2 over 30 s. */
export const CRATER_COOLING: CoolingCurve = { from: 0.8, to: 0.2, duration: 30 };
/** A wreck after its fire goes out: embers → cold metal. */
export const WRECK_COOLING: CoolingCurve = { from: 0.85, to: 0.3, duration: 60 };

export const FIRE = {
  min: 0.85,
  max: 1.0,
  /** Seconds a destroyed vehicle burns before it starts cooling (WRECK_COOLING). */
  duration: 40,
} as const;

/** How sharply cooling front-loads (Newton-style: fast at first, slow at the end). */
const COOLING_SHARPNESS = 3;

/**
 * Heat of a cooling object `t` seconds after it started cooling.
 * Exponential-looking (fast at first), but it hits `from` exactly at t = 0 and `to`
 * exactly at t = duration, and never moves past either.
 */
export function coolingHeat(curve: CoolingCurve, t: number): number {
  if (t <= 0) return curve.from;
  if (t >= curve.duration) return curve.to;
  const k = COOLING_SHARPNESS;
  const end = Math.exp(-k);
  const f = (Math.exp((-k * t) / curve.duration) - end) / (1 - end); // 1 → 0
  return curve.to + (curve.from - curve.to) * f;
}

/**
 * Flickering fire heat, always within [FIRE.min, FIRE.max]. `seed` de-syncs separate fires.
 * Sum of incommensurate sines, so it never visibly repeats.
 */
export function fireHeat(t: number, seed = 0): number {
  const s = seed * 12.9898;
  const wobble =
    0.5 * Math.sin(t * 11.0 + s) + 0.3 * Math.sin(t * 23.7 + s * 1.7) + 0.2 * Math.sin(t * 5.3);
  const u = 0.5 + 0.5 * wobble; // 0..1 (the weights sum to 1)
  return FIRE.min + (FIRE.max - FIRE.min) * u;
}

/** A destroyed vehicle: burns for FIRE.duration seconds, then cools as a wreck. */
export function wreckHeat(t: number, seed = 0): number {
  if (t < FIRE.duration) return fireHeat(t, seed);
  return coolingHeat(WRECK_COOLING, t - FIRE.duration);
}
