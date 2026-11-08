import { CONFIG } from '../config';
import { MAP } from '../world/MapData';
import type { MissionDef, Phase, Step } from './missionTypes';
import type { SideEvent, TwistRoll } from './twists';
import {
  abortHelicopter,
  activateAA,
  anyOf,
  downPilot,
  fogIn,
  jamGun,
  resolveHvt,
  startMortar,
  woundTeam,
  clearFlag,
  allOf,
  boardHelicopter,
  completeMission,
  flag,
  helicopter,
  markClinic,
  moveTeam,
  nextPhase,
  routZone,
  say,
  setObjective,
  setOrbitFocus,
  spawnConvoy,
  spawnHelicopter,
  spawnWave,
  startTimer,
  teamHold,
  teamReached,
  timeInPhase,
  timeInStep,
  timerBelow,
  timerDone,
  vehiclesDestroyed,
  zoneEnemiesBelow,
  zoneWaves,
} from './script';

/** Where Kestrel 6 sets down: on the quarry floor, beside Ridgeback's position at the LZ. */
export const HELICOPTER_PAD = [582, 296] as const;
/** Kestrel 6 comes in low from the south-east, over the far ridge. */
export const HELICOPTER_FROM = [790, 560] as const;
/** LZ SAWMILL (M8+ Phase F): the pad in the clearing, and Kestrel's way in over the forest. */
export const SAWMILL_PAD = [586, -364] as const;
export const SAWMILL_FROM = [780, -760] as const;
/** Where the downed strike pilot comes down (east of the crossroads, inside the sensor's reach). */
export const PILOT_DOWN = [470, -55] as const;

/** Background patrols (s between groups) while Ridgeback walks between fights (M8+ Phase F). */
const PATROL = 26;

/** The safety valve for "wait for a zone to clear" steps (PLAN.md §7.14). */
const CLEAR_TIMEOUT = 100;

/**
 * The safety valve for "wait until Ridgeback gets there" steps: twice the time the route takes
 * at walking pace, plus a margin (the team slows in formation and around houses).
 */
export function walkTimeout(route: string): number {
  const pts = MAP.friendlyRoutes[route];
  let len = 0;
  for (let i = 1; i < pts.length; i++)
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return Math.ceil((2 * len) / CONFIG.ridgeback.speed + 30);
}

/**
 * VARESH VALLEY (PLAN.md §8): Ridgeback walks from its compromised OP to LZ QUARRY under
 * LANTERN 2-1's guns. Calibration, then four phases: fields, village, vehicles, extraction.
 * Site ids are the map's enemy paths or `zone:index` spawn points (`MapData.ts`); every id is
 * checked against the map by `missionDef.test.ts`. All dialogue is written for this game.
 */
/** A calibration prompt's reminder: the FCO repeats the hint until the player does it. */
const prompt = (hint: string) => ({
  every: CONFIG.mission.promptRemindSeconds,
  actions: [say('FCO', hint)],
});

