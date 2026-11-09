import type { Vector3 } from 'three';
import type { DamageSource } from '../combat/Damage';
import type { OrdnanceId, StrikeId, WeaponId } from '../gunship/weaponDefs';
import type { Speaker } from '../mission/missionTypes';

/** Why the mission ended in failure (PLAN.md §1 lose conditions). */
export type FailReason =
  | 'friendly_fire'
  | 'team_overrun'
  | 'clinic_hit'
  /** The player's own fire destroyed Kestrel 6. */
  | 'helicopter_friendly_fire'
  /** Enemy fire shot Kestrel 6 down at the LZ. */
  | 'helicopter_lost'
  /** AA and missiles destroyed the gunship (M8+ Phase E). */
  | 'gunship_lost'
  /** The player's fire hit the protected civilian bus (M8+ Phase F). */
  | 'civilian_hit';

/** Everything that can "happen" in the game (PLAN.md §6). Extend as systems are added. */
export type GameEvents = {
  shotFired: { weapon: WeaponId };
  /** `enemiesHit`: enemy soldiers and vehicles the blast hurt (mission accuracy, M8). */
  impact: { pos: Vector3; weapon: OrdnanceId; distanceToAim: number; enemiesHit: number };
  /** An enemy died; `by` is the gunship weapon, or `team` for Ridgeback's return fire. */
  unitKilled: { kind: 'infantry' | 'vehicle'; by: DamageSource; aa?: boolean };
  /** The player's fire killed a Ridgeback member (always followed by missionFailed). */
  friendlyKilledByPlayer: { weapon: OrdnanceId };
  /** An impact landed within the weapon's danger-close distance of a friendly who survived it. */
  dangerClose: { weapon: OrdnanceId; distance: number };
  /** The player called an air strike; it lands after its delay (M5+). `danger`: Ridgeback is
   * inside the strike's danger-close margin (the FCO warns, M7). */
  strikeCalled: { strike: StrikeId; x: number; z: number; danger: boolean };
  missionFailed: { reason: FailReason };
  // ---- Air defense (M8+ Phase E) ----
  /** An AA gun or truck opened fire on the gunship (once per engagement). */
  aaFiring: { id: string; x: number; z: number };
  /** An AA gun was destroyed. */
  aaDestroyed: { id: string };
  /** The gunship took a hit; `hull` is what is left (0–max). */
  hullHit: { damage: number; hull: number; by: 'aa' | 'missile' };
  /** The hull fell below the engine-out mark: one engine is gone. */
  engineLost: Record<string, never>;
  /** A MANPADS team launched a missile at the gunship from (x, z). */
  missileLaunch: { x: number; z: number };
  /** Flares decoyed a missile. */
  missileDefeated: Record<string, never>;
  /** Flares dropped: `decoyed` a missile, too `late`, `wasted` (nothing inbound), or `empty`. */
  flares: { result: 'decoyed' | 'late' | 'wasted' | 'empty'; left: number };
  /** AA near the target: a strike jet was hit, or the pilot aborted the strike. */
  jetHit: { strike: StrikeId };
  strikeAborted: { strike: StrikeId };
  // ---- Mission twists (M8+ Phase F) ----
  /** An enemy mortar round landed at (x, z). */
  enemyShell: { x: number; z: number };
  /** The 105 mm is jammed for `seconds`. */
  gunJammed: { seconds: number };
  /** Ground fog rolls in for `seconds`. */
  fog: { seconds: number };
  // ---- Audio cues (M9) ----
  /** The player picked another gun. */
  weaponSelected: { weapon: WeaponId };
  /** A gun finished reloading, cooling down or clearing a jam: it can fire again. */
  weaponReady: { weapon: WeaponId };
  /** A radio line went on air (`on`) or ended / was cut off. */
  radioKey: { on: boolean; speaker: Speaker };
};
