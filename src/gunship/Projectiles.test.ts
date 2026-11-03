import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Projectiles, type Shell } from './Projectiles';

const DT = 1 / 60;
const A = new Vector3(0, 700, 0);
const B = new Vector3(600, 0, 0);

describe('Projectiles', () => {
  it('impacts on exactly the tick its flight time elapses', () => {
    const p = new Projectiles();
    p.fire('105', A, B, 1.0);
    const impacts: number[] = [];
    for (let tick = 1; tick <= 120; tick++) p.update(DT, () => impacts.push(tick));
    expect(impacts).toEqual([60]);
  });

  it('impacts each shell once, in flight-time order', () => {
    const p = new Projectiles();
    p.fire('40', A, B, 1.5);
    p.fire('25', A, B, 0.5);
    const order: string[] = [];
    for (let i = 0; i < 200; i++) p.update(DT, (s) => order.push(s.weapon));
    expect(order).toEqual(['25', '40']);
    expect(p.activeCount).toBe(0);
  });

  it('moves the shell along its path for tracers', () => {
    const p = new Projectiles();
    const s = p.fire('25', A, B, 1.0);
    for (let i = 0; i < 30; i++) p.update(DT, () => {});
    const pos = p.positionOf(s);
    expect(pos.x).toBeCloseTo(300, 0);
    expect(pos.y).toBeCloseTo(350, 0);
  });

  it('reuses pooled shells instead of allocating, and recycles the oldest when full', () => {
    const p = new Projectiles(4);
    const shells: Shell[] = [];
    for (let i = 0; i < 4; i++) shells.push(p.fire('25', A, B, 10));
    const fifth = p.fire('40', A, B, 10);
    expect(shells).toContain(fifth);
    expect(p.activeCount).toBe(4);
    for (let i = 0; i < 700; i++) p.update(DT, () => {});
    const again = p.fire('105', A, B, 1);
    expect(shells).toContain(again); // a freed slot, not a new object
  });
});
