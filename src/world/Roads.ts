import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { Path, type PathPoint } from '../ai/Paths';

/**
 * A road as a flat ribbon draped over the terrain (PLAN.md §5 `Roads.ts`): sampled every `step`
 * meters along the polyline, `width` wide, `lift` above the ground so it never z-fights with it.
 */
export function buildRoadGeometry(
  points: readonly PathPoint[],
  width: number,
  heightAt: (x: number, z: number) => number,
  step = 4,
  lift = 0.25,
): BufferGeometry {
  const path = new Path(points);
  const samples = Math.max(2, Math.ceil(path.length / step) + 1);
  const pos = new Float32Array(samples * 2 * 3);
  const p = new Vector3();
  const half = width / 2;
  for (let k = 0; k < samples; k++) {
    const s = (k / (samples - 1)) * path.length;
    path.pointAt(s, p);
    // Average the headings either side of a corner so the joint doesn't pinch.
    const h = averageHeading(path.headingAt(s - 0.5), path.headingAt(s + 0.5));
    const rx = -Math.cos(h);
    const rz = Math.sin(h);
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const x = p.x + rx * half * sign;
      const z = p.z + rz * half * sign;
      const i = (k * 2 + side) * 3;
      pos[i] = x;
      pos[i + 1] = heightAt(x, z) + lift;
      pos[i + 2] = z;
    }
  }
  const index: number[] = [];
  for (let k = 0; k < samples - 1; k++) {
    const a = k * 2;
    // Two triangles per quad, wound to face up (+y).
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function averageHeading(a: number, b: number): number {
  return Math.atan2(Math.sin(a) + Math.sin(b), Math.cos(a) + Math.cos(b));
}
