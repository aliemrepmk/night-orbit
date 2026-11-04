import type { Vector3 } from 'three';
import type { DamageSource } from '../combat/Damage';
import type { WeaponId } from '../gunship/weaponDefs';

/** Why the mission ended in failure (PLAN.md §1 lose conditions; the clinic comes in M6). */
export type FailReason = 'friendly_fire' | 'team_overrun';

/** Everything that can "happen" in the game (PLAN.md §6). Extend as systems are added. */
export type GameEvents = {
  shotFired: { weapon: WeaponId };
  impact: { pos: Vector3; weapon: WeaponId; distanceToAim: number };
  /** An enemy died; `by` is the gunship weapon, or `team` for Ridgeback's return fire. */
  unitKilled: { kind: 'infantry' | 'vehicle'; by: DamageSource };
  /** The player's fire killed a Ridgeback member (always followed by missionFailed). */
  friendlyKilledByPlayer: { weapon: WeaponId };
  /** An impact landed within the weapon's danger-close distance of a friendly who survived it. */
  dangerClose: { weapon: WeaponId; distance: number };
  missionFailed: { reason: FailReason };
};
