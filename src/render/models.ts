import { BoxGeometry, type BufferGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A box [w, h, d] centered at [x, y, z] (meters; +z forward, +y up), turned `rotY` about +y. */
export type BoxSpec = readonly [
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY?: number,
];

/** Merges boxes into one geometry (one instanced draw call per model part). */
export function boxModel(boxes: readonly BoxSpec[]): BufferGeometry {
  return mergeGeometries(
    boxes.map(([w, h, d, x, y, z, rotY = 0]) =>
      new BoxGeometry(w, h, d).rotateY(rotY).translate(x, y, z),
    ),
  )!;
}

/**
 * Strike jets (M8+ Phase E), low-poly and generic (fictional callsigns, PLAN.md §2): a straight-
 * winged ground-attack jet with twin tail-mounted engines (the gun run) and a single-engine
 * fighter with swept wings (the bomb). Airframe and hot engine parts are separate, so the
 * engines can glow in thermal.
 */
export const ATTACK_JET = {
  frame: [
    [1.6, 1.8, 16, 0, 0, 0], // fuselage
    [17.5, 0.35, 2.8, 0, -0.1, 0.6], // long straight wings
    [5.6, 0.25, 1.6, 0, 0.3, -6.8], // tailplane
    [0.25, 2.8, 1.8, 2.7, 1.5, -7], // twin fins
    [0.25, 2.8, 1.8, -2.7, 1.5, -7],
  ] as readonly BoxSpec[],
  engines: [
    [1.2, 1.2, 3, 1.5, 1.4, -3.6], // engine pods high on the rear fuselage
    [1.2, 1.2, 3, -1.5, 1.4, -3.6],
  ] as readonly BoxSpec[],
} as const;

export const FAST_JET = {
  frame: [
    [1.4, 1.6, 15, 0, 0, 0], // fuselage
    [9.5, 0.3, 3.4, 0, -0.1, -1.6], // swept wing, wide at the root…
    [5.6, 0.3, 2.2, 0, -0.1, 0.6], // …narrower further forward (a cranked delta)
    [5.4, 0.2, 1.6, 0, 0.1, -6.4], // tailplane
    [0.25, 3, 2.4, 0, 1.8, -5.8], // single fin
  ] as readonly BoxSpec[],
  engines: [[1.25, 1.25, 1.6, 0, 0, -7.6]] as readonly BoxSpec[], // the nozzle
} as const;

/** An AA gun emplacement: a ring of sandbags and a gun mount (barrels are posed separately). */
export function sandbagRing(radius: number, bags: number): BoxSpec[] {
  const out: BoxSpec[] = [];
  for (let i = 0; i < bags; i++) {
    if (i === 0) continue; // a gap: the way in
    const a = (i / bags) * Math.PI * 2;
    // Each bag lies along the ring (tangent), so the ring reads as a circle from above.
    out.push([1.6, 0.9, 0.7, Math.cos(a) * radius, 0.45, Math.sin(a) * radius, -a + Math.PI / 2]);
  }
  return out;
}
