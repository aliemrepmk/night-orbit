import type { OrdnanceId, WeaponId } from '../gunship/weaponDefs';
import type { Bus } from './mix';

/**
 * Procedural sounds (M3 placeholders, redesigned in M9, PLAN.md §7.17). Each sound = a filtered
 * noise burst (the crack or rumble) + an optional falling sine (the thump), plus optional layers:
 * a click (the transient that makes a shot snap), a cabin rattle (the 105 mm shaking the
 * airframe) and short tones (radio and UI beeps).
 */
export interface SoundDef {
  /** The mixer bus it plays on (M9); `sfx` when left out. */
  readonly bus?: Bus;
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
  /** The noise filter (default low-pass); a band-pass gives the 25 mm its bright crack. */
  readonly filter?: 'lowpass' | 'bandpass' | 'highpass';
  readonly q?: number;
  /** A few-millisecond tick at the start (the snap of a gun, a radio key-up). */
  readonly click?: { readonly gain: number; readonly hz: number };
  /** Band-passed noise shaking at `rateHz`, starting `delay` s in: loose kit rattling in the cabin. */
  readonly rattle?: {
    readonly gain: number;
    readonly hz: number;
    readonly rateHz: number;
    readonly delay: number;
    readonly seconds: number;
  };
  /** Short tones (beeps), each starting `at` s in. */
  readonly tones?: readonly Tone[];
}

export interface Tone {
  readonly hz: number;
  readonly at: number;
  readonly seconds: number;
  readonly gain: number;
  readonly wave: 'sine' | 'square' | 'triangle';
}

/** Plus the air-defense sounds (M8+ Phase E): AA bursts, hits on the hull, flare pops. */
export type SoundId =
  | `fire${WeaponId}`
  | `impact${OrdnanceId}`
  | 'aaBurst'
  | 'hullHit'
  | 'flare'
  | UiSoundId
  | RadioSoundId;

/** Cockpit and menu beeps (M9). */
export type UiSoundId = 'select' | 'ready' | 'breech' | 'deny' | 'uiClick';

/** The radio (M9): squelch on the outside net, a click on the crew intercom. */
export type RadioSoundId = 'squelchOpen' | 'squelchClose' | 'intercom';

