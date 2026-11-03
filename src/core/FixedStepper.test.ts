import { describe, expect, it } from 'vitest';
import { FixedStepper } from './FixedStepper';

const STEP = 1 / 60;

describe('FixedStepper', () => {
  it('runs one step per 1/60 s frame', () => {
    const s = new FixedStepper(STEP, 0.25);
    for (let i = 0; i < 10; i++) expect(s.advance(STEP)).toBe(1);
  });

  it('runs several steps for a long frame', () => {
    expect(new FixedStepper(STEP, 0.25).advance(0.1)).toBe(6);
  });

  it('carries the remainder over to the next frame (144 Hz screen)', () => {
    const s = new FixedStepper(STEP, 0.25);
    let total = 0;
    for (let i = 0; i < 144; i++) total += s.advance(1 / 144);
    expect(total).toBe(60);
  });

  it('clamps huge gaps (tab switch) to maxFrame', () => {
    expect(new FixedStepper(STEP, 0.25).advance(10)).toBe(15);
  });

  it('ignores negative time', () => {
    const s = new FixedStepper(STEP, 0.25);
    expect(s.advance(-1)).toBe(0);
    expect(s.alpha).toBe(0);
  });

  it('reports alpha between 0 and 1', () => {
    const s = new FixedStepper(STEP, 0.25);
    s.advance(STEP * 1.5);
    expect(s.alpha).toBeCloseTo(0.5, 5);
  });
});
