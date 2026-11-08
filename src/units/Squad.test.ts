import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Squad, strobeOn } from './Squad';

const DT = 1 / 60;
const cfg = { speed: 2, holdTime: 5, spacing: 4 };
const step = (s: Squad, t: number) => {
  for (let k = 0; k < Math.round(t / DT); k++) s.update(DT);
};

describe('Squad', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: -20 }, // 20 m north
    { x: 20, z: -20 }, // then 20 m east
  ];

  it('walks the route at its speed, facing where it goes', () => {
    const s = new Squad(route, cfg);
    expect(s.heading).toBeCloseTo(Math.PI); // facing −z (north): (sin π, cos π) = (0, −1)
    step(s, 5);
    expect(s.anchor.z).toBeCloseTo(-10, 5);
    expect(s.moving).toBe(true);
  });

  it('holds at each waypoint for the hold time, then continues', () => {
    const s = new Squad(route, cfg);
    step(s, 10.05); // reaches (0, −20)
    expect(s.anchor.z).toBeCloseTo(-20, 5);
    expect(s.moving).toBe(false);
    step(s, 4.9);
    expect(s.anchor.x).toBeCloseTo(0, 5);
    step(s, 1);
    expect(s.moving).toBe(true);
    expect(s.anchor.x).toBeGreaterThan(0);
    expect(s.heading).toBeCloseTo(Math.PI / 2); // facing +x (east)
  });

  it('turns back at the end of the route (ping-pong)', () => {
    const s = new Squad(route, cfg);
    step(s, 10.05 + 5 + 10.05 + 5.05); // to the end and through the hold there
    expect(s.nextPoint).toEqual(route[1]);
    expect(s.heading).toBeCloseTo(-Math.PI / 2); // walking back west
  });

  it('places the leader on the anchor and the others in a diamond behind it', () => {
    const s = new Squad(route, cfg); // facing north
    const p = new Vector3();
    expect(s.slot(0, p).toArray()).toEqual([0, 0, 0]);
    s.slot(3, p); // rear: 2 × 4 m behind = south (+z)
    expect(p.x).toBeCloseTo(0);
    expect(p.z).toBeCloseTo(8);
    const left = s.slot(1, new Vector3());
    const right = s.slot(2, new Vector3());
    expect(left.z).toBeCloseTo(4);
    expect(right.z).toBeCloseTo(4);
    expect(right.x).toBeCloseTo(4); // facing north, right is east
    expect(left.x).toBeCloseTo(-4);
  });

  it('rejects a route with fewer than two points', () => {
    expect(() => new Squad([{ x: 0, z: 0 }], cfg)).toThrow();
  });
});

describe('strobeOn', () => {
  it('blinks at 2 Hz, lit for the duty fraction of each blink', () => {
    let lit = 0;
    let rises = 0;
    let prev = false;
    for (let k = 0; k < 600; k++) {
      // 10 s
      const on = strobeOn(k / 60, 2, 0.25);
      if (on) lit++;
      if (on && !prev) rises++;
      prev = on;
    }
    expect(rises).toBe(20);
    expect(lit / 600).toBeCloseTo(0.25, 1);
  });

  it('phase shifts de-sync strobes', () => {
    expect(strobeOn(0, 2, 0.25, 0)).toBe(true);
    expect(strobeOn(0, 2, 0.25, 0.5)).toBe(false);
  });
});

describe('Squad one-way walking (mission moveTeam / teamHold, M7)', () => {
  const route = [
    { x: 0, z: 0 },
    { x: 0, z: -20 },
    { x: 20, z: -20 },
  ];

  it('walks a route once, straight through its waypoints, and stops at the end', () => {
    const s = new Squad(route, cfg, false);
    step(s, 9); // 18 m: no hold at the first waypoint, already turning east
    expect(s.moving).toBe(true);
    step(s, 15);
    expect(s.arrived).toBe(true);
    expect(s.moving).toBe(false);
    expect(s.anchor.x).toBeCloseTo(20);
    expect(s.anchor.z).toBeCloseTo(-20);
    step(s, 30);
    expect(s.anchor.x).toBeCloseTo(20); // stays there (no ping-pong)
  });

  it('walk() starts a new route from where it stands, skipping a first point it is on', () => {
    const s = new Squad(route, cfg, false);
    step(s, 30);
    s.walk([
      { x: 20, z: -20 },
      { x: 20, z: 0 },
    ]);
    expect(s.arrived).toBe(false);
    expect(s.nextPoint).toEqual({ x: 20, z: 0 });
    step(s, 12);
    expect(s.arrived).toBe(true);
    expect(s.anchor.z).toBeCloseTo(0);
  });

  it('halt() stops it where it stands (the team then fights), placeAt() moves it', () => {
    const s = new Squad(route, cfg, false);
    step(s, 3);
    s.halt();
    const z = s.anchor.z;
    step(s, 5);
    expect(s.anchor.z).toBe(z);
    expect(s.moving).toBe(false);
    s.placeAt(100, 50);
    expect([s.anchor.x, s.anchor.z]).toEqual([100, 50]);
    expect(s.arrived).toBe(true);
  });

  it('a looping squad told to walk stops looping', () => {
    const s = new Squad(route, cfg);
    s.walk([
      { x: 0, z: 0 },
      { x: 10, z: 0 },
    ]);
    step(s, 60);
    expect(s.anchor.x).toBeCloseTo(10);
  });
});
