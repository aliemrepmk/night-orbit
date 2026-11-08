import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createRng } from '../core/rng';
import { Chatter } from './Chatter';
import { POOLS } from './lines';
import { Radio } from './Radio';

function rig() {
  const radio = new Radio({ ...CONFIG.radio, chatterMaxWait: 1e9, warningMaxWait: 1e9 });
  const heard: string[] = [];
  const said = radio.say.bind(radio);
  radio.say = (speaker, text, priority) => {
    heard.push(text);
    said(speaker, text, priority);
  };
  return { radio, heard, chatter: new Chatter(radio, createRng(1)) };
}

const step = (c: Chatter, seconds: number, onClinic = false) => {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) c.update(0.05, onClinic);
};

describe('Chatter', () => {
  it('a pool speaks at most once per cooldown', () => {
    const { chatter, heard } = rig();
    expect(chatter.say('dangerClose')).toBe(true);
    expect(chatter.say('dangerClose')).toBe(false);
    step(chatter, POOLS.dangerClose.cooldown + 0.1);
    expect(chatter.say('dangerClose')).toBe(true);
    expect(heard).toHaveLength(2);
  });

  it('never repeats the same line twice in a row', () => {
    const { chatter, heard } = rig();
    for (let i = 0; i < 40; i++) {
      chatter.say('kill');
      step(chatter, POOLS.kill.cooldown + 0.1);
    }
    for (let i = 1; i < heard.length; i++) expect(heard[i]).not.toBe(heard[i - 1]);
    expect(new Set(heard).size).toBe(POOLS.kill.lines.length); // and uses the whole pool
  });

  it('one kill → "target down"; a group wiped together → one "multiple down" call', () => {
    const one = rig();
    one.chatter.infantryKilled();
    step(one.chatter, 2);
    expect(one.heard).toHaveLength(1);
    expect(POOLS.kill.lines).toContain(one.heard[0]);

    const many = rig();
    for (let i = 0; i < 5; i++) many.chatter.infantryKilled();
    step(many.chatter, 2);
    expect(many.heard).toHaveLength(1);
    expect(POOLS.multiKill.lines).toContain(many.heard[0]);
  });

  it('warns when the crosshair rests on the clinic, not when it passes over it', () => {
    const { chatter, heard } = rig();
    step(chatter, 0.3, true);
    step(chatter, 0.1, false);
    expect(heard).toHaveLength(0);
    step(chatter, CONFIG.chatter.clinicHoverSeconds + 0.1, true);
    expect(heard).toHaveLength(1);
    expect(POOLS.clinicHover.lines).toContain(heard[0]);
  });

  it('every pool has lines, a speaker and a cooldown', () => {
    for (const p of Object.values(POOLS)) {
      expect(p.lines.length).toBeGreaterThanOrEqual(2);
      expect(p.cooldown).toBeGreaterThan(0);
    }
  });
});

describe('Chatter, M8+ Phase F (more varied radio)', () => {
  it('uses every line of a pool once before any repeats, and never the same line twice in a row', () => {
    const r = new Radio();
    const said: string[] = [];
    r.onLine = (l) => said.push(l.text);
    const c = new Chatter(r, createRng(5));
    const pool = POOLS.kill;
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < pool.lines.length; i++) {
        c.update(pool.cooldown + 0.1, false);
        c.say('kill');
        for (let t = 0; t < 10; t += 0.5) r.update(0.5);
      }
    }
    const n = pool.lines.length;
    for (let round = 0; round < 3; round++) {
      expect(new Set(said.slice(round * n, round * n + n)).size).toBe(n);
    }
    for (let i = 1; i < said.length; i++) expect(said[i]).not.toBe(said[i - 1]);
  });

  it('fills landmark callouts into the contact lines', () => {
    const r = new Radio();
    const said: string[] = [];
    r.onLine = (l) => said.push(l.text);
    const c = new Chatter(r, createRng(2));
    expect(c.sayPlace('contact', 'north of the barn')).toBe(true);
    r.update(0.1);
    expect(said[0]).toContain('north of the barn');
    expect(said[0]).not.toContain('{place}');
  });

  it('the crew banters after a calm silence, but never while the team is in a fight', () => {
    const heard = (calm: boolean) => {
      const r = new Radio();
      const said: string[] = [];
      r.onLine = (l) => said.push(l.text);
      const c = new Chatter(r, createRng(3));
      for (let t = 0; t < 40; t += 0.1) {
        c.update(0.1, false, calm);
        r.update(0.1);
      }
      return said;
    };
    expect(heard(true).some((l) => POOLS.banter.lines.includes(l))).toBe(true);
    expect(heard(false)).toEqual([]);
  });

  it('has at least six lines in every common pool', () => {
    for (const id of [
      'kill',
      'multiKill',
      'vehicleKill',
      'miss',
      'teamUnderFire',
      'teamHurt',
      'banter',
    ] as const) {
      expect(POOLS[id].lines.length, id).toBeGreaterThanOrEqual(6);
    }
  });
});
