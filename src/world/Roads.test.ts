import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { buildRoadGeometry } from './Roads';

const hills = (x: number, z: number) => Math.sin(x * 0.02) * 4 + Math.cos(z * 0.03) * 3;

describe('buildRoadGeometry', () => {
  const points = [
    { x: 0, z: 0 },
    { x: 0, z: -100 },
    { x: 80, z: -100 },
  ];
  const geo = buildRoadGeometry(points, 7, hills, 4, 0.25);
  const pos = geo.getAttribute('position');

  it('has two vertices per sample along the road', () => {
    expect(pos.count % 2).toBe(0);
    expect(pos.count / 2).toBeGreaterThanOrEqual(180 / 4);
  });

  it('drapes every vertex just above the terrain', () => {
    for (let k = 0; k < pos.count; k++) {
      expect(pos.getY(k)).toBeCloseTo(hills(pos.getX(k), pos.getZ(k)) + 0.25, 5);
    }
  });

  it('is the requested width on straight stretches', () => {
    const a = new Vector3(pos.getX(10), 0, pos.getZ(10));
    const b = new Vector3(pos.getX(11), 0, pos.getZ(11));
    expect(a.distanceTo(b)).toBeCloseTo(7, 5);
  });

  it('faces up (so it is drawn from the sky)', () => {
    const n = geo.getAttribute('normal');
    for (let k = 0; k < n.count; k++) expect(n.getY(k)).toBeGreaterThan(0.5);
  });
});
