import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Helicopter } from './Helicopter';

const flat = () => 0;
const run = (h: Helicopter, seconds: number, dt = 1 / 30) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) h.update(dt);
};

describe('Helicopter (Kestrel 6)', () => {
  it('is not in the picture until called', () => {
    const h = new Helicopter(flat);
    expect(h.visible).toBe(false);
    expect(h.stage).toBe('none');
    run(h, 5);
    expect(h.visible).toBe(false);
  });

  it('flies in at cruise height, lands on the pad and waits there', () => {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    expect(h.stage).toBe('inbound');
    expect(h.position.y).toBe(CONFIG.helicopter.cruiseHeight);
    run(h, 60);
    expect(h.state).toBe('landed');
    expect(h.position.distanceTo(h.padPosition)).toBeLessThan(0.01);
    run(h, 30);
    expect(h.state).toBe('landed'); // waits for Ridgeback
  });

  it('lands within a sensible time of being called from 500 m out', () => {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    let t = 0;
    while (h.state !== 'landed' && t < 120) {
      run(h, 0.5);
      t += 0.5;
    }
    expect(t).toBeGreaterThan(10);
    expect(t).toBeLessThan(30);
  });

  it('boards, lifts off the way it came, climbs and leaves', () => {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    run(h, 60);
    h.board();
    expect(h.stage).toBe('boarded');
    run(h, CONFIG.helicopter.boardSeconds + 0.1);
    expect(h.stage).toBe('departed');
    run(h, 4);
    expect(h.position.y).toBeGreaterThan(10);
    expect(h.position.x).toBeLessThan(0); // back west, toward where it came from
    run(h, CONFIG.helicopter.departSeconds);
    expect(h.visible).toBe(false);
    expect(h.stage).toBe('departed');
  });

  it('ignores board() before it has landed', () => {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    h.board();
    expect(h.state).toBe('inbound');
  });
});

describe('Helicopter as a target (M7)', () => {
  function landed() {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    run(h, 60);
    return h;
  }

  it('is only a target once called, and exposed to ground fire only when low', () => {
    const h = new Helicopter(flat);
    expect(h.alive).toBe(false);
    h.call(-500, 0, 0, 0);
    expect(h.alive).toBe(true);
    expect(h.exposed).toBe(false); // inbound at cruise height
    run(h, 60);
    expect(h.exposed).toBe(true); // on the pad
  });

  it('enemy fire wears it down to a wreck, killed by "enemy"', () => {
    const h = landed();
    h.takeFire(150);
    expect(h.underFire).toBe(true);
    expect(h.hp).toBe(CONFIG.helicopter.hp - 150);
    h.takeFire(1e4);
    expect(h.state).toBe('destroyed');
    expect(h.killedBy).toBe('enemy');
    expect(h.alive).toBe(false);
    h.board();
    expect(h.state).toBe('destroyed'); // nobody boards a wreck
  });

  it('blasts go through its armor (25 mm splinters hurt less)', () => {
    const h = landed();
    h.takeDamage(100 * h.armor['25'], '25', h.position);
    expect(h.hp).toBe(CONFIG.helicopter.hp - 60);
  });

  it('god mode protects it, and a new call starts it fresh', () => {
    const h = landed();
    h.invulnerable = true;
    h.takeFire(1e4);
    expect(h.alive).toBe(true);
    h.invulnerable = false;
    h.takeFire(1e4);
    h.call(-500, 0, 0, 0);
    expect(h.hp).toBe(CONFIG.helicopter.hp);
    expect(h.killedBy).toBeNull();
  });

  it('a wreck falls to the ground', () => {
    const h = new Helicopter(flat);
    h.call(-500, 0, 0, 0);
    h.takeFire(1e4);
    run(h, 5);
    expect(h.position.y).toBe(0);
  });
});
