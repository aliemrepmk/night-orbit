import type { Priority, Speaker } from './missionTypes';

/**
 * Every reactive radio line (PLAN.md §7.15), written for this game. Story lines live in the
 * mission script (`missionDef.ts`), next to the beats they belong to.
 */
export type PoolId =
  | 'kill'
  | 'multiKill'
  | 'vehicleKill'
  | 'dangerClose'
  | 'strikeDangerClose'
  | 'miss'
  | 'clinicHover'
  | 'clinicNearMiss'
  | 'teamUnderFire'
  | 'teamHurt'
  | 'heloUnderFire'
  | 'heloHurt';

export interface Pool {
  readonly speaker: Speaker;
  readonly priority: Priority;
  /** Seconds before this pool may speak again. */
  readonly cooldown: number;
  readonly lines: readonly string[];
}

export const POOLS: Readonly<Record<PoolId, Pool>> = {
  kill: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 4,
    lines: [
      'Target down.',
      'Splash. Good effect.',
      "That one's not getting up.",
      'Confirmed. Next target.',
    ],
  },
  multiKill: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 6,
    lines: ['That broke them up.', "Whole group's gone.", 'Good effect on target, multiple down.'],
  },
  vehicleKill: {
    speaker: 'NAV',
    priority: 1,
    cooldown: 3,
    lines: ['Vehicle destroyed.', "That truck's burning.", 'Good kill on the vehicle.'],
  },
  dangerClose: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 6,
    lines: ['Watch it. That was close to Ridgeback.', 'Danger close. Check your aim.'],
  },
  strikeDangerClose: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 4,
    lines: [
      "That strike's danger close to Ridgeback. Your call, Lantern.",
      'Friendlies inside the footprint margin. Confirm you want that.',
    ],
  },
  miss: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 12,
    lines: ['Off target. Adjust.', 'Rounds long.', 'No effect. Walk it in.'],
  },
  clinicHover: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 25,
    lines: [
      "That's the clinic. Do not engage it.",
      'Clinic under your crosshair. Hold fire there.',
    ],
  },
  clinicNearMiss: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 5,
    lines: [
      'Check fire! That landed next to the clinic.',
      'Too close to the clinic. Pick another shot.',
    ],
  },
  teamUnderFire: {
    speaker: 'RIDGEBACK',
    priority: 1,
    cooldown: 20,
    lines: ['Lantern, Ridgeback, taking fire!', 'Contact! We need help down here.'],
  },
  teamHurt: {
    speaker: 'RIDGEBACK',
    priority: 2,
    cooldown: 30,
    lines: ["We can't hold much longer, Lantern!", "Ridgeback's hurting. Get them off us!"],
  },
  heloUnderFire: {
    speaker: 'KESTREL',
    priority: 2,
    cooldown: 15,
    lines: [
      "Kestrel's taking fire on the ground!",
      "Lantern, Kestrel, we're getting shot at down here!",
    ],
  },
  heloHurt: {
    speaker: 'KESTREL',
    priority: 2,
    cooldown: 12,
    lines: [
      "Kestrel's hit! We can't sit here much longer!",
      'Taking damage, Lantern. Clear that LZ!',
    ],
  },
};