export function buildMission(roll: TwistRoll): MissionDef {
  const has = (e: SideEvent) => roll.side.includes(e);
  const when = <T>(cond: boolean, items: T[]): T[] => (cond ? items : []);
  const sawmillEnding = roll.extraction !== 'holdTheLine';
  return {
    id: 'varesh_valley',
    phases: [
      {
        id: 'calibration',
        objective: 'Calibrate the sensor',
        teamStart: [-660, 170],
        onEnter: [
          setOrbitFocus(null),
          say('FCO', 'Lantern, FCO. Ridgeback is at the OP, four strobes. Let us run the checks.'),
        ],
        // Each prompt waits for the player (no timeout: they can always do it) and repeats its hint
        // every so often. A prompt clears its flag when shown, so only what the player does after
        // it counts (M8+ fix: the captions used to run on without checking).
        steps: [
          {
            note: 'find',
            when: timeInPhase(4),
            do: [
              clearFlag('located'),
              setObjective('Find Ridgeback: crosshair on the strobes'),
              say(
                'FCO',
                'Move the sensor with the mouse. Find the blinking strobes: that is Ridgeback. Put the crosshair on them.',
              ),
            ],
          },
          {
            note: '25mm',
            when: flag('located'),
            remind: prompt(
              'Still no eyes on Ridgeback? Four blinking strobes at the OP. Slew onto them.',
            ),
            do: [
              clearFlag('weapon25'),
              setObjective('Select the 25 mm (1)'),
              say(
                'FCO',
                'Good eyes, that is them. Select the two-five with 1. Hold the trigger for a burst.',
              ),
            ],
          },
          {
            note: '40mm',
            when: flag('weapon25'),
            remind: prompt('Key 1 for the two-five.'),
            do: [
              clearFlag('weapon40'),
              setObjective('Select the 40 mm (2)'),
              say('FCO', 'Now the forty, key 2. Five rounds a clip.'),
            ],
          },
          {
            note: '105mm',
            when: flag('weapon40'),
            remind: prompt('Key 2 for the forty.'),
            do: [
              clearFlag('weapon105'),
              setObjective('Select the 105 mm (3)'),
              say('FCO', 'And the one-oh-five, key 3. Big hit, long reload. Never near Ridgeback.'),
            ],
          },
          {
            note: 'sensor',
            when: flag('weapon105'),
            remind: prompt('Key 3 for the one-oh-five.'),
            do: [
              clearFlag('sensor'),
              setObjective('Switch the sensor mode (F)'),
              say(
                'FCO',
                'Press F to cycle white-hot, black-hot and night vision. Use what reads best.',
              ),
            ],
          },
          {
            note: 'done',
            when: flag('sensor'),
            remind: prompt('Press F to switch the sensor mode.'),
            do: [
              say('FCO', 'Checks complete. Ridgeback, Lantern is on station.'),
              say('RIDGEBACK', 'Good to hear you, Lantern. Moving out.'),
              say(
                'FCO',
                'Intel says triple-A on the ridge north of the fields. Kill it before we bring the jets in. X for flares if anything launches.',
              ),
              nextPhase(),
            ],
          },
        ],
      },

      {
        id: 'fields',
        objective: 'Cover Ridgeback across the fields',
        teamStart: [-660, 170],
        onEnter: [
          setOrbitFocus(null),
          moveTeam('route_op_fields'),
          zoneWaves('fields', PATROL), // patrols while Ridgeback walks (M8+ Phase F pacing)
          activateAA('aa_ridge'), // M8+ Phase E
          say('FCO', 'Ridgeback is moving. You are cleared on anything without a strobe.'),
          spawnWave('fields_treeline', 10),
          say('NAV', 'Movement in the tree line, north of the fields. Far from friendlies.'),
        ],
        steps: [
          {
            note: 'farmhouse',
            when: teamReached('route_op_fields'),
            timeout: walkTimeout('route_op_fields'),
            do: [
              teamHold(),
              zoneWaves(null),
              spawnWave('fields:8', 7),
              spawnWave('fields:9', 7),
              spawnWave('fields:2', 6),
              say('NAV', 'Contacts coming out of the farmhouse and the barn, more from the north.'),
              ...when(has('mortar'), [
                startMortar([-520, -150]),
                say(
                  'NAV',
                  'Mortar on the ridge north of the farm! Rounds walking in on Ridgeback. Find the tube flash and kill the crew.',
                  2,
                ),
              ]),
            ],
          },
          {
            note: 'fields clear',
            when: zoneEnemiesBelow('fields', 3),
            timeout: CLEAR_TIMEOUT,
            onTimeout: [routZone('fields')],
            do: [
              say('FCO', 'Farmhouse looks quiet. Ridgeback, push to the bridge.'),
              moveTeam('route_fields_bridge'),
              spawnWave('fields:3', 6),
              zoneWaves('fields', PATROL),
            ],
          },
          {
            note: 'hedgerow flank',
            when: timeInStep(14),
            do: [
              zoneWaves(null),
              spawnWave('fields_hedge', 8),
              spawnWave('fields:4', 6),
              say('NAV', 'Group moving up the hedgerow on the south side. Close to Ridgeback.'),
              say('FCO', 'That is danger close for the one-oh-five. Work them with the two-five.'),
            ],
          },
          {
            note: 'bridge',
            when: allOf(teamReached('route_fields_bridge'), zoneEnemiesBelow('fields', 3)),
            timeout: walkTimeout('route_fields_bridge'),
            onTimeout: [routZone('fields')],
            do: [say('RIDGEBACK', 'At the bridge. Crossing now.'), nextPhase()],
          },
        ],
      },

      {
        id: 'village',
        objective: 'Cover Ridgeback through the village',
        teamStart: [-240, 131],
        onEnter: [
          moveTeam('route_bridge_village'),
          zoneWaves('village', PATROL),
          activateAA('aa_village'), // M8+ Phase E
          spawnWave('village_north', 2, 'manpads'),
          spawnWave('village:6', 6), // an ambush on the walk in (M8+ Phase F)
          ...when(has('fog'), [
            fogIn(CONFIG.twists.fogSeconds),
            say(
              'NAV',
              'Ground fog rolling into the valley. Contrast is going to drop for a while.',
              2,
            ),
          ]),
          say(
            'FCO',
            'Be advised: the building with the generator heat on the square is a clinic. Do not engage it under any circumstances.',
          ),
          markClinic(6),
        ],
        steps: [
          {
            note: 'west streets',
            when: teamReached('route_bridge_village'),
            timeout: walkTimeout('route_bridge_village'),
            do: [
              teamHold(),
              zoneWaves(null),
              spawnWave('village_west', 7),
              spawnWave('village:7', 6),
              spawnWave('village:2', 6),
              say('NAV', 'Contacts in the west streets. Watch the doorways.'),
            ],
          },
          {
            note: 'west clear',
            when: zoneEnemiesBelow('village', 3),
            timeout: CLEAR_TIMEOUT,
            onTimeout: [routZone('village')],
            do: [
              moveTeam('route_village_square'),
              zoneWaves('village', PATROL),
              spawnWave('village_east', 7),
              ...when(has('wounded'), [
                woundTeam(),
                say('RIDGEBACK', 'Ridgeback three is hit! We can still move, but slow.', 2),
              ]),
              say('NAV', 'Enemies moving up beside the clinic. Careful with the big guns there.'),
            ],
          },
          {
            note: 'pinned in the square',
            when: teamReached('route_village_square'),
            timeout: walkTimeout('route_village_square'),
            do: [
              teamHold(),
              zoneWaves(null),
              setObjective('Hold the square'),
              say(
                'RIDGEBACK',
                'Lantern, we are pinned in the square! Fire from the north and east!',
              ),
              spawnWave('village_north', 9),
              spawnWave('village_northeast', 9),
              spawnWave('village:1', 6),
            ],
          },
          ...when(has('clinicAssault'), [
            {
              note: 'clinic assault',
              when: timeInStep(12),
              do: [
                setObjective('Hold the square, keep them off the clinic'),
                spawnWave('village:10', 6),
                spawnWave('village:12', 6),
                say('RIDGEBACK', 'They are going for the clinic! Militia at the doors!', 2),
                say('FCO', 'Precise fire only near that building. Use the two-five.', 2),
              ],
            },
          ]),
          {
            note: 'technical',
            when: timeInStep(20),
            do: [
              spawnWave('village_south', 7),
              spawnWave('village:9', 6),
              spawnWave('village:5', 6),
              spawnConvoy('village_technical', ['technical'], 'village_tech'),
              say('NAV', 'Technical coming in on the east road. The forty will stop it.'),
              ...when(has('bus'), [
                spawnConvoy('bus_route', ['bus'], 'bus'),
                say(
                  'NAV',
                  'Civilian bus coming down the main road from the east. Do not engage it.',
                  2,
                ),
              ]),
            ],
          },
          {
            note: 'square clear',
            when: allOf(vehiclesDestroyed('village_tech'), zoneEnemiesBelow('village', 3)),
            timeout: 150,
            onTimeout: [routZone('village')],
            do: [
              setObjective('Cover Ridgeback to the east edge'),
              say('FCO', 'Square is clear. Ridgeback, move to the east edge.'),
              moveTeam('route_square_east'),
              spawnWave('village:8', 6),
              zoneWaves('village', PATROL),
            ],
          },
          {
            note: 'east edge',
            when: teamReached('route_square_east'),
            timeout: walkTimeout('route_square_east'),
            do: [nextPhase()],
          },
        ],
      },

      {
        id: 'vehicles',
        objective: 'Stop the convoy',
        teamStart: [140, 40],
        onEnter: [
          teamHold(),
          zoneWaves(null),
          setOrbitFocus('crossroads'),
          say('NAV', 'Multiple vehicles on the north road, heading your way.'),
          spawnConvoy('north_convoy', ['truck', 'truck', 'technical', 'apc'], 'convoy'),
          // M8+ Phase E: an AA truck up the east road, and the gun at the crossroads.
          spawnConvoy('east_convoy', ['aaa'], 'aaa'),
          activateAA('aa_crossroads'),
          say('FCO', 'The APC will shrug off the forty. That is a job for the one-oh-five.', 2),
        ],
        steps: [
          {
            note: 'advance',
            when: timeInPhase(12),
            do: [
              moveTeam('route_east_crossroads'),
              spawnWave('crossroads_north', 8),
              spawnWave('crossroads:5', 6),
              say('NAV', 'Foot mobiles moving with the convoy, north and east of the crossroads.'),
              ...when(has('manpadsAmbush'), [
                spawnWave('crossroads:3', 3, 'manpads'),
                say('FCO', 'Missile team north of the crossroads! Flares ready.', 2),
              ]),
            ],
          },
          ...when(has('hvt'), [
            {
              note: 'hvt run',
              when: timeInPhase(20),
              do: [
                spawnConvoy('hvt_escape', ['suv'], 'hvt'),
                say(
                  'NAV',
                  'The militia commander’s car is running for the east road! Stop it if you can.',
                  2,
                ),
              ],
            },
            {
              note: 'hvt resolved',
              when: anyOf(vehiclesDestroyed('hvt'), flag('hvtEscaped')),
              timeout: 120,
              do: [resolveHvt()],
            },
          ]),
          ...when(has('downedPilot'), [
            {
              note: 'pilot down',
              when: timeInPhase(28),
              do: [
                downPilot(PILOT_DOWN),
                spawnWave('crossroads:2', 6),
                say(
                  'NAV',
                  'Hammer 1-1 took triple-A, the pilot ejected! He is down east of the crossroads. Keep them off him until the rescue bird gets in.',
                  2,
                ),
              ],
            },
          ]),
          ...when(has('jam'), [
            {
              note: 'jam',
              when: timeInPhase(35),
              do: [
                jamGun(CONFIG.twists.jamSeconds),
                say(
                  'FCO',
                  'One-oh-five is jammed! Thirty seconds to clear it. Forty and two-five until then.',
                  2,
                ),
              ],
            },
          ]),
          {
            note: 'second APC',
            when: timeInPhase(45),
            do: [
              spawnConvoy('east_convoy', ['apc'], 'apc2'),
              spawnWave('crossroads:0', 7),
              spawnWave('crossroads:4', 6),
              say('NAV', 'Second APC on the east road. That one is close to Ridgeback.'),
            ],
          },
          {
            note: 'convoy destroyed',
            when: allOf(
              vehiclesDestroyed('convoy'),
              vehiclesDestroyed('apc2'),
              zoneEnemiesBelow('crossroads', 4),
              ...when(has('downedPilot'), [flag('pilotDone')]),
            ),
            timeout: 200,
            onTimeout: [routZone('crossroads')],
            do: [
              setOrbitFocus(null),
              setObjective('Cover Ridgeback to LZ Quarry'),
              say('FCO', 'The road is burning. Ridgeback, go for the LZ.'),
              moveTeam('route_crossroads_lz'),
              spawnWave('crossroads:1', 6),
              zoneWaves('lz', PATROL),
            ],
          },
          {
            note: 'at the LZ',
            when: teamReached('route_crossroads_lz'),
            timeout: walkTimeout('route_crossroads_lz'),
            do: [nextPhase()],
          },
        ],
      },

      {
        id: 'extraction',
        objective:
          roll.extraction === 'quarryOverrun'
            ? 'Hold the quarry'
            : 'Hold the LZ until Kestrel 6 arrives',
        teamStart: [560, 300],
        onEnter: [
          teamHold(),
          setOrbitFocus('lz'),
          ...(roll.extraction === 'kestrelAbort'
            ? [say('NAV', 'Kestrel 6 is two minutes out.'), startTimer('kestrel', 120, 'KESTREL 6')]
            : [
                say('NAV', 'Kestrel 6 is three minutes out.'),
                startTimer('kestrel', 180, 'KESTREL 6'),
              ]),
          spawnWave('lz_ne', 8),
          activateAA('aa_lz'), // M8+ Phase E
          spawnWave('lz_w', 2, 'manpads'),
          zoneWaves('lz', 18),
          ...when(roll.extraction === 'quarryOverrun', [
            // M8+ Phase F twist: the militia got to the quarry first.
            spawnWave('lz_w', 10),
            spawnWave('lz_se', 10),
            spawnConvoy('lz_technical', ['technical', 'technical'], 'lz_tech0'),
            say('RIDGEBACK', 'Lantern, the quarry is crawling with them! There are too many!', 2),
          ]),
        ],
        steps:
          roll.extraction === 'quarryOverrun'
            ? [
                {
                  note: 'overrun',
                  when: timeInPhase(30),
                  do: [
                    startTimer('kestrel', 0, 'KESTREL 6'),
                    say(
                      'NAV',
                      'LZ Quarry is overrun. Kestrel 6 is diverting to the sawmill clearing in Black Pine Forest. Ridgeback, go north-east!',
                      2,
                    ),
                    spawnConvoy('logging_convoy', ['truck', 'technical'], 'forest_conv'),
                    say(
                      'FCO',
                      'They have trucks racing you to the sawmill on the logging road.',
                      2,
                    ),
                    nextPhase(),
                  ],
                },
              ]
            : [
                {
                  note: 'west approach',
                  when: timerBelow('kestrel', 130),
                  do: [
                    spawnWave('lz_w', 9),
                    spawnConvoy('lz_technical', ['technical'], 'lz_tech1'),
                    say('NAV', 'Technical on the quarry track, and foot mobiles from the west.'),
                  ],
                },
                {
                  note: 'final minute',
                  when: timerBelow('kestrel', 60),
                  do: [
                    zoneWaves('lz', 9),
                    spawnWave('lz_se', 10),
                    spawnConvoy('lz_technical', ['technical'], 'lz_tech2'),
                    say('FCO', 'They are massing for a push. Keep them off that LZ.'),
                  ],
                },
                ...when(roll.extraction === 'holdTheLine', [
                  {
                    note: 'kestrel delayed',
                    when: timerBelow('kestrel', 45),
                    do: [
                      startTimer('kestrel', 135, 'KESTREL 6'),
                      say(
                        'KESTREL',
                        'Lantern, Kestrel 6. We are held up, ninety seconds more. Hold that LZ.',
                        2,
                      ),
                      spawnConvoy('lz_technical', ['apc'], 'lz_apc'),
                      spawnWave('lz_ne', 10),
                      spawnWave('lz_se', 3, 'manpads'),
                      zoneWaves('lz', 8),
                    ],
                  },
                ]),
                {
                  note: 'Kestrel inbound',
                  when: timerBelow('kestrel', 30),
                  do: [
                    spawnHelicopter(HELICOPTER_FROM, HELICOPTER_PAD),
                    say('KESTREL', 'Lantern, Kestrel 6, inbound to the quarry. Thirty seconds.'),
                    spawnWave('lz_ne', 9),
                    spawnWave('lz_w', 9),
                  ],
                },
                ...(roll.extraction === 'kestrelAbort'
                  ? [
                      {
                        // M8+ Phase F twist: hidden AA in the forest opens up on Kestrel 6.
                        note: 'kestrel abort',
                        when: timeInStep(10),
                        do: [
                          activateAA('aa_forest'),
                          abortHelicopter(),
                          startTimer('kestrel', 0, 'KESTREL 6'),
                          say(
                            'KESTREL',
                            'Taking fire from the treeline to the north! Breaking off!',
                            2,
                          ),
                          say(
                            'NAV',
                            'Triple-A in Black Pine Forest. New LZ: the sawmill clearing. Ridgeback, move north-east.',
                            2,
                          ),
                          nextPhase(),
                        ],
                      },
                    ]
                  : extractionEnding()),
              ],
      },
      ...when(sawmillEnding, [forestPhase(roll)]),
    ],
  };
}

