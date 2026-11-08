import { WEAPONS, type Ordnance, type OrdnanceId, type StrikeId } from './weaponDefs';

/**
 * One air-support strike (PLAN.md §7.19). The aircraft are generic types with fictional
 * callsigns (placeholders, like the rest of the setting). These WILL be tuned in playtesting.
 */
export interface StrikeDef {
  readonly id: StrikeId;
  readonly label: string;
  readonly callsign: string;
  readonly aircraft: string;
  /** Seconds from the call to the first impact. */
  readonly delay: number;
  /** Seconds after a call before this strike can be called again (no per-mission limit). */
  readonly cooldown: number;
  /** Impacts per strike, spread along a strip `stripLength` × `stripWidth` (m) over `walkTime` s. */
  readonly impacts: number;
  readonly stripLength: number;
  readonly stripWidth: number;
  readonly walkTime: number;
  /** The preview warns when a friendly is this close to the footprint (strip or blast circle). */
  readonly dangerClose: number;
  /** The aircraft: speed (m/s) and height (m) over the target as it passes. */
  readonly jetSpeed: number;
  readonly jetAltitude: number;
  /** Seconds between the first impact and the jet passing over the aim point. */
  readonly passOffset: number;
  /** What each impact does. */
  readonly ordnance: Ordnance;
  /** A falling bomb's whistle starts this many seconds before it lands (0 = none). */
  readonly whistleSeconds: number;
}

export const STRIKES: Readonly<Record<StrikeId, StrikeDef>> = {
  // Attack jet, 30 mm cannon: a line of hits walking along a strip. Kills groups in the open.
  gunrun: {
    id: 'gunrun',
    label: 'GUN RUN',
    callsign: 'HAMMER 1-1',
    aircraft: 'attack jet',
    delay: 7,
    cooldown: 60,
    impacts: 40,
    stripLength: 60,
    stripWidth: 8,
    walkTime: 2,
    dangerClose: 25,
    jetSpeed: 190,
    jetAltitude: 260,
    passOffset: 2.6, // the jet fires from behind and pulls up past the far end
    whistleSeconds: 0,
    ordnance: {
      id: 'gunrun',
      damage: 200,
      innerRadius: 1.5,
      blastRadius: 4.5,
      dangerClose: 10,
      // Small on purpose: a wide panic radius made soldiers run out of the strip before the
      // later rounds walked through it (measured in the browser: 0 kills on a group of 9).
      panicRadius: 6,
      fx: {
        flashSize: 2.6,
        debris: 8,
        debrisSpeed: 18,
        smoke: 1,
        smokeSize: 4,
        craterRadius: 0, // 40 per run would use up the crater pool
        shockwave: false,
        shakeDeg: 0.03,
        whiteout: 0,
      },
    },
  },
  // Fast jet, one bomb: long wait, enormous blast. Kills anything, including APCs.
  bomb: {
    id: 'bomb',
    label: 'BOMB',
    callsign: 'SABRE 2-2',
    aircraft: 'fast jet',
    delay: 18,
    cooldown: 90,
    impacts: 1,
    stripLength: 0,
    stripWidth: 0,
    walkTime: 0,
    dangerClose: 100,
    jetSpeed: 260,
    jetAltitude: 650,
    passOffset: -3, // released before the target: it passes overhead before the bomb lands
    whistleSeconds: 0.5, // a short, quiet falling sweep just before impact (M8+ play tests)
    ordnance: {
      id: 'bomb',
      damage: 4000,
      innerRadius: 14,
      blastRadius: 40,
      dangerClose: 100,
      panicRadius: 90,
      fx: {
        flashSize: 48,
        debris: 140,
        debrisSpeed: 45,
        // M8+ play test: "make the impact shake and fog bigger for the bomb".
        smoke: 40,
        smokeSize: 60,
        craterRadius: 18, // M8+ play test: "make the crater it left bigger" (was 9)
        shockwave: true,
        shakeDeg: 0.8,
        shakeReach: 14, // felt anywhere within ~560 m of the crosshair
        shakeSeconds: 0.75, // a ~2 s rumble instead of the guns' short kick
        dust: 64,
        dustSpeed: 30,
        whiteout: 0.9,
      },
    },
  },
};

export const STRIKE_ORDER: readonly StrikeId[] = ['gunrun', 'bomb'];

/** Every kind of impact by id: the gunship's guns and the strikes. */
export const ORDNANCE: Readonly<Record<OrdnanceId, Ordnance>> = {
  ...WEAPONS,
  gunrun: STRIKES.gunrun.ordnance,
  bomb: STRIKES.bomb.ordnance,
};
