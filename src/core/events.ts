import type { Vector3 } from 'three';
import type { DamageSource } from '../combat/Damage';
import type { OrdnanceId, StrikeId, WeaponId } from '../gunship/weaponDefs';

/** Why the mission ended in failure (PLAN.md §1 lose conditions). */
export type FailReason =
  | 'friendly_fire'
  | 'team_overrun'
  | 'clinic_hit'
  /** The player's own fire destroyed Kestrel 6. */
  | 'helicopter_friendly_fire'
  /** Enemy fire shot Kestrel 6 down at the LZ. */
  | 'helicopter_lost';

/** Everything that can "happen" in the game (PLAN.md §6). Extend as systems are added. */
export type GameEvents = {
  shotFired: { weapon: WeaponId };
  /** `enemiesHit`: enemy soldiers and vehicles the blast hurt (mission accuracy, M8). */
  impact: { pos: Vector3; weapon: OrdnanceId; distanceToAim: number; enemiesHit: number };
  /** An enemy died; `by` is the gunship weapon, or `team` for Ridgeback's return fire. */
  unitKilled: { kind: 'infantry' | 'vehicle'; by: DamageSource };
  /** The player's fire killed a Ridgeback member (always followed by missionFailed). */
  friendlyKilledByPlayer: { weapon: OrdnanceId };
  /** An impact landed within the weapon's danger-close distance of a friendly who survived it. */
  dangerClose: { weapon: OrdnanceId; distance: number };
  /** The player called an air strike; it lands after its delay (M5+). `danger`: Ridgeback is
   * inside the strike's danger-close margin (the FCO warns, M7). */
  strikeCalled: { strike: StrikeId; x: number; z: number; danger: boolean };
  missionFailed: { reason: FailReason };
};
