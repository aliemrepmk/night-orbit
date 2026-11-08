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
  | 'strikeAborted'
  // M8+ Phase F: landmark callouts (text built on the fly) and banter in quiet moments
  | 'contact'
  | 'banter';

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
      "Good hit. He's down.",
      'Target neutralized.',
      'Good shooting, Lantern.',
      'Hit. No movement.',
      "He's done.",
      'Clean hit, next one.',
      'Down. Keep scanning.',
      'Splash one.',
    ],
  },
  multiKill: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 6,
    lines: [
      'That broke them up.',
      "Whole group's gone.",
      'Good effect on target, multiple down.',
      "That group's not moving anymore.",
      'Several down in that blast.',
      "Good effect. That whole cluster's gone.",
      'Nobody walking away from that one.',
      'That took out the lot of them.',
      'Multiple down, nice work.',
    ],
  },
  vehicleKill: {
    speaker: 'NAV',
    priority: 1,
    cooldown: 3,
    lines: [
      'Vehicle destroyed.',
      "That truck's burning.",
      'Good kill on the vehicle.',
      "Vehicle's burning.",
      "That one's not driving anywhere.",
      "Good kill on the truck, it's a wreck.",
      'Vehicle stopped and burning.',
      'Direct hit on the vehicle.',
      'Scratch one vehicle.',
    ],
  },
  dangerClose: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 6,
    lines: [
      'Watch it. That was close to Ridgeback.',
      'Danger close. Check your aim.',
      'That was right on top of them, Lantern!',
      "Too close! Ridgeback's in that blast radius.",
      'Danger close! Give them more room.',
      'Easy, that was almost a blue-on-blue.',
    ],
  },
  strikeDangerClose: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 4,
    lines: [
      "That strike's danger close to Ridgeback. Your call, Lantern.",
      'Friendlies inside the footprint margin. Confirm you want that.',
      "Strike footprint is over Ridgeback's position. Confirm.",
      'Ridgeback is inside the danger-close line for that strike.',
      'Lantern, that strike will land very close to friendlies.',
    ],
  },
  miss: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 12,
    lines: [
      'Off target. Adjust.',
      'Rounds long.',
      'No effect. Walk it in.',
      'Missed. Bring it onto the target.',
      'Short. Adjust your aim.',
      'Wide of the target.',
      'No hits there. Walk it onto them.',
      'That one went into the dirt.',
      'Off. Re-engage.',
    ],
  },
  clinicHover: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 25,
    lines: [
      "That's the clinic. Do not engage it.",
      'Clinic under your crosshair. Hold fire there.',
      'Clinic. No fire on that building.',
      'That roof is the clinic. Look elsewhere.',
      'Civilians in there, Lantern. Move off it.',
      "Crosshair's on the clinic. Hold.",
    ],
  },
  clinicNearMiss: {
    speaker: 'FCO',
    priority: 2,
    cooldown: 5,
    lines: [
      'Check fire! That landed next to the clinic.',
      'Too close to the clinic. Pick another shot.',
      'That shook the clinic. Watch it!',
      'Way too close to the clinic, Lantern.',
      "Clinic's taking splinters. Check fire.",
      'Next one like that and we hit the clinic.',
    ],
  },
  teamUnderFire: {
    speaker: 'RIDGEBACK',
    priority: 1,
    cooldown: 20,
    lines: [
      'Lantern, Ridgeback, taking fire!',
      'Contact! We need help down here.',
      'Ridgeback, contact, contact!',
      "We're under fire, Lantern!",
      'Taking rounds from the treeline!',
      "Lantern, we've got shooters on us!",
      'Contact front! Need fire!',
    ],
  },
  teamHurt: {
    speaker: 'RIDGEBACK',
    priority: 2,
    cooldown: 30,
    lines: [
      "We can't hold much longer, Lantern!",
      "Ridgeback's hurting. Get them off us!",
      "We've got wounded, Lantern, we need that fire now!",
      "They're closing in! Hit them!",
      "Ridgeback is in trouble, we're pinned!",
      'Running low on everything down here!',
      "Lantern, they're right on top of us!",
    ],
  },
  heloUnderFire: {
    speaker: 'KESTREL',
    priority: 2,
    cooldown: 15,
    lines: [
      "Kestrel's taking fire on the ground!",
      "Lantern, Kestrel, we're getting shot at down here!",
      'Rounds hitting the bird, Lantern!',
      'Kestrel taking fire, keep them off us!',
      "They're shooting at the helicopter!",
    ],
  },
  heloHurt: {
    speaker: 'KESTREL',
    priority: 2,
    cooldown: 12,
    lines: [
      "Kestrel's hit! We can't sit here much longer!",
      'Taking damage, Lantern. Clear that LZ!',
      "Kestrel's losing hydraulics! Clear that LZ!",
      "We're hit bad, Lantern, we can't take much more!",
      'Warning lights everywhere. Make it quick!',
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
      'Tracers climbing at us! Find the gun.',
      'Flak bursts close aboard. AAA below.',
      'Triple-A, close! Kill it before it finds the range.',
    ],
  },
  aaDestroyed: {
    speaker: 'FCO',
    priority: 1,
    cooldown: 4,
    lines: [
      'Triple-A destroyed. Good kill.',
      "That gun's done shooting.",
      'AAA site is down.',
      'Triple-A silenced.',
      'No more flak from that one.',
      'AAA site destroyed. Good shooting.',
    ],
  },
  hullHit: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 8,
    lines: [
      "We're taking hits!",
      'Rounds in the airframe, kill that gun.',
      'Hit! Still flying.',
      'That one hit the wing!',
      'Taking hits, Lantern, find that gun!',
      "We're getting peppered up here!",
    ],
  },
  missileHit: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 4,
    lines: [
      "Missile hit! We're on fire back there.",
      "Impact! That one hurt, I'm fighting it.",
      "Missile hit! I've got fire warnings!",
      'We took the missile! Still flying, barely.',
    ],
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
      'Missile in the air! Flares!',
      'Launch! Smoke trail, coming up fast!',
      'Missile, missile! Pop flares!',
    ],
  },
  missileDefeated: {
    speaker: 'PILOT',
    priority: 1,
    cooldown: 4,
    lines: [
      "Missile's chasing the flares. Good.",
      'Decoyed. It went for the flares.',
      "Missile's gone wide. Flares did it.",
      'Decoyed. That was close.',
      'It bit on the flares.',
    ],
  },
  flaresWasted: {
    speaker: 'PILOT',
    priority: 1,
    cooldown: 10,
    lines: [
      'No launch out there. Save the flares.',
      "Easy on the flares, we'll need them.",
      'No missile out there, Lantern.',
      'Flares away, but nothing was coming.',
    ],
  },
  flaresEmpty: {
    speaker: 'PILOT',
    priority: 2,
    cooldown: 10,
    lines: [
      "We're out of flares!",
      'Dispensers are empty.',
      'Flare dispensers empty!',
      'No flares left. Kill the missile teams.',
    ],
  },
  jetHit: {
    speaker: 'NAV',
    priority: 2,
    cooldown: 10,
    lines: [
      'Striker took a hit from the triple-A, still in the fight.',
      "The jet's taking fire off target.",
      'The jet took flak over the target.',
      'Striker hit by triple-A, pulling off.',
    ],
  },
  strikeAborted: {
    speaker: 'NAV',
    priority: 2,
    cooldown: 5,
    lines: [
      'Strike aborted: too much triple-A. Clear the guns first.',
      "Pilot's aborting, the target area is too hot. Kill the AAA.",
      "Striker can't get in, the AAA is too thick.",
      'Strike called off, too many guns down there.',
    ],
  },
  // ---- M8+ Phase F ----
  /** Callout templates: `{place}` is filled with a landmark ("north of the barn"). */
  contact: {
    speaker: 'NAV',
    priority: 1, // chatter: any story line or warning cuts in
    cooldown: 18,
    lines: [
      'Movement {place}.',
      'New group {place}.',
      'Foot mobiles {place}, heading for Ridgeback.',
      'I have contacts {place}.',
      'Heat signatures {place}.',
      'More of them {place}.',
    ],
  },
  banter: {
    speaker: 'PILOT',
    priority: 1, // chatter: any story line or warning cuts in
    cooldown: 70,
    lines: [
      'Fuel is good for another hour. Plenty of time.',
      'Wind is picking up from the north-west. Holding the orbit.',
      "Quiet for a moment. Don't get used to it.",
      'Coffee is cold back here, by the way.',
      'Nav, how are we for time?',
      'Everyone stay sharp. They regroup fast in this valley.',
      'Nice and steady. Keep scanning the treelines.',
      'Long night. Ridgeback has it worse than we do.',
      'Orbit is stable. Your picture should be smooth.',
      'Kestrel is spun up and waiting on our word.',
      'That valley wall is a natural trap. Watch the high ground.',
      'Remember, the strobes are ours. Everything else is fair game.',
    ],
  },
};
