/**
 * Pure versions of the sensor display math. The shaders implement the same formulas in GLSL
 * (`ThermalMaterial` for NV surface light, `ThermalPass` for the display curves); keep them in
 * sync (these tests are the spec).
 */

export type Polarity = 'white' | 'black';

/** Sensor modes, in the order the `F` key cycles through them. */
export type SensorMode = 'white' | 'black' | 'nv';
export const SENSOR_MODES: readonly SensorMode[] = ['white', 'black', 'nv'];

export function nextSensorMode(m: SensorMode): SensorMode {
  return SENSOR_MODES[(SENSOR_MODES.indexOf(m) + 1) % SENSOR_MODES.length];
}

/** HUD label for a sensor mode. */
export function sensorModeLabel(m: SensorMode): string {
  return m === 'white' ? 'WHT HOT' : m === 'black' ? 'BLK HOT' : 'NV';
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

export interface NvLighting {
  readonly skyLight: number;
  readonly moonLight: number;
}

/**
 * Light a surface sends to the NV sensor: its albedo × (sky light, only slightly stronger on
 * surfaces facing up, so sides of trees and walls aren't black + moonlight by angle), plus its glow.
 * `normalY` is the surface normal's up component, `moonDot` = max(0, normal · toward-moon).
 */
export function nvSurfaceLight(
  albedo: number,
  glow: number,
  normalY: number,
  moonDot: number,
  l: NvLighting,
): number {
  const sky = l.skyLight * (0.8 + 0.2 * Math.max(0, normalY));
  return albedo * (sky + l.moonLight * Math.max(0, moonDot)) + glow;
}

/** NV display curve: light × gain, clamped to 0–1, then gamma. No polarity in NV. */
export function nvCurve(light: number, gain: number, gamma: number): number {
  const c = Math.min(1, Math.max(0, light * gain));
  return Math.pow(c, gamma);
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
