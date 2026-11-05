import { describe, expect, it } from 'vitest';
import { HEAT } from '../fx/Heat';
import { createGroundHeat, inPolygon } from './groundHeat';
import type { FieldDef } from './mapTypes';

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

  it('makes plowed fields warm and grass fields cool, inside their polygons only', () => {
    const square = (x: number): FieldDef['polygon'] => [
      [x, 0],
      [x + 100, 0],
      [x + 100, 100],
      [x, 100],
    ];
    const fields: FieldDef[] = [
      { kind: 'plowed', polygon: square(0) },
      { kind: 'grass', polygon: square(200) },
    ];
    const h = createGroundHeat(7, fields);
    let plowed = 0;
    let grass = 0;
    for (let k = 0; k < 50; k++) {
      plowed += h(10 + k * 1.7, 50);
      grass += h(210 + k * 1.7, 50);
    }
    expect(plowed / 50).toBeGreaterThan(HEAT.soilMin + (HEAT.soilMax - HEAT.soilMin) * 0.65);
    expect(grass / 50).toBeLessThan(HEAT.soilMin + (HEAT.soilMax - HEAT.soilMin) * 0.3);
    expect(h(150, 50)).toBe(createGroundHeat(7)(150, 50)); // between fields: the plain soil field
  });

  it('tests points against polygons', () => {
    const tri = [
      [0, 0],
      [10, 0],
      [0, 10],
    ] as const;
    expect(inPolygon(tri, 2, 2)).toBe(true);
    expect(inPolygon(tri, 8, 8)).toBe(false);
  });
});
