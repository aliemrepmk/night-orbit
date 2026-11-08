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
