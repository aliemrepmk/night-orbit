import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import {
  approach,
  clampToRadius,
  groundBasis,
  headingDeg,
  metersPerPixel,
  wrapDeg,
} from './sensorMath';

describe('headingDeg', () => {
  it('maps compass directions (−z is north)', () => {
    expect(headingDeg(0, -1)).toBeCloseTo(0);
    expect(headingDeg(1, 0)).toBeCloseTo(90);
    expect(headingDeg(0, 1)).toBeCloseTo(180);
    expect(headingDeg(-1, 0)).toBeCloseTo(270);
  });
});

describe('wrapDeg', () => {
  it('wraps into (−180, 180]', () => {
    expect(wrapDeg(190)).toBeCloseTo(-170);
    expect(wrapDeg(-190)).toBeCloseTo(170);
    expect(wrapDeg(720)).toBeCloseTo(0);
    expect(wrapDeg(180)).toBeCloseTo(180);
  });
});

describe('groundBasis', () => {
  it('gives horizontal unit vectors with right = forward × up', () => {
    const f = new Vector3();
    const r = new Vector3();
    groundBasis(new Vector3(0, 700, 0), new Vector3(0, 0, -500), f, r);
    expect(f.toArray()).toEqual([0, 0, -1].map((v) => expect.closeTo(v)));
    // Looking north, screen-right is east.
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
    expect(f.y).toBe(0);
    expect(r.y).toBe(0);
  });
});

describe('metersPerPixel', () => {
  it('is smaller when zoomed in', () => {
    expect(metersPerPixel(1000, 5, 1000)).toBeLessThan(metersPerPixel(1000, 28, 1000));
  });

  it('matches the visible ground height formula', () => {
    // 90° FOV at 500 m range shows 1000 m over 1000 px → 1 m/px.
    expect(metersPerPixel(500, 90, 1000)).toBeCloseTo(1);
  });
});

describe('clampToRadius', () => {
  it('leaves points inside alone and pulls points outside to the edge', () => {
    const c = new Vector3(10, 0, 10);
    const inside = new Vector3(20, 5, 10);
    clampToRadius(inside, c, 50);
    expect(inside.x).toBe(20);

    const outside = new Vector3(110, 5, 10);
    clampToRadius(outside, c, 50);
    expect(outside.x).toBeCloseTo(60);
    expect(outside.z).toBeCloseTo(10);
    expect(outside.y).toBe(5); // height is untouched
  });
});

describe('approach', () => {
  it('converges to the target independent of step size', () => {
    let a = 0;
    for (let i = 0; i < 60; i++) a = approach(a, 10, 1 / 60, 0.1);
    let b = 0;
    for (let i = 0; i < 30; i++) b = approach(b, 10, 1 / 30, 0.1);
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeCloseTo(10, 2);
  });
});
