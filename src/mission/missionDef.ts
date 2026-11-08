import { CONFIG } from '../config';
import { MAP } from '../world/MapData';
import type { MissionDef } from './missionTypes';
import {
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
export const MISSION: MissionDef = {
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
      steps: [
        {
          note: 'slew',
          when: timeInPhase(4),
          do: [
            setObjective('Slew the sensor (mouse)'),
            say(
              'FCO',
              'Move the sensor with the mouse. Find the blinking strobes: that is Ridgeback.',
            ),
          ],
        },
        {
          note: '25mm',
          when: flag('slewed'),
          timeout: 25,
          do: [
            setObjective('Select the 25 mm (1)'),
            say('FCO', 'Good eyes. Select the two-five with 1. Hold the trigger for a burst.'),
          ],
        },
        {
          note: '40mm',
          when: flag('weapon25'),
          timeout: 20,
          do: [
            setObjective('Select the 40 mm (2)'),
            say('FCO', 'Now the forty, key 2. Five rounds a clip.'),
          ],
        },
        {
          note: '105mm',
          when: flag('weapon40'),
          timeout: 20,
          do: [
            setObjective('Select the 105 mm (3)'),
            say('FCO', 'And the one-oh-five, key 3. Big hit, long reload. Never near Ridgeback.'),
          ],
        },
        {
          note: 'sensor',
          when: flag('weapon105'),
          timeout: 20,
          do: [
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
          timeout: 20,
          do: [
            say('FCO', 'Checks complete. Ridgeback, Lantern is on station.'),
            say('RIDGEBACK', 'Good to hear you, Lantern. Moving out.'),
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
            spawnWave('fields:8', 7),
            spawnWave('fields:9', 7),
            spawnWave('fields:2', 6),
            say('NAV', 'Contacts coming out of the farmhouse and the barn, more from the north.'),
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
          ],
        },
        {
          note: 'hedgerow flank',
          when: timeInStep(14),
          do: [
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
            spawnWave('village_east', 7),
            say('NAV', 'Enemies moving up beside the clinic. Careful with the big guns there.'),
          ],
        },
        {
          note: 'pinned in the square',
          when: teamReached('route_village_square'),
          timeout: walkTimeout('route_village_square'),
          do: [
            teamHold(),
            setObjective('Hold the square'),
            say('RIDGEBACK', 'Lantern, we are pinned in the square! Fire from the north and east!'),
            spawnWave('village_north', 9),
            spawnWave('village_northeast', 9),
            spawnWave('village:1', 6),
          ],
        },
        {
          note: 'technical',
          when: timeInStep(20),
          do: [
            spawnWave('village_south', 7),
            spawnWave('village:9', 6),
            spawnWave('village:5', 6),
            spawnConvoy('village_technical', ['technical'], 'village_tech'),
            say('NAV', 'Technical coming in on the east road. The forty will stop it.'),
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
        setOrbitFocus('crossroads'),
        say('NAV', 'Multiple vehicles on the north road, heading your way.'),
        spawnConvoy('north_convoy', ['truck', 'truck', 'technical', 'apc'], 'convoy'),
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
          ],
        },
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
          ),
          timeout: 200,
          onTimeout: [routZone('crossroads')],
          do: [
            setOrbitFocus(null),
            setObjective('Cover Ridgeback to LZ Quarry'),
            say('FCO', 'The road is burning. Ridgeback, go for the LZ.'),
            moveTeam('route_crossroads_lz'),
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
      objective: 'Hold the LZ until Kestrel 6 arrives',
      teamStart: [560, 300],
      onEnter: [
        teamHold(),
        setOrbitFocus('lz'),
        say('NAV', 'Kestrel 6 is three minutes out.'),
        startTimer('kestrel', 180, 'KESTREL 6'),
        spawnWave('lz_ne', 8),
        zoneWaves('lz', 18),
      ],
      steps: [
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
        {
          note: 'landed',
          when: allOf(timerDone('kestrel'), helicopter('landed')),
          timeout: 60,
          do: [
            zoneWaves(null),
            say('KESTREL', 'Kestrel 6 on the ground. Get in!'),
            boardHelicopter(),
          ],
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
      ],
    },
  ],
};
