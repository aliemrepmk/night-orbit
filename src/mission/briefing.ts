import { CONFIG } from '../config';
import { STRIKES } from '../gunship/airSupportDefs';
import { WEAPONS } from '../gunship/weaponDefs';
import { briefingMap, gridRef } from '../ui/briefingMap';
import type { MapData, ZoneId } from '../world/mapTypes';

/** One paragraph of the order: a tab on the briefing screen (M10+). */
export interface BriefingParagraph {
  /** The tab's key cap: `1`–`5`, or `ROE`. */
  readonly key: string;
  readonly title: string;
  /** The rules of engagement (shown in the caution color). */
  readonly roe?: boolean;
  /** Label → text rows. */
  readonly items: readonly (readonly [label: string, text: string])[];
}

export interface Briefing {
  readonly title: string;
  readonly order: string;
  readonly paragraphs: readonly BriefingParagraph[];
}

/**
 * The briefing (M8, rewritten for M10+ as a five-paragraph order: SITUATION, MISSION,
 * EXECUTION, SUPPORT, COMMAND & SIGNAL, plus the ROE). Original setting: PLAN.md §2. Grid
 * references come from the map sketch's grid and the numbers from the configs, so the text
 * always matches the map and the game. It never names the extraction twists (the sawmill is
 * only an "alternate LZ").
 */
export function buildBriefing(map: MapData): Briefing {
  const grid = briefingMap(map).grid;
  const at = (id: ZoneId) => gridRef(grid, map.zones[id].center[0], map.zones[id].center[1]);
  const clinic = map.buildings.find((b) => b.protected && b.kind === 'clinic');
  const clinicRef = clinic ? gridRef(grid, clinic.pos[0], clinic.pos[1]) : at('village');
  const w = WEAPONS;
  const run = STRIKES.gunrun;
  const bomb = STRIKES.bomb;
  return {
    title: 'OPERATION NIGHT ORBIT',
    order: 'OPORD 01',
    paragraphs: [
      {
        key: '1',
        title: '1. SITUATION',
        items: [
          [
            'ENEMY',
            'Militia infantry moving up from the villages, with technicals, trucks and APCs on the north and east roads. Triple-A at the crossroads and the quarry. Missile teams reported.',
          ],
          [
            'FRIENDLY',
            `Recon team RIDGEBACK (four operators) has lost its observation post at ${at('op')}. KESTREL 6 will lift them out. HAMMER 1-1 strike jets on call.`,
          ],
          [
            'CIVIL',
            `A field clinic in the village (${clinicRef}) is protected. Civilian traffic on the main road.`,
          ],
          [
            'TERRAIN',
            `Open fields west of the stream, one bridge, tight village streets, Black Pine Forest to the north-east (${at('forest')}). Night; ground fog possible.`,
          ],
        ],
      },
      {
        key: '2',
        title: '2. MISSION',
        items: [
          [
            'MISSION',
            `LANTERN 2-1 gives overwatch and fire support to RIDGEBACK from the OP (${at('op')}) to LZ QUARRY (${at('lz')}), and holds the LZ until KESTREL 6 has them aboard.`,
          ],
        ],
      },
      {
        key: '3',
        title: '3. EXECUTION',
        items: [
          [
            'INTENT',
            'Clear ahead of the team, break up attacks before they reach them, never risk a friendly.',
          ],
          [
            'PL 1 FIELDS',
            `${at('fields')}. Cover the crossing of the fields to the stream bridge.`,
          ],
          [
            'PL 2 VILLAGE',
            `${at('village')}. Clear the west streets and the square. The clinic stays untouched.`,
          ],
          ['PL 3 X-ROADS', `${at('crossroads')}. Stop the convoy. The 105 mm for the APCs.`],
          [
            'LZ QUARRY',
            `${at('lz')}. Hold until Kestrel 6 lands and the team is aboard. Alternate LZ: SAWMILL (${at('forest')}).`,
          ],
        ],
      },
      {
        key: '4',
        title: '4. SUPPORT',
        items: [
          [
            'GUNS',
            `25 mm for sustained light fire, 40 mm in ${w['40'].capacity}-round clips, 105 mm one round at a time with a ${w['105'].blastRadius} m blast.`,
          ],
          [
            'AIR',
            `HAMMER 1-1: gun run (${run.cooldown} s to rearm) and bomb (${bomb.cooldown} s, danger close ${bomb.dangerClose} m). Triple-A near the target can abort a strike.`,
          ],
          [
            'DEFENSIVE',
            `Flares ×${CONFIG.airDefense.flares} against missiles. Triple-A damages the hull: kill it early.`,
          ],
        ],
      },
      {
        key: '5',
        title: '5. COMMAND & SIGNAL',
        items: [
          ['LANTERN 2-1', 'You: sensor operator and gunner.'],
          ['FCO · NAV', 'Your crew, on the intercom.'],
          ['RIDGEBACK', 'The ground team.'],
          ['KESTREL 6', 'Extraction helicopter.'],
          ['HAMMER 1-1', 'Strike jets.'],
          ['MARKING', 'Friendlies wear IR strobes: they blink in every sensor.'],
        ],
      },
      {
        key: 'ROE',
        title: 'RULES OF ENGAGEMENT',
        roe: true,
        items: [
          ['! 1', 'Strobes are friendly. Never fire on them.'],
          ['! 2', `The clinic (${clinicRef}) is protected. Firing on it aborts the mission.`],
          [
            '! 3',
            `Danger close: 40 mm ${w['40'].dangerClose} m · 105 mm ${w['105'].dangerClose} m · bomb ${bomb.dangerClose} m. The FCO will call it.`,
          ],
          ['! 4', 'Civilian vehicles are protected.'],
        ],
      },
    ],
  };
}
