import { describe, expect, it } from 'vitest';
import { TeamHealth } from './TeamHealth';

const DT = 1 / 60;
const cfg = { health: 100, regenPerSecond: 1, quietTime: 4 };
const step = (t: TeamHealth, s: number) => {
  for (let k = 0; k < Math.round(s / DT); k++) t.update(DT);
};

describe('TeamHealth', () => {
  it('starts full and drops with damage, never below 0', () => {
    const t = new TeamHealth(cfg);
    expect(t.value).toBe(100);
    t.damage(30);
    expect(t.value).toBe(70);
    t.damage(500);
    expect(t.value).toBe(0);
    expect(t.overrun).toBe(true);
  });

  it('does not regenerate while under fire, or within 4 s of the last shot', () => {
    const t = new TeamHealth(cfg);
    t.damage(20);
    step(t, 3.9);
    expect(t.value).toBe(80);
    expect(t.underFire).toBe(true);
  });

  it('regenerates +1/s once enemies have been quiet for 4 s, capped at full', () => {
    const t = new TeamHealth(cfg);
    t.damage(20);
    step(t, 4.05);
    expect(t.underFire).toBe(false);
    step(t, 10);
    expect(t.value).toBeCloseTo(90, 1);
    step(t, 30);
    expect(t.value).toBe(100);
  });

  it('sustained fire keeps draining it (dps × time)', () => {
    const t = new TeamHealth(cfg);
    for (let k = 0; k < 600; k++) {
      t.damage(3 * DT); // 3 dps for 10 s
      t.update(DT);
    }
    expect(t.value).toBeCloseTo(70, 5);
  });

  it('stays overrun once it reaches 0 (no regeneration back to life)', () => {
    const t = new TeamHealth(cfg);
    t.damage(100);
    step(t, 20);
    expect(t.value).toBe(0);
  });
});

describe('TeamHealth god mode (dev cheat G)', () => {
  it('still counts as under fire, but loses no health', () => {
    const t = new TeamHealth(cfg);
    t.invulnerable = true;
    t.damage(500);
    expect(t.value).toBe(100);
    expect(t.underFire).toBe(true);
    expect(t.overrun).toBe(false);
  });
});

describe('TeamHealth.taken (M8 damage-taken stat)', () => {
  it('adds up the health actually lost: not past 0, not while invulnerable, regen does not undo it', () => {
    const t = new TeamHealth(cfg);
    t.damage(30);
    step(t, 10); // regenerates back toward 100
    t.damage(20);
    expect(t.taken).toBe(50);
    const left = t.value;
    t.damage(500); // only what was left counts
    expect(t.taken).toBeCloseTo(50 + left);
    const god = new TeamHealth(cfg);
    god.invulnerable = true;
    god.damage(40);
    expect(god.taken).toBe(0);
  });
});
