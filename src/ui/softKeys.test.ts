import { describe, expect, it } from 'vitest';
import { capForCode, softKeyFor, stepFocus, type SoftKey } from './softKeys';

const KEYS: SoftKey[] = [
  { cap: '1', label: 'RESUME', action: 'resume', tone: 'go' },
  { cap: '2', label: 'RESTART', action: 'restart' },
  { cap: 'ESC', label: 'BACK', action: 'back' },
];

describe('soft keys (M10+)', () => {
  it('maps keyboard codes to key caps (top row and keypad digits, Enter, Esc, letters)', () => {
    expect(capForCode('Digit1')).toBe('1');
    expect(capForCode('Numpad3')).toBe('3');
    expect(capForCode('Enter')).toBe('ENTER');
    expect(capForCode('NumpadEnter')).toBe('ENTER');
    expect(capForCode('Escape')).toBe('ESC');
    expect(capForCode('KeyR')).toBe('R');
    expect(capForCode('ArrowUp')).toBeNull();
    expect(capForCode('ShiftLeft')).toBeNull();
  });

  it('presses the key with that cap; Enter falls back to the go key', () => {
    expect(softKeyFor(KEYS, 'Digit2')?.action).toBe('restart');
    expect(softKeyFor(KEYS, 'Escape')?.action).toBe('back');
    expect(softKeyFor(KEYS, 'Enter')?.action).toBe('resume');
    expect(softKeyFor(KEYS, 'Digit9')).toBeNull();
    const own: SoftKey[] = [...KEYS, { cap: 'ENTER', label: 'DEPLOY', action: 'deploy' }];
    expect(softKeyFor(own, 'Enter')?.action).toBe('deploy');
    expect(softKeyFor(KEYS.slice(1), 'Enter')).toBeNull(); // no go key, no ENTER cap
  });

  it('moves the focus with wrap-around, and starts from either end', () => {
    expect(stepFocus(0, 3, 1)).toBe(1);
    expect(stepFocus(2, 3, 1)).toBe(0);
    expect(stepFocus(0, 3, -1)).toBe(2);
    expect(stepFocus(-1, 3, 1)).toBe(0);
    expect(stepFocus(-1, 3, -1)).toBe(2);
    expect(stepFocus(0, 0, 1)).toBe(-1);
  });
});
