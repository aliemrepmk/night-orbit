import { describe, expect, it } from 'vitest';
import { WEAPONS } from './weaponDefs';
import { WeaponState, Weapons } from './Weapons';

const DT = 1 / 60;

/** Runs `seconds` of fixed steps; `clickAt` = step indices with a trigger press. */
function run(
  w: WeaponState,
  seconds: number,
  { held = false, clickEvery = 0, selected = true } = {},
): number {
  let shots = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const click = clickEvery > 0 && i % clickEvery === 0 ? 1 : 0;
    shots += w.update(DT, selected, held, click);
  }
  return shots;
}

describe('25 mm (auto, barrel heat)', () => {
  it('fires 10 shots per second while held', () => {
    const w = new WeaponState(WEAPONS['25']);
    expect(run(w, 1, { held: true })).toBe(10);
    expect(w.heat).toBeCloseTo(0.25);
  });

  it('fires the first shot on the very first held tick', () => {
    const w = new WeaponState(WEAPONS['25']);
    expect(w.update(DT, true, true, 1)).toBe(1);
  });

  it('overheats after 4 s of continuous fire, then is locked out for 3 s', () => {
    const w = new WeaponState(WEAPONS['25']);
    let shots = 0;
    let steps = 0;
    while (w.status !== 'overheated' && steps < 1000) {
      shots += w.update(DT, true, true, 0);
      steps++;
    }
    expect(shots).toBe(40);
    expect(steps * DT).toBeCloseTo(3.9 + DT, 1); // 40th shot leaves at t = 3.9 s
    expect(run(w, 2.95, { held: true })).toBe(0);
    expect(run(w, 0.1, { held: true })).toBeGreaterThan(0); // cooled down, firing again
    expect(w.heat).toBeLessThan(0.1);
  });

  it('cools passively when the trigger is released', () => {
    const w = new WeaponState(WEAPONS['25']);
    run(w, 2, { held: true });
    const hot = w.heat;
    run(w, 1);
    expect(w.heat).toBeCloseTo(hot - WEAPONS['25'].coolRate, 5);
  });

  it('short bursts never overheat', () => {
    const w = new WeaponState(WEAPONS['25']);
    for (let i = 0; i < 10; i++) {
      run(w, 0.5, { held: true });
      run(w, 1);
    }
    expect(w.status).not.toBe('overheated');
  });
});

describe('40 mm (semi, 5-round clip)', () => {
  it('fires one shot per click, gated to one per 0.45 s', () => {
    const w = new WeaponState(WEAPONS['40']);
    // Clicking every tick for 1 s: shots at 0, 0.45, 0.9 → 3.
    expect(run(w, 1, { clickEvery: 1 })).toBe(3);
  });

  it('holding the trigger without clicking does not fire', () => {
    const w = new WeaponState(WEAPONS['40']);
    expect(run(w, 1, { held: true })).toBe(0);
  });

  it('reloads for 2.2 s after the fifth round, then has a full clip', () => {
    const w = new WeaponState(WEAPONS['40']);
    expect(run(w, 2.05, { clickEvery: 30 })).toBe(5); // clicks at 0, 0.5 … 2.0 s
    expect(w.rounds).toBe(0);
    expect(w.status).toBe('reloading');
    expect(run(w, 2.05, { clickEvery: 1 })).toBe(0); // still inside the 2.2 s reload
    run(w, 0.2);
    expect(w.rounds).toBe(5);
    expect(w.status).toBe('ready');
  });
});

describe('105 mm (single, 5 s reload)', () => {
  it('fires once, then shows LOADING for 5 s with progress', () => {
    const w = new WeaponState(WEAPONS['105']);
    expect(w.update(DT, true, true, 1)).toBe(1);
    expect(w.status).toBe('reloading');
    run(w, 2.5, { clickEvery: 1 });
    expect(w.reloadProgress).toBeCloseTo(0.5, 1);
    expect(run(w, 2.4, { clickEvery: 1 })).toBe(0);
    expect(run(w, 0.2, { clickEvery: 1 })).toBe(1);
  });
});

describe('Weapons (all three guns)', () => {
  it('only the selected gun fires, but the others keep reloading in the background', () => {
    const ws = new Weapons();
    expect(ws.update(DT, '105', true, 1)).toBe(1);
    expect(ws.guns['105'].status).toBe('reloading');
    // Switch to 25 mm and fire for 5 s: the 105 finishes reloading meanwhile.
    let shots = 0;
    for (let i = 0; i < 310; i++) shots += ws.update(DT, '25', true, 0);
    expect(shots).toBeGreaterThan(0);
    expect(ws.guns['105'].status).toBe('ready');
    expect(ws.guns['40'].rounds).toBe(5); // untouched
  });
});
