import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Gunship } from './Gunship';

const DT = 1 / 60;
const { radius, altitude, bobAmplitude, period } = CONFIG.orbit;

function horizontalDistance(g: Gunship): number {
  return Math.hypot(g.position.x - g.center.x, g.position.z - g.center.z);
}

describe('Gunship orbit', () => {
  it('stays on the orbit circle at the configured altitude', () => {
    const g = new Gunship();
    for (let i = 0; i < 600; i++) {
      g.update(DT);
      expect(horizontalDistance(g)).toBeCloseTo(radius, 6);
      expect(Math.abs(g.position.y - altitude)).toBeLessThanOrEqual(bobAmplitude + 1e-9);
    }
  });

  it('flies counter-clockwise seen from above (a left-hand orbit)', () => {
    const g = new Gunship(); // starts due east of the center
    expect(g.position.x).toBeCloseTo(radius);
    g.update(1);
    expect(g.position.z).toBeLessThan(0); // moved north (−z)
    // Center should be on the aircraft's left: cross(velocity, toCenter).y > 0 for a left turn
    // in a right-handed, y-up world.
    const before = g.position.clone();
    g.update(DT);
    const vel = g.position.clone().sub(before);
    const toCenter = g.center.clone().sub(g.position);
    expect(vel.clone().cross(toCenter).y).toBeGreaterThan(0);
  });

  it('completes a full circle in one period', () => {
    const g = new Gunship();
    const start = g.position.clone();
    const steps = Math.round(period / DT);
    for (let i = 0; i < steps; i++) g.update(DT);
    expect(g.position.x).toBeCloseTo(start.x, 3);
    expect(g.position.z).toBeCloseTo(start.z, 3);
  });

  it('reports heading north when east of the center', () => {
    const g = new Gunship();
    expect(g.headingDeg).toBeCloseTo(0, 6);
    g.angle = Math.PI / 2; // north of center → flying west
    expect(g.headingDeg).toBeCloseTo(270, 6);
  });

  it('glides the orbit center toward a new focus without overshooting', () => {
    const g = new Gunship();
    g.setFocus(300, -200);
    let prev = Infinity;
    for (let i = 0; i < 60 * 30; i++) {
      g.update(DT);
      const d = Math.hypot(g.center.x - 300, g.center.z + 200);
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
    expect(prev).toBeLessThan(1);
  });

  it('snapTo() moves the orbit instantly', () => {
    const g = new Gunship();
    g.snapTo(-450, -250);
    expect(g.center.x).toBe(-450);
    expect(horizontalDistance(g)).toBeCloseTo(radius, 6);
  });
});
