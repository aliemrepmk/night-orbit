import { describe, expect, it } from 'vitest';
import { Particles, type ParticleSpec } from './Particles';

const DT = 1 / 60;

function spec(over: Partial<ParticleSpec> = {}): ParticleSpec {
  return {
    x: 0,
    y: 10,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 1,
    size0: 1,
    size1: 3,
    heat0: 1,
    heat1: 0.2,
    glow0: 1,
    glow1: 0,
    albedo: 0.2,
    gravity: 0,
    drag: 0,
    alpha: 1,
    ...over,
  };
}

function step(p: Particles, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += DT) p.update(DT);
}

describe('Particles', () => {
  it('dies after its life and frees the slot', () => {
    const p = new Particles(8);
    p.spawn(spec({ life: 0.5 }));
    expect(p.aliveCount).toBe(1);
    step(p, 0.45);
    expect(p.isAlive(0)).toBe(true);
    step(p, 0.1);
    expect(p.aliveCount).toBe(0);
  });

  it('interpolates size, heat and glow from birth to death (hot debris cools as it flies)', () => {
    const p = new Particles(1);
    p.spawn(spec());
    step(p, 0.5);
    expect(p.sizeOf(0)).toBeCloseTo(2, 1);
    expect(p.heatOf(0)).toBeCloseTo(0.6, 1);
    expect(p.glowOf(0)).toBeCloseTo(0.5, 1);
  });

  it('falls under gravity, rises with negative gravity (smoke), and slows with drag', () => {
    const p = new Particles(3);
    p.spawn(spec({ gravity: 9.8 }));
    p.spawn(spec({ gravity: -2 }));
    p.spawn(spec({ vx: 10, drag: 2, life: 5 }));
    step(p, 0.5);
    expect(p.pos[1]).toBeCloseTo(10 - 0.5 * 9.8 * 0.25, 0);
    expect(p.pos[4]).toBeGreaterThan(10);
    expect(p.pos[6]).toBeLessThan(5); // would be 5 m without drag
  });

  it('stops debris on the ground', () => {
    const p = new Particles(1, () => 0);
    p.spawn(spec({ vx: 5, vy: -20, gravity: 9.8, life: 3 }));
    step(p, 2);
    expect(p.pos[1]).toBe(0);
    const x = p.pos[0];
    step(p, 0.5);
    expect(p.pos[0]).toBe(x);
  });

  it('fades out over the last 40% of its life', () => {
    const p = new Particles(1);
    p.spawn(spec({ alpha: 0.8, life: 1 }));
    step(p, 0.5);
    expect(p.alphaOf(0)).toBeCloseTo(0.8);
    step(p, 0.45);
    expect(p.alphaOf(0)).toBeLessThan(0.05);
  });

  it('overwrites the oldest particle when the pool is full (fixed memory)', () => {
    const p = new Particles(2);
    p.spawn(spec({ x: 1 }));
    p.spawn(spec({ x: 2 }));
    p.spawn(spec({ x: 3 }));
    expect(p.aliveCount).toBe(2);
    expect(p.pos[0]).toBe(3);
    expect(p.pos[3]).toBe(2);
  });
});
