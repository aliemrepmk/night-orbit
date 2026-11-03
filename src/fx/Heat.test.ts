import { describe, expect, it } from 'vitest';
import {
  BODY_COOLING,
  CRATER_COOLING,
  FIRE,
  HEAT,
  WRECK_COOLING,
  coolingHeat,
  fireHeat,
  wreckHeat,
  type CoolingCurve,
} from './Heat';

const curves: [string, CoolingCurve][] = [
  ['body', BODY_COOLING],
  ['crater', CRATER_COOLING],
  ['wreck', WRECK_COOLING],
];

describe('heat table', () => {
  it('keeps every heat value within 0–1', () => {
    for (const [name, h] of Object.entries(HEAT)) {
      expect(h, name).toBeGreaterThanOrEqual(0);
      expect(h, name).toBeLessThanOrEqual(1);
    }
    for (const [name, c] of curves) {
      for (const v of [c.from, c.to]) {
        expect(v, name).toBeGreaterThanOrEqual(0);
        expect(v, name).toBeLessThanOrEqual(1);
      }
    }
  });

  it('makes soldiers the hottest living thing and water the coldest', () => {
    const values = Object.values(HEAT);
    expect(HEAT.water).toBe(Math.min(...values));
    for (const [name, h] of Object.entries(HEAT)) {
      if (['engine', 'exhaust', 'flash', 'soldier'].includes(name)) continue;
      expect(h, name).toBeLessThan(HEAT.soldier);
    }
  });

  it('keeps soldiers above the bloom threshold so they glow, and the ground well below it', () => {
    expect(HEAT.soldier).toBeGreaterThan(0.7);
    expect(HEAT.soilMax).toBeLessThan(0.7);
  });
});

describe('cooling curves', () => {
  it('matches the plan: bodies 0.95 → 0.35 over 60 s, craters 0.8 → 0.2 over 30 s', () => {
    expect(BODY_COOLING).toEqual({ from: 0.95, to: 0.35, duration: 60 });
    expect(CRATER_COOLING).toEqual({ from: 0.8, to: 0.2, duration: 30 });
  });

  it.each(curves)('%s: starts at `from`, ends exactly at `to`, and stays there', (_n, c) => {
    expect(coolingHeat(c, -1)).toBe(c.from);
    expect(coolingHeat(c, 0)).toBe(c.from);
    expect(coolingHeat(c, c.duration)).toBe(c.to);
    expect(coolingHeat(c, c.duration * 10)).toBe(c.to);
    expect(coolingHeat(c, c.duration - 1e-6)).toBeCloseTo(c.to, 5);
  });

  it.each(curves)('%s: only ever cools (monotonic) and stays between the endpoints', (_n, c) => {
    let prev = Infinity;
    for (let t = 0; t <= c.duration; t += c.duration / 200) {
      const h = coolingHeat(c, t);
      expect(h).toBeLessThanOrEqual(prev);
      expect(h).toBeLessThanOrEqual(c.from);
      expect(h).toBeGreaterThanOrEqual(c.to);
      prev = h;
    }
  });

  it('cools fastest at first (more than half the drop in the first third)', () => {
    const c = BODY_COOLING;
    const dropped = c.from - coolingHeat(c, c.duration / 3);
    expect(dropped).toBeGreaterThan((c.from - c.to) / 2);
  });
});

describe('fire and wrecks', () => {
  it('flickers within 0.85–1.0 and actually moves', () => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = 0; t < 10; t += 0.013) {
      const h = fireHeat(t, 3);
      expect(h).toBeGreaterThanOrEqual(FIRE.min);
      expect(h).toBeLessThanOrEqual(FIRE.max);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    expect(hi - lo).toBeGreaterThan(0.08);
  });

  it('de-syncs fires with different seeds', () => {
    expect(fireHeat(1.234, 1)).not.toBeCloseTo(fireHeat(1.234, 2), 3);
  });

  it('burns for 40 s, then cools to cold metal', () => {
    expect(wreckHeat(FIRE.duration - 0.01)).toBeGreaterThanOrEqual(FIRE.min);
    expect(wreckHeat(FIRE.duration)).toBe(WRECK_COOLING.from);
    expect(wreckHeat(FIRE.duration + WRECK_COOLING.duration)).toBe(WRECK_COOLING.to);
  });
});
