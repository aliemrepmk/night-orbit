import { describe, expect, it } from 'vitest';
import { infantryPose, type Pose } from './infantryPose';

const cfg = { bobHeight: 0.1, leanRad: 0.12 };
const pose = (): Pose => ({ pitch: 0, yaw: 0, bob: 0 });

describe('infantryPose', () => {
  it('stands upright when idle or firing, facing its heading', () => {
    for (const state of ['idle', 'firing'] as const) {
      const p = infantryPose({ state, heading: 1.2, tumble: 0, walkPhase: 3 }, cfg, pose());
      expect(p).toEqual({ pitch: 0, yaw: 1.2, bob: 0 });
    }
  });

  it('bobs (never below the ground) and leans forward while walking', () => {
    let maxBob = 0;
    for (let ph = 0; ph < Math.PI * 2; ph += 0.1) {
      const p = infantryPose(
        { state: 'moving', heading: 0, tumble: 0, walkPhase: ph },
        cfg,
        pose(),
      );
      expect(p.bob).toBeGreaterThanOrEqual(0);
      expect(p.pitch).toBe(cfg.leanRad);
      maxBob = Math.max(maxBob, p.bob);
    }
    expect(maxBob).toBeCloseTo(cfg.bobHeight, 2);
  });

  it('tumbles while flung and lies flat when dead', () => {
    expect(
      infantryPose({ state: 'flung', heading: 0, tumble: 2.5, walkPhase: 0 }, cfg, pose()).pitch,
    ).toBe(2.5);
    expect(
      infantryPose({ state: 'dead', heading: 0, tumble: 9, walkPhase: 0 }, cfg, pose()).pitch,
    ).toBeCloseTo(Math.PI / 2);
  });
});
