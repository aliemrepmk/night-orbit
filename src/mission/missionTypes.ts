import type { VehicleType } from '../units/vehicleDefs';
import type { Vec2, ZoneId } from '../world/mapTypes';

/**
 * The mission is data (PLAN.md §7.14): phases of steps, each step `(condition) → actions`.
 * Conditions and actions are plain tagged objects (built with the helpers in `script.ts`), so a
 * mission can be checked against the map in a test and printed in the debug overlay.
 */

/** Who speaks on the radio (PLAN.md §2): the fire-control officer, the navigator, Ridgeback, the helo. */
export type Speaker = 'FCO' | 'NAV' | 'RIDGEBACK' | 'KESTREL';

/** Radio priorities (PLAN.md §7.15): story > warnings > reactive chatter. */
export type Priority = 1 | 2 | 3;

export type Condition =
  /** Seconds since the phase started. */
  | { readonly kind: 'timeInPhase'; readonly seconds: number }
  /** Seconds since the previous step fired (or the phase started, for the first step). */
  | { readonly kind: 'timeInStep'; readonly seconds: number }
  /** Ridgeback has walked route `route` to its end (`moveTeam(route)` first). */
  | { readonly kind: 'teamReached'; readonly route: string }
  /** Fewer than `count` living enemies inside zone `zone` (soldiers still queued count too). */
  | { readonly kind: 'zoneEnemiesBelow'; readonly zone: ZoneId; readonly count: number }
  /** Every vehicle spawned with this tag is a wreck. */
  | { readonly kind: 'vehiclesDestroyed'; readonly tag: string }
  /** Timer `id` (from `startTimer`) has run out. */
  | { readonly kind: 'timerDone'; readonly id: string }
  /** Timer `id` has at most `seconds` left. */
  | { readonly kind: 'timerBelow'; readonly id: string; readonly seconds: number }
  /** The extraction helicopter is in `state` (or past it). */
  | { readonly kind: 'helicopter'; readonly state: 'landed' | 'boarded' | 'departed' }
  /** A flag set by an action or by the game (player prompts: `slewed`, `weapon25`, …). */
  | { readonly kind: 'flag'; readonly name: string }
  | { readonly kind: 'allOf'; readonly all: readonly Condition[] }
  | { readonly kind: 'anyOf'; readonly any: readonly Condition[] };

export type Action =
  | {
      readonly kind: 'say';
      readonly speaker: Speaker;
      readonly text: string;
      readonly priority: Priority;
    }
  | { readonly kind: 'setObjective'; readonly text: string }
  /** Glide the orbit over a zone (null: follow Ridgeback again). */
  | { readonly kind: 'setOrbitFocus'; readonly zone: ZoneId | null }
  /** A group of `count` at a named site: an enemy path id, or `zone:index` (a spawn point). */
  | { readonly kind: 'spawnWave'; readonly site: string; readonly count: number }
  /** Vehicles in a column along a map vehicle path, lead first, each carrying `tag`. */
  | {
      readonly kind: 'spawnConvoy';
      readonly path: string;
      readonly vehicles: readonly VehicleType[];
      readonly tag: string;
    }
  /** Background waves from a zone's sites every `interval` s (null zone: stop them). */
  | { readonly kind: 'zoneWaves'; readonly zone: ZoneId | null; readonly interval: number }
  | { readonly kind: 'moveTeam'; readonly route: string }
  | { readonly kind: 'teamHold' }
  /** Enemies within the zone give up and run (the safety valve, also usable on purpose). */
  | { readonly kind: 'routZone'; readonly zone: ZoneId }
  /** A HUD countdown labeled `label` (e.g. KESTREL 6). */
  | {
      readonly kind: 'startTimer';
      readonly id: string;
      readonly seconds: number;
      readonly label: string;
    }
  /** Kestrel 6 flies in from `from` and lands at `pad` (the team then walks over and boards). */
  | { readonly kind: 'spawnHelicopter'; readonly from: Vec2; readonly pad: Vec2 }
  /** Ridgeback walks to the landed helicopter and climbs in. */
  | { readonly kind: 'boardHelicopter' }
  /** Draw the protected clinic's marker on screen for `seconds`. */
  | { readonly kind: 'markClinic'; readonly seconds: number }
  | { readonly kind: 'setFlag'; readonly name: string }
  | { readonly kind: 'nextPhase' }
  | { readonly kind: 'completeMission' };

export interface Step {
  readonly when: Condition;
  readonly do: readonly Action[];
  /**
   * Safety valve (PLAN.md §7.14): after this many seconds waiting, the step fires anyway, and
   * first runs `onTimeout` (usually routing a zone's last enemies), so nothing can soft-lock.
   */
  readonly timeout?: number;
  readonly onTimeout?: readonly Action[];
  /** Shown in the debug line (F1) and in test failures. */
  readonly note?: string;
}

export interface Phase {
  readonly id: string;
  readonly objective: string;
  /** Where Ridgeback stands when the phase is started directly (`?phase=`, cheat `N`). */
  readonly teamStart: Vec2;
  readonly onEnter: readonly Action[];
  /** Run in order: step k is only checked once step k−1 has fired. */
  readonly steps: readonly Step[];
}

export interface MissionDef {
  readonly id: string;
  readonly phases: readonly Phase[];
}
