/**
 * What an enemy soldier does until its next think (PLAN.md §7.11):
 * - `flee`: run (from a big blast, or back home after its nerve broke)
 * - `takeCover`: move to its reserved cover point
 * - `fire`: stand (or crouch in cover) and shoot at its target
 * - `advance`: move toward the target (along its approach path first, if it has one)
 * - `hold`: nothing to do (no target)
 */
export type BrainAction = 'flee' | 'takeCover' | 'fire' | 'advance' | 'hold';

/** Everything the decision needs, gathered by `UnitManager` (keeps this pure and testable). */
export interface BrainInput {
  /** Seconds of panic or rout still to run. */
  readonly fleeLeft: number;
  /** Something shook it since its last morale check (nearby losses, or it was wounded). */
  readonly shaken: boolean;
  /** Random number in [0, 1) for the morale check. */
  readonly roll: number;
  /** PLAN.md §7.11: a shaken soldier breaks with this probability (0.3). */
  readonly fleeChance: number;
  readonly hasTarget: boolean;
  readonly targetDist: number;
  readonly range: number;
  /** Fraction of its range at which it stops in the open to fire. */
  readonly standoff: number;
  readonly lineOfSight: boolean;
  /** It was firing last think (keeps firing until the target leaves range). */
  readonly wasFiring: boolean;
  /** It holds a cover point (on the way there, or already crouched in it). */
  readonly coverReserved: boolean;
  readonly inCover: boolean;
  /** A suitable free cover point exists near it (checked only when it holds none). */
  readonly coverAvailable: boolean;
}

/**
 * The decision, in priority order:
 * 1. keep fleeing while panic/rout lasts; a shaken soldier breaks with `fleeChance`
 * 2. on the way to cover: keep going; in cover: fire if it can see the target, else move on
 * 3. in the open: take cover if there is some near
 * 4. fire if the target is close enough (and in sight)
 * 5. otherwise advance
 */
export function decide(s: BrainInput): BrainAction {
  if (s.fleeLeft > 0) return 'flee';
  if (s.shaken && s.roll < s.fleeChance) return 'flee';
  if (!s.hasTarget) return 'hold';
  const inRange = s.targetDist <= s.range;
  if (s.coverReserved && !s.inCover) return 'takeCover';
  if (s.inCover) return inRange && s.lineOfSight ? 'fire' : 'advance';
  if (s.coverAvailable) return 'takeCover';
  const engage = s.targetDist <= s.range * s.standoff || (s.wasFiring && inRange);
  return engage && s.lineOfSight ? 'fire' : 'advance';
}
