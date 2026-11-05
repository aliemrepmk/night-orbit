import { describe, expect, it } from 'vitest';
import { StreamCrossings } from './crossings';
import { MAP } from './MapData';
import type { BridgeDef, StreamDef } from './mapTypes';

// A straight north–south stream at x = 0 with one east–west bridge at z = 100.
const STREAM: StreamDef = {
  width: 6,
  depth: 1.6,
  points: [
    [0, -500],
    [0, 500],
  ],
};
const BRIDGE: BridgeDef = { id: 'b', at: [0, 100], heading: Math.PI / 2, length: 16, width: 8 };
const sc = new StreamCrossings(STREAM, [BRIDGE]);
const out = { x: 0, z: 0 };

/** Walks a point toward a target, taking detours, and returns every position visited. */
function walk(from: [number, number], to: [number, number], speed = 2.5, steps = 4000) {
  let [x, z] = from;
  const trail: [number, number][] = [];
  for (let k = 0; k < steps; k++) {
    let [gx, gz] = to;
    if (sc.detour(x, z, to[0], to[1], out)) [gx, gz] = [out.x, out.z];
    const d = Math.hypot(gx - x, gz - z);
    if (d < 0.5) {
      if (gx === to[0] && gz === to[1]) break;
    }
    const step = Math.min(d, speed * 0.25);
    x += ((gx - x) / (d || 1)) * step;
    z += ((gz - z) / (d || 1)) * step;
    trail.push([x, z]);
  }
  return trail;
}

describe('StreamCrossings', () => {
  it('leaves walks that stay on one side alone', () => {
    expect(sc.crosses(-50, 0, -60, 300)).toBe(false);
    expect(sc.detour(-50, 0, -60, 300, out)).toBe(false);
  });

  it('sends a walker across the stream to the near end of the bridge first', () => {
    expect(sc.detour(-50, 300, 50, 300, out)).toBe(true);
    expect(out.x).toBeLessThan(0); // the west end
    expect(Math.abs(out.z - 100)).toBeLessThan(1);
  });

  it('crosses only over the deck: every stream crossing of the walk is at the bridge', () => {
    const trail = walk([-60, 300], [70, 320]);
    const last = trail[trail.length - 1];
    expect(Math.hypot(last[0] - 70, last[1] - 320)).toBeLessThan(1); // got there
    for (let i = 1; i < trail.length; i++) {
      const [ax, az] = trail[i - 1];
      const [bx, bz] = trail[i];
      if (ax < 0 !== bx < 0) expect(Math.abs((az + bz) / 2 - 100)).toBeLessThan(BRIDGE.width / 2);
    }
  });

  it('works both ways and for the real map (fields ↔ village)', () => {
    const real = new StreamCrossings(MAP.stream, MAP.bridges);
    expect(real.crosses(-400, 0, 0, 40)).toBe(true);
    expect(real.detour(-400, 0, 0, 40, out)).toBe(true);
    expect(Math.hypot(out.x - MAP.bridges[0].at[0], out.z - MAP.bridges[0].at[1])).toBeLessThan(20);
    expect(real.detour(0, 40, -400, 0, out)).toBe(true);
    expect(out.x).toBeGreaterThan(MAP.bridges[0].at[0]); // the east end first, coming from the village
  });
});
