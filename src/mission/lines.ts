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
  | 'heloHurt'
  // Air defense (M8+ Phase E)
  | 'aaFiring'
  | 'aaDestroyed'
  | 'hullHit'
  | 'missileHit'
  | 'engineLost'
  | 'missileLaunch'
  | 'missileDefeated'
  | 'flaresWasted'
  | 'flaresEmpty'
  | 'jetHit'
  | 'strikeAborted';

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
  // ---- Air defense (M8+ Phase E) ----
  aaFiring: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 20,
    lines: [
      'Triple-A! Tracers coming up, find that gun.',
      'AAA active below us. Kill it before it walks onto us.',
      'Anti-aircraft fire, close. Look for the muzzle flash.',
    ],
  },
  aaDestroyed: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 4,
    lines: ['Triple-A destroyed. Good kill.', "That gun's done shooting.", 'AAA site is down.'],
  },
  hullHit: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 8,
    lines: ["We're taking hits!", 'Rounds in the airframe, kill that gun.', 'Hit! Still flying.'],
  },
  missileHit: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 4,
    lines: ["Missile hit! We're on fire back there.", "Impact! That one hurt, I'm fighting it."],
  },
  engineLost: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 30,
    lines: [
      "Lost number three engine. We're slower now, one more of those and we're done.",
      "Engine three is gone. I can hold the orbit, but we can't take much more.",
    ],
  },
  missileLaunch: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 3,
    lines: [
      'Missile launch! Flares, flares!',
      'Launch, launch! Pop flares!',
      'Smoke trail coming up! Flares!',
    ],
  },
  missileDefeated: {
    speaker: 'PILOT',
    priority: 1,
    cooldown: 4,
    lines: ["Missile's chasing the flares. Good.", 'Decoyed. It went for the flares.'],
  },
  flaresWasted: {
    speaker: 'PILOT',
    priority: 1,
    cooldown: 10,
    lines: ['No launch out there. Save the flares.', "Easy on the flares, we'll need them."],
  },
  flaresEmpty: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 10,
    lines: ["We're out of flares!", 'Dispensers are empty.'],
  },
  jetHit: {
    speaker: 'NAV',
    priority: 2,
    cooldown: 10,
    lines: [
      'Striker took a hit from the triple-A, still in the fight.',
      "The jet's taking fire off target.",
    ],
  },
  strikeAborted: {
    speaker: 'NAV',
    priority: 2,
    cooldown: 5,
    lines: [
      'Strike aborted: too much triple-A. Clear the guns first.',
      "Pilot's aborting, the target area is too hot. Kill the AAA.",
    ],
  },
};
