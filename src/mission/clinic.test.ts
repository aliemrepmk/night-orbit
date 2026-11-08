import { describe, expect, it } from 'vitest';
import { ORDNANCE } from '../gunship/airSupportDefs';
import {
  clinicVerdict,
  footprintDistance,
  largestFootprint,
  nearestFootprint,
  type Footprint,
} from './clinic';

const CLINIC: Footprint = { center: { x: 42, z: 14 }, half: { x: 9, z: 6 }, rotY: 0 };
const cfg = { hitMinRadius: 1.5, nearMissRadius: 15 };

describe('footprintDistance', () => {
  it('is 0 inside and the gap to the nearest edge or corner outside', () => {
    expect(footprintDistance(CLINIC, 42, 14)).toBe(0);
    expect(footprintDistance(CLINIC, 42 + 9 + 3, 14)).toBeCloseTo(3);
    expect(footprintDistance(CLINIC, 42 + 9 + 3, 14 + 6 + 4)).toBeCloseTo(5);
  });

  it('follows the building rotation', () => {
    const turned: Footprint = { ...CLINIC, rotY: Math.PI / 2 };
    // Turned 90°: the long side now runs along z.
    expect(footprintDistance(turned, 42, 14 + 9 - 0.5)).toBe(0);
    expect(footprintDistance(turned, 42 + 9 - 0.5, 14)).toBeCloseTo(2.5);
  });

  it('takes the nearest of several footprints (clinic and generator)', () => {
    const gen: Footprint = { center: { x: 60, z: 14 }, half: { x: 1, z: 1 }, rotY: 0 };
    expect(nearestFootprint([CLINIC, gen], 62, 14)).toBeCloseTo(1);
    expect(nearestFootprint([], 0, 0)).toBe(Infinity);
    // The marker goes on the clinic, not on its generator (regression: it picked the first box).
    expect(largestFootprint([gen, CLINIC])).toBe(CLINIC);
  });
});

describe('clinicVerdict', () => {
  it('a 105 mm round within its full-damage radius hits the clinic', () => {
    expect(clinicVerdict(0, ORDNANCE['105'], cfg)).toBe('hit');
    expect(clinicVerdict(ORDNANCE['105'].innerRadius - 0.1, ORDNANCE['105'], cfg)).toBe('hit');
  });

  it('a 105 mm round a little further out is a near miss; far away is nothing', () => {
    expect(clinicVerdict(ORDNANCE['105'].innerRadius + 1, ORDNANCE['105'], cfg)).toBe('nearMiss');
    expect(clinicVerdict(200, ORDNANCE['105'], cfg)).toBeNull();
  });

  it('even small 25 mm rounds count as hits right on it', () => {
    expect(clinicVerdict(1, ORDNANCE['25'], cfg)).toBe('hit');
    expect(clinicVerdict(8, ORDNANCE['25'], cfg)).toBe('nearMiss');
  });

  it('the bomb hits the clinic from much further away (same rule, bigger radii)', () => {
    const d = ORDNANCE.bomb.innerRadius - 1;
    expect(clinicVerdict(d, ORDNANCE.bomb, cfg)).toBe('hit');
    expect(clinicVerdict(d, ORDNANCE['40'], cfg)).not.toBe('hit');
  });
});
