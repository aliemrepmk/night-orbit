import { describe, expect, it } from 'vitest';
import { CHEAT_KEYS, TIME_SCALES, nextTimeScale, phaseFromUrl } from './cheats';

describe('dev cheats (PLAN.md §7.18)', () => {
  it('maps G, N, K and [ ] to god mode, skip, kill all and time scale', () => {
    expect(CHEAT_KEYS.KeyG).toBe('god');
    expect(CHEAT_KEYS.KeyN).toBe('skipPhase');
    expect(CHEAT_KEYS.KeyK).toBe('killAll');
    expect(CHEAT_KEYS.BracketLeft).toBe('slower');
    expect(CHEAT_KEYS.BracketRight).toBe('faster');
  });

  it('time scale steps ×0.25 ↔ ×1 ↔ ×4 and stops at the ends', () => {
    expect(TIME_SCALES).toEqual([0.25, 1, 4]);
    expect(nextTimeScale(1, 1)).toBe(4);
    expect(nextTimeScale(4, 1)).toBe(4);
    expect(nextTimeScale(1, -1)).toBe(0.25);
    expect(nextTimeScale(0.25, -1)).toBe(0.25);
    expect(nextTimeScale(7, -1)).toBe(0.25); // unknown → from ×1
  });

  it('?phase= accepts only real phase ids', () => {
    const ids = ['calibration', 'fields', 'village'];
    expect(phaseFromUrl('?phase=village', ids)).toBe('village');
    expect(phaseFromUrl('?debug=1&phase=fields', ids)).toBe('fields');
    expect(phaseFromUrl('?phase=moon', ids)).toBeUndefined();
    expect(phaseFromUrl('', ids)).toBeUndefined();
  });
});
