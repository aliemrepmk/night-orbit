import { describe, expect, it } from 'vitest';
import { decide, type BrainInput } from './EnemyBrain';

/** A rifleman 150 m from the team, in the open, in sight, nothing special going on. */
const base: BrainInput = {
  fleeLeft: 0,
  shaken: false,
  roll: 0.5,
  fleeChance: 0.3,
  hasTarget: true,
  targetDist: 150,
  range: 200,
  standoff: 0.8,
  lineOfSight: true,
  wasFiring: false,
  coverReserved: false,
  inCover: false,
  coverAvailable: false,
};
const with_ = (o: Partial<BrainInput>): BrainInput => ({ ...base, ...o });

describe('decide (EnemyBrain)', () => {
  it('fires from the open when the target is inside its standoff distance and in sight', () => {
    expect(decide(base)).toBe('fire');
  });

  it('advances when the target is too far or out of sight', () => {
    expect(decide(with_({ targetDist: 190 }))).toBe('advance'); // beyond 0.8 × 200
    expect(decide(with_({ lineOfSight: false }))).toBe('advance');
  });

  it('keeps firing while the target is still in range (no stop-start at the standoff edge)', () => {
    expect(decide(with_({ targetDist: 190, wasFiring: true }))).toBe('fire');
    expect(decide(with_({ targetDist: 210, wasFiring: true }))).toBe('advance');
  });

  it('takes cover before firing when cover is available', () => {
    expect(decide(with_({ coverAvailable: true }))).toBe('takeCover');
  });

  it('keeps going to its cover, then fires from it, and leaves it when it cannot see', () => {
    expect(decide(with_({ coverReserved: true }))).toBe('takeCover');
    expect(decide(with_({ coverReserved: true, inCover: true }))).toBe('fire');
    // In cover the standoff doesn't matter: anything in range is fair game.
    expect(decide(with_({ coverReserved: true, inCover: true, targetDist: 195 }))).toBe('fire');
    expect(decide(with_({ coverReserved: true, inCover: true, lineOfSight: false }))).toBe(
      'advance',
    );
    expect(decide(with_({ coverReserved: true, inCover: true, targetDist: 250 }))).toBe('advance');
  });

  it('breaks and flees when shaken and the morale roll fails (30 %)', () => {
    expect(decide(with_({ shaken: true, roll: 0.29 }))).toBe('flee');
    expect(decide(with_({ shaken: true, roll: 0.31 }))).toBe('fire');
    expect(decide(with_({ shaken: false, roll: 0.01 }))).toBe('fire'); // no reason to run
  });

  it('keeps fleeing while panic lasts, even from cover', () => {
    expect(decide(with_({ fleeLeft: 2, coverReserved: true, inCover: true }))).toBe('flee');
  });

  it('holds with no target', () => {
    expect(decide(with_({ hasTarget: false }))).toBe('hold');
  });
});
