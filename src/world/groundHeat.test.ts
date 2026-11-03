import { describe, expect, it } from 'vitest';
import { HEAT } from '../fx/Heat';
import { createGroundHeat } from './groundHeat';

describe('ground heat', () => {
  const heat = createGroundHeat(7);
  const samples: number[] = [];
  for (let x = -1600; x <= 1600; x += 37) {
    for (let z = -1600; z <= 1600; z += 41) samples.push(heat(x, z));
  }

  it('stays within the soil range from the heat table', () => {
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(HEAT.soilMin);
    expect(Math.max(...samples)).toBeLessThanOrEqual(HEAT.soilMax);
  });

  it('uses most of the range, so fields are visibly different', () => {
    const span = HEAT.soilMax - HEAT.soilMin;
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(span * 0.6);
  });

  it('is repeatable for the same seed', () => {
    expect(createGroundHeat(7)(123, -456)).toBe(heat(123, -456));
  });
});
