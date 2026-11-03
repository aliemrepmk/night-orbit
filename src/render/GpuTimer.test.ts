import { describe, expect, it } from 'vitest';
import { GpuTimer, type TimerGL } from './GpuTimer';

/** Fake GL: each query's result becomes available after `latency` end() calls. */
function fakeGl({ supported = true, latency = 2, nsPerFrame = 7_000_000 } = {}) {
  let frame = 0;
  let disjoint = false;
  const ended = new Map<object, number>();
  const live = new Set<object>();
  const gl = {
    QUERY_RESULT: 1,
    QUERY_RESULT_AVAILABLE: 2,
    getExtension: () => (supported ? { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 } : null),
    createQuery: () => {
      const q = {};
      live.add(q);
      return q;
    },
    deleteQuery: (q: object) => live.delete(q),
    beginQuery: () => {},
    endQuery: () => {},
    getParameter: () => disjoint,
    getQueryParameter: (q: object, p: number) =>
      p === 2 ? frame - (ended.get(q) ?? Infinity) >= latency : nsPerFrame,
  };
  return {
    gl: gl as unknown as TimerGL,
    /** Simulates one rendered frame. */
    run(timer: GpuTimer) {
      timer.begin();
      frame++;
      const last = [...live].at(-1);
      if (last && !ended.has(last)) ended.set(last, frame);
      timer.end();
    },
    setDisjoint: (v: boolean) => (disjoint = v),
    live,
  };
}

describe('GpuTimer', () => {
  it('reports null when the browser has no GPU timer extension', () => {
    const f = fakeGl({ supported: false });
    const t = new GpuTimer(f.gl);
    for (let i = 0; i < 5; i++) f.run(t);
    expect(t.ms).toBeNull();
  });

  it('reports GPU time in milliseconds once results arrive a few frames later', () => {
    const f = fakeGl({ latency: 2, nsPerFrame: 7_000_000 });
    const t = new GpuTimer(f.gl);
    f.run(t);
    expect(t.ms).toBeNull();
    for (let i = 0; i < 5; i++) f.run(t);
    expect(t.ms).toBeCloseTo(7);
  });

  it('ignores samples taken during a disjoint event', () => {
    const f = fakeGl({ latency: 1 });
    const t = new GpuTimer(f.gl);
    f.setDisjoint(true);
    for (let i = 0; i < 5; i++) f.run(t);
    expect(t.ms).toBeNull();
  });

  it('deletes finished queries and caps in-flight ones when the GPU falls behind', () => {
    const quick = fakeGl({ latency: 1 });
    const t1 = new GpuTimer(quick.gl);
    for (let i = 0; i < 50; i++) quick.run(t1);
    expect(quick.live.size).toBeLessThanOrEqual(2);

    const stuck = fakeGl({ latency: 1_000 });
    const t2 = new GpuTimer(stuck.gl);
    for (let i = 0; i < 50; i++) stuck.run(t2);
    expect(stuck.live.size).toBeLessThanOrEqual(8);
  });
});
