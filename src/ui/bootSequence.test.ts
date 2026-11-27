import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { BOOT_BARS, BOOT_LINES, bootLineText, bootState } from './bootSequence';

const cfg = { bootLineSeconds: 0.2, bootHoldSeconds: 0.5 };

describe('boot sequence (M10+)', () => {
  it('adds one line per step and is done after the last line plus the hold', () => {
    expect(bootState(0, cfg).lines).toBe(0);
    expect(bootState(0.45, cfg).lines).toBe(2);
    const last = BOOT_LINES.length * cfg.bootLineSeconds;
    expect(bootState(last, cfg).lines).toBe(BOOT_LINES.length);
    expect(bootState(last, cfg).done).toBe(false);
    expect(bootState(last + cfg.bootHoldSeconds, cfg).done).toBe(true);
    expect(bootState(1e6, cfg).lines).toBe(BOOT_LINES.length);
  });

  it('fills every bar by the end, each one monotonically', () => {
    let prev = BOOT_BARS.map(() => 0);
    for (let t = 0; t <= 3; t += 0.05) {
      const s = bootState(t, cfg);
      s.bars.forEach((b, i) => expect(b).toBeGreaterThanOrEqual(prev[i]));
      prev = [...s.bars];
    }
    expect(prev.every((b) => b === 1)).toBe(true);
  });

  it('is short: the whole start-up takes under 3 s with the shipped timings', () => {
    const total = BOOT_LINES.length * CONFIG.ui.bootLineSeconds + CONFIG.ui.bootHoldSeconds;
    expect(total).toBeLessThan(3);
  });

  it('reports the real flare count and pads labels with leader dots', () => {
    expect(BOOT_LINES.some((l) => l.label.includes(`×${CONFIG.airDefense.flares}`))).toBe(true);
    const t = bootLineText({ label: 'ABC', status: 'OK' }, 10);
    expect(t.label.length + t.dots.length).toBe(10);
    expect(bootLineText({ label: 'X'.repeat(50), status: 'OK' }, 10).dots).toBe('...');
  });
});