export const SOUNDS: Readonly<Record<SoundId, SoundDef>> = {
  // The guns (M9): told apart by ear. The 25 mm is a short bright crack, ten a second (a buzz
  // when held); the 40 mm a round "thoomp" with a click; the 105 mm a deep boom that rattles
  // the cabin for half a second.
  fire25: {
    duration: 0.06,
    noiseGain: 0.34,
    filter: 'bandpass',
    q: 1.1,
    cutoffStart: 2600,
    cutoffEnd: 1300,
    thumpGain: 0.07,
    thumpStart: 230,
    thumpEnd: 120,
    click: { gain: 0.07, hz: 3200 },
  },
  fire40: {
    duration: 0.32,
    noiseGain: 0.26,
    cutoffStart: 1400,
    cutoffEnd: 240,
    thumpGain: 0.6,
    thumpStart: 120,
    thumpEnd: 40,
    click: { gain: 0.16, hz: 1700 },
  },
  fire105: {
    duration: 1.1,
    noiseGain: 0.55,
    cutoffStart: 800,
    cutoffEnd: 90,
    thumpGain: 0.85,
    thumpStart: 60,
    thumpEnd: 25,
    rattle: { gain: 0.14, hz: 1900, rateHz: 26, delay: 0.04, seconds: 0.6 },
  },
  // Impacts are heard faintly through the airframe, when the shell lands (the flight time is
  // the delay you hear). Each has its own shape: 25 mm pops, a 40 mm crump, a 105 mm rumble.
  impact25: {
    duration: 0.18,
    noiseGain: 0.12,
    filter: 'bandpass',
    q: 0.9,
    cutoffStart: 1200,
    cutoffEnd: 420,
    thumpGain: 0,
    thumpStart: 0,
    thumpEnd: 0,
  },
  impact40: {
    duration: 0.6,
    noiseGain: 0.18,
    cutoffStart: 600,
    cutoffEnd: 120,
    thumpGain: 0.26,
    thumpStart: 70,
    thumpEnd: 32,
  },
  impact105: {
    duration: 1.8,
    noiseGain: 0.32,
    cutoffStart: 420,
    cutoffEnd: 60,
    thumpGain: 0.55,
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
  // Air defense (M8+ Phase E): distant AA thumps, a metallic bang in the airframe, flares popping.
  aaBurst: {
    duration: 0.5,
    noiseGain: 0.12,
    cutoffStart: 700,
    cutoffEnd: 150,
    thumpGain: 0.18,
    thumpStart: 90,
    thumpEnd: 45,
  },
  hullHit: {
    duration: 0.45,
    noiseGain: 0.7,
    cutoffStart: 4000,
    cutoffEnd: 400,
    thumpGain: 0.5,
    thumpStart: 140,
    thumpEnd: 60,
  },
  flare: {
    duration: 0.25,
    noiseGain: 0.35,
    cutoffStart: 6000,
    cutoffEnd: 1500,
    thumpGain: 0.1,
    thumpStart: 300,
    thumpEnd: 120,
  },
  // Cockpit beeps (M9, PLAN.md §7.17): soft and short, so they never mask a gun. (Levels set
  // by rendering each sound offline in Chrome: a band-pass keeps only a slice of the noise, so
  // band-passed sounds need a much higher gain than low-passed ones to be heard.)
  select: { ...silent(0.05), tones: [{ hz: 880, at: 0, seconds: 0.05, gain: 0.08, wave: 'sine' }] },
  ready: {
    ...silent(0.14),
    tones: [
      { hz: 660, at: 0, seconds: 0.06, gain: 0.05, wave: 'sine' },
      { hz: 990, at: 0.07, seconds: 0.07, gain: 0.05, wave: 'sine' },
    ],
  },
  // The loader slams a 105 mm round home: a metallic clank, then the ready beep.
  breech: {
    duration: 0.22,
    noiseGain: 0.3,
    filter: 'bandpass',
    q: 3,
    cutoffStart: 2200,
    cutoffEnd: 900,
    thumpGain: 0.12,
    thumpStart: 180,
    thumpEnd: 90,
    tones: [
      { hz: 410, at: 0, seconds: 0.08, gain: 0.05, wave: 'triangle' },
      { hz: 623, at: 0, seconds: 0.06, gain: 0.035, wave: 'triangle' },
    ],
  },
  /** Can't do that (no flares left). */
  deny: {
    ...silent(0.16),
    tones: [{ hz: 220, at: 0, seconds: 0.16, gain: 0.06, wave: 'square' }],
  },
  uiClick: {
    ...silent(0.03),
    click: { gain: 0.12, hz: 2400 },
    tones: [{ hz: 1320, at: 0, seconds: 0.025, gain: 0.07, wave: 'sine' }],
  },
  // Radio (M9): the outside net opens with a short burst of static and a key click, and
  // closes with the longer "kssht" tail; the crew intercom is just a soft click.
  squelchOpen: {
    bus: 'radio',
    duration: 0.09,
    noiseGain: 0.7,
    filter: 'bandpass',
    q: 0.6,
    cutoffStart: 2600,
    cutoffEnd: 2000,
    thumpGain: 0,
    thumpStart: 0,
    thumpEnd: 0,
    click: { gain: 0.15, hz: 1200 },
  },
  squelchClose: {
    bus: 'radio',
    duration: 0.2,
    noiseGain: 0.8,
    filter: 'bandpass',
    q: 0.5,
    cutoffStart: 3400,
    cutoffEnd: 1600,
    thumpGain: 0,
    thumpStart: 0,
    thumpEnd: 0,
    click: { gain: 0.06, hz: 900 },
  },
  intercom: {
    bus: 'radio',
    ...silent(0.02),
    click: { gain: 0.18, hz: 1500 },
  },
};

/** A sound with no noise or thump (beeps and clicks only). */
function silent(duration: number) {
  return {
    duration,
    noiseGain: 0,
    cutoffStart: 0,
    cutoffEnd: 0,
    thumpGain: 0,
    thumpStart: 0,
    thumpEnd: 0,
  };
}

/**
 * While a line on the outside net is on air, a faint band of static sits under it (M9), so the
 * radio is heard as well as read.
 */
export const RADIO_HISS = { hz: 2200, q: 0.6, gain: 0.025, fadeSeconds: 0.05 } as const;

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
