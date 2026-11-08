import type { VehicleType } from '../units/vehicleDefs';
import type { Vec2, ZoneId } from '../world/mapTypes';
import type { Action, Condition, Priority, Speaker } from './missionTypes';

/**
 * The mission-script vocabulary (PLAN.md §7.14): small builders so `missionDef.ts` reads like
 * the beat sheet in §8. Each returns plain data that `Mission` interprets.
 */

// --- Conditions ---
export const timeInPhase = (seconds: number): Condition => ({ kind: 'timeInPhase', seconds });
export const timeInStep = (seconds: number): Condition => ({ kind: 'timeInStep', seconds });
export const teamReached = (route: string): Condition => ({ kind: 'teamReached', route });
export const zoneEnemiesBelow = (zone: ZoneId, count: number): Condition => ({
  kind: 'zoneEnemiesBelow',
  zone,
  count,
});
export const vehiclesDestroyed = (tag: string): Condition => ({ kind: 'vehiclesDestroyed', tag });
export const timerDone = (id: string): Condition => ({ kind: 'timerDone', id });
export const timerBelow = (id: string, seconds: number): Condition => ({
  kind: 'timerBelow',
  id,
  seconds,
});
export const helicopter = (state: 'landed' | 'boarded' | 'departed'): Condition => ({
  kind: 'helicopter',
  state,
});
export const flag = (name: string): Condition => ({ kind: 'flag', name });
export const allOf = (...all: Condition[]): Condition => ({ kind: 'allOf', all });
export const anyOf = (...any: Condition[]): Condition => ({ kind: 'anyOf', any });

// --- Actions ---
/** A story line (priority 3) unless a priority is given. */
export const say = (speaker: Speaker, text: string, priority: Priority = 3): Action => ({
  kind: 'say',
  speaker,
  text,
  priority,
});
export const setObjective = (text: string): Action => ({ kind: 'setObjective', text });
export const setOrbitFocus = (zone: ZoneId | null): Action => ({ kind: 'setOrbitFocus', zone });
export const spawnWave = (site: string, count: number): Action => ({
  kind: 'spawnWave',
  site,
  count,
});
export const spawnConvoy = (path: string, vehicles: VehicleType[], tag: string): Action => ({
  kind: 'spawnConvoy',
  path,
  vehicles,
  tag,
});
export const zoneWaves = (zone: ZoneId | null, interval = 0): Action => ({
  kind: 'zoneWaves',
  zone,
  interval,
});
export const moveTeam = (route: string): Action => ({ kind: 'moveTeam', route });
export const teamHold = (): Action => ({ kind: 'teamHold' });
export const routZone = (zone: ZoneId): Action => ({ kind: 'routZone', zone });
export const startTimer = (id: string, seconds: number, label: string): Action => ({
  kind: 'startTimer',
  id,
  seconds,
  label,
});
export const spawnHelicopter = (from: Vec2, pad: Vec2): Action => ({
  kind: 'spawnHelicopter',
  from,
  pad,
});
export const boardHelicopter = (): Action => ({ kind: 'boardHelicopter' });
export const markClinic = (seconds: number): Action => ({ kind: 'markClinic', seconds });
export const setFlag = (name: string): Action => ({ kind: 'setFlag', name });
export const nextPhase = (): Action => ({ kind: 'nextPhase' });
export const completeMission = (): Action => ({ kind: 'completeMission' });
