/**
 * Pure versions of the thermal display math. `ThermalPass`'s fragment shader implements the
 * same formulas in GLSL; keep the two in sync (these tests are the spec).
 */

export type Polarity = 'white' | 'black';

export function togglePolarity(p: Polarity): Polarity {
  return p === 'white' ? 'black' : 'white';
}

/** HUD label for a polarity. */
export function polarityLabel(p: Polarity): string {
  return p === 'white' ? 'WHT HOT' : 'BLK HOT';
}

/** White-hot shows heat as brightness; black-hot inverts it. */
export function applyPolarity(c: number, p: Polarity): number {
  return p === 'white' ? c : 1 - c;
}

export interface Levels {
  readonly lo: number;
  readonly hi: number;
}

/**
 * Contrast curve: maps the heat window [lo, hi] to 0–1, clamps, then applies gamma
 * (gamma < 1 lifts the dark ground so terrain stays readable).
 */
export function contrastCurve(h: number, levels: Levels, gamma: number): number {
  const t = (h - levels.lo) / (levels.hi - levels.lo);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.pow(c, gamma);
}

/**
 * Final brightness of a heat value. The curve is applied *before* polarity, so black-hot is an
 * exact mirror of white-hot and hot targets pop equally in both.
 */
export function displayValue(h: number, p: Polarity, levels: Levels, gamma: number): number {
  return applyPolarity(contrastCurve(h, levels, gamma), p);
}

/**
 * Sensor grain amplitude: stronger at narrow zoom (more magnification → more visible noise).
 * Linear in FOV between the narrowest and widest optics, clamped outside.
 */
export function grainForFov(
  fovDeg: number,
  narrowFov: number,
  wideFov: number,
  grainNarrow: number,
  grainWide: number,
): number {
  const t = Math.min(1, Math.max(0, (fovDeg - narrowFov) / (wideFov - narrowFov)));
  return grainNarrow + (grainWide - grainNarrow) * t;
}