/** The roll the headless tests use by default: the plain extraction, no side events. */
export const DEFAULT_ROLL: TwistRoll = { seed: 0, extraction: 'holdTheLine', side: [] };

/** The mission with the default roll (tests, and the phase ids for `?phase=`). */
export const MISSION: MissionDef = buildMission(DEFAULT_ROLL);

/** Where the helicopter lands, boards and leaves: the end of every extraction (quarry or sawmill). */
function extractionEnding(): Step[] {
  return [
    {
      note: 'landed',
      when: allOf(timerDone('kestrel'), helicopter('landed')),
      timeout: 60,
      do: [zoneWaves(null), say('KESTREL', 'Kestrel 6 on the ground. Get in!'), boardHelicopter()],
    },
    {
      note: 'boarding',
      when: helicopter('boarded'),
      timeout: 60,
      do: [say('RIDGEBACK', 'All aboard. Go, go!')],
    },
    {
      note: 'lift-off',
      when: helicopter('departed'),
      timeout: 30,
      do: [say('FCO', 'Ridgeback is wheels up. Nice work, Lantern. Heading home.')],
    },
    { note: 'complete', when: timeInStep(5), do: [completeMission()] },
  ];
}

/**
 * The forest phase (M8+ Phase F, after "Kestrel abort" or "LZ overrun"): Ridgeback pushes up the
 * forest track through Black Pine to the sawmill clearing, contacts under the trees, and holds
 * LZ SAWMILL until Kestrel 6 comes back. After an abort the forest AA must die first.
 */
