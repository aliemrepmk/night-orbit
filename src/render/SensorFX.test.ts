import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { SensorFX } from './SensorFX';

const cfg = CONFIG.sensorFx;

function stepped(fx: SensorFX, seconds: number): void {
  const dt = 1 / 60;
  for (let t = 0; t < seconds - 1e-9; t += dt) fx.update(dt);
}

describe('SensorFX', () => {
  it('shows nothing before any weapon switch', () => {
    const fx = new SensorFX();
    expect(fx.staticAmount).toBe(0);
    expect(fx.blurPx).toBe(0);
    fx.update(1);
    expect(fx.staticAmount).toBe(0);
  });

  it('bursts static for 150 ms after a switch, then clears completely', () => {
    const fx = new SensorFX();
    fx.triggerSwitch();
    expect(cfg.staticDuration).toBeCloseTo(0.15);
    expect(fx.staticAmount).toBe(1);
    stepped(fx, cfg.staticDuration * 0.5);
    expect(fx.staticAmount).toBeGreaterThan(0.5);
    stepped(fx, cfg.staticDuration * 0.6);
    expect(fx.staticAmount).toBe(0);
  });

  it('refocuses: blur starts at full radius and only decreases to 0', () => {
    const fx = new SensorFX();
    fx.triggerSwitch();
    expect(fx.blurPx).toBe(cfg.refocusBlurPx);
    let prev = Infinity;
    for (let i = 0; i < 40; i++) {
      expect(fx.blurPx).toBeLessThanOrEqual(prev);
      prev = fx.blurPx;
      fx.update(cfg.refocusDuration / 30);
    }
    expect(fx.blurPx).toBe(0);
  });

  it('restarts when switching again mid-effect', () => {
    const fx = new SensorFX();
    fx.triggerSwitch();
    stepped(fx, 0.1);
    fx.triggerSwitch();
    expect(fx.staticAmount).toBe(1);
    expect(fx.blurPx).toBe(cfg.refocusBlurPx);
  });
});
