import type { Vector3 } from 'three';
import type { DamageSource } from '../combat/Damage';
import type { OrdnanceId, StrikeId, WeaponId } from '../gunship/weaponDefs';

/** Why the mission ended in failure (PLAN.md §1 lose conditions; the clinic comes in M6). */
export type FailReason = 'friendly_fire' | 'team_overrun';

/** Everything that can "happen" in the game (PLAN.md §6). Extend as systems are added. */
export type GameEvents = {
  shotFired: { weapon: WeaponId };
  impact: { pos: Vector3; weapon: OrdnanceId; distanceToAim: number };
  /** An enemy died; `by` is the gunship weapon, or `team` for Ridgeback's return fire. */
  unitKilled: { kind: 'infantry' | 'vehicle'; by: DamageSource };
  /** The player's fire killed a Ridgeback member (always followed by missionFailed). */
  friendlyKilledByPlayer: { weapon: OrdnanceId };
  /** An impact landed within the weapon's danger-close distance of a friendly who survived it. */
  dangerClose: { weapon: OrdnanceId; distance: number };
  /** The player called an air strike; it lands after its delay (M5+). */
  strikeCalled: { strike: StrikeId; x: number; z: number };
  missionFailed: { reason: FailReason };
};