function forestPhase(roll: TwistRoll): Phase {
  const abort = roll.extraction === 'kestrelAbort';
  return {
    id: 'forest',
    objective: 'Get Ridgeback to LZ SAWMILL',
    teamStart: [560, 300],
    onEnter: [
      setOrbitFocus(null),
      moveTeam('route_lz_sawmill'),
      zoneWaves('forest', 22),
      spawnWave('forest_south', 8),
      say('NAV', 'Movement along the forest track ahead of Ridgeback.'),
    ],
    steps: [
      {
        note: 'under the trees',
        when: timeInPhase(30),
        do: [
          spawnWave('forest_east', 8),
          spawnWave('forest:6', 6),
          say(
            'NAV',
            'Contacts moving through the trees to the east. Hard to see under that canopy.',
          ),
          ...(abort
            ? [
                setObjective('Kill the triple-A in the forest'),
                say(
                  'FCO',
                  'The gun that hit Kestrel is still in there, east of the sawmill. Kill it so they can come back.',
                  2,
                ),
              ]
            : []),
        ],
      },
      {
        note: 'at the sawmill',
        when: allOf(teamReached('route_lz_sawmill'), ...(abort ? [flag('aaDown:aa_forest')] : [])),
        timeout: walkTimeout('route_lz_sawmill') + 60,
        onTimeout: [routZone('forest')],
        do: [
          teamHold(),
          setObjective('Hold LZ SAWMILL until Kestrel 6 lands'),
          startTimer('kestrel', 75, 'KESTREL 6'),
          spawnWave('forest_north', 10),
          spawnWave('forest_west', 8),
          say('NAV', 'Kestrel 6 is coming back for the sawmill. Seventy-five seconds.'),
        ],
      },
      {
        note: 'last stand',
        when: timerBelow('kestrel', 45),
        do: [
          spawnWave('forest_east', 8),
          spawnWave('forest_south', 2, 'manpads'),
          say('FCO', 'They are throwing everything at the clearing. Hold them.', 2),
        ],
      },
      {
        note: 'Kestrel inbound',
        when: timerBelow('kestrel', 30),
        do: [
          spawnHelicopter(SAWMILL_FROM, SAWMILL_PAD),
          say('KESTREL', 'Lantern, Kestrel 6, inbound to the sawmill. Keep their heads down.'),
        ],
      },
      ...extractionEnding(),
    ],
  };
}
