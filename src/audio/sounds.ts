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
  // the bomb is the longest, deepest rumble in the game. Made much louder after the M8+ A + B
  // play test ("can we make gun run and bomb louder?"): they are the biggest things you call in.
  impactgunrun: {
    duration: 0.3,
    noiseGain: 0.3,
    cutoffStart: 1800,
    cutoffEnd: 260,
    thumpGain: 0.2,
    thumpStart: 120,
    thumpEnd: 40,
  },
  // The bomb is the 105 mm blast (the user's favorite) made bigger: louder, brighter at the
  // start so it carries on small speakers (most of the 105 mm's energy is below 150 Hz), and a
  // long ring (~4 s audible), then ~2 dB down ("just a little"). M8+ play tests.
  impactbomb: {
    duration: 12,
    noiseGain: 0.82,
    cutoffStart: 1200,
    cutoffEnd: 180,
    thumpGain: 0.85,
    thumpStart: 60,
    thumpEnd: 19,
  },
};

/**
 * The falling bomb's whistle (M8+ play test: "a dropping whistle on bomb like real life"): a
 * tone sliding down in pitch as the bomb falls, with a breathy air-rush layer that follows it,
 * getting louder until the blast cuts it off. Its length is the strike's `whistleSeconds`.
 */
export const WHISTLE = {
  /** Pitch at the start and at impact (Hz): a fast sweep down. */
  startHz: 2600,
  endHz: 650,
  /** Level at the start and just before impact. */
  startGain: 0.012,
  endGain: 0.11,
  /** Mostly air: the band-passed rush is the sound, a faint tone sits inside it (no wobble). */
  rushQ: 3.5,
  rushGain: 1,
  toneGain: 0.18,
} as const;

/** Air strikes are loud wherever they land: they never drop below this (M8+ play test). */
export const STRIKE_MIN_VOLUME = 0.8;

/**
 * Impacts far from where the sensor is looking sound quieter (0.25 at 500 m and beyond). Air
 * strikes (`gunrun`, `bomb`) shake the whole valley, so they stay at `STRIKE_MIN_VOLUME` or more.
 */
export function impactVolume(distanceToAim: number, weapon?: OrdnanceId): number {
  const v = Math.max(0.25, 1 - distanceToAim / 667);
  return weapon === 'gunrun' || weapon === 'bomb' ? Math.max(STRIKE_MIN_VOLUME, v) : v;
}
