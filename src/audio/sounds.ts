import type { OrdnanceId, WeaponId } from '../gunship/weaponDefs';

/**
 * PLACEHOLDER procedural sounds (M3); M9 replaces them with the full audio design.
 * Each sound = a filtered noise burst (the crack/rumble) + an optional falling sine (the thump).
 */
export interface SoundDef {
  /** Seconds. */
  readonly duration: number;
  readonly noiseGain: number;
  /** Low-pass cutoff sweep of the noise (Hz): bright at the start, dull at the end. */
  readonly cutoffStart: number;
  readonly cutoffEnd: number;
  readonly thumpGain: number;
  /** Pitch sweep of the thump (Hz). */
  readonly thumpStart: number;
  readonly thumpEnd: number;
}

export type SoundId = `fire${WeaponId}` | `impact${OrdnanceId}`;

export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = {
  fire25: {
    duration: 0.07,
    noiseGain: 0.25,
    cutoffStart: 3000,
    cutoffEnd: 900,
    thumpGain: 0.1,
    thumpStart: 180,
    thumpEnd: 90,
  },
  fire40: {
    duration: 0.22,
    noiseGain: 0.35,
    cutoffStart: 1600,
    cutoffEnd: 300,
    thumpGain: 0.45,
    thumpStart: 130,
    thumpEnd: 45,
  },
  fire105: {
    duration: 0.7,
    noiseGain: 0.55,
    cutoffStart: 900,
    cutoffEnd: 120,
    thumpGain: 0.8,
    thumpStart: 75,
    thumpEnd: 24,
  },
  // Impacts are heard faintly through the airframe: muffled and low.
  impact25: {
    duration: 0.15,
    noiseGain: 0.06,
    cutoffStart: 700,
    cutoffEnd: 200,
    thumpGain: 0,
    thumpStart: 0,
    thumpEnd: 0,
  },
  impact40: {
    duration: 0.5,
    noiseGain: 0.14,
    cutoffStart: 500,
    cutoffEnd: 120,
    thumpGain: 0.2,
    thumpStart: 60,
    thumpEnd: 30,
  },
  impact105: {
    duration: 1.6,
    noiseGain: 0.3,
    cutoffStart: 400,
    cutoffEnd: 60,
    thumpGain: 0.5,
    thumpStart: 45,
    thumpEnd: 18,
  },
  // Air support (M5+): a gun-run hit is a short crack (40 of them make the ripping sound);
  // the bomb is the longest, deepest rumble in the game.
  impactgunrun: {
    duration: 0.12,
    noiseGain: 0.05,
    cutoffStart: 900,
    cutoffEnd: 250,
    thumpGain: 0.03,
    thumpStart: 90,
    thumpEnd: 50,
  },
  impactbomb: {
    duration: 2.6,
    noiseGain: 0.4,
    cutoffStart: 350,
    cutoffEnd: 40,
    thumpGain: 0.7,
    thumpStart: 38,
    thumpEnd: 12,
  },
};

/** Impacts far from where the sensor is looking sound quieter (0.25 at 500 m and beyond). */
export function impactVolume(distanceToAim: number): number {
  return Math.max(0.25, 1 - distanceToAim / 667);
}
