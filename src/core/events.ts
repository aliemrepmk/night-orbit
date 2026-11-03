import type { Vector3 } from 'three';
import type { WeaponId } from '../gunship/weaponDefs';

/** Everything that can "happen" in the game (PLAN.md §6). Extend as systems are added. */
export type GameEvents = {
  shotFired: { weapon: WeaponId };
  impact: { pos: Vector3; weapon: WeaponId; distanceToAim: number };
  unitKilled: { kind: 'infantry' | 'vehicle'; by: WeaponId };
};
