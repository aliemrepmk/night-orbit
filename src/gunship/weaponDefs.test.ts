import { describe, expect, it } from 'vitest';
import { cycleWeapon } from './weaponDefs';

describe('cycleWeapon', () => {
  it('moves forward and wraps around', () => {
    expect(cycleWeapon('25', 1)).toBe('40');
    expect(cycleWeapon('40', 1)).toBe('105');
    expect(cycleWeapon('105', 1)).toBe('25');
  });

  it('moves backward and wraps around', () => {
    expect(cycleWeapon('25', -1)).toBe('105');
    expect(cycleWeapon('105', -1)).toBe('40');
  });
});
