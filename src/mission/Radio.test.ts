import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Radio } from './Radio';

const cfg = { ...CONFIG.radio, baseSeconds: 1, secondsPerChar: 0, maxSeconds: 5, gapSeconds: 0.2 };

function run(r: Radio, seconds: number, dt = 0.05) {
  for (let t = 0; t < seconds - 1e-9; t += dt) r.update(dt);
}

describe('Radio', () => {
  it('puts a line on air at once, for a time that grows with its length (capped)', () => {
    const r = new Radio(CONFIG.radio);
    r.say('FCO', 'Target down.', 1);
    expect(r.current?.text).toBe('Target down.');
    expect(r.duration('x'.repeat(10))).toBeLessThan(r.duration('x'.repeat(40)));
    expect(r.duration('x'.repeat(5000))).toBe(CONFIG.radio.maxSeconds);
  });

  it('plays waiting lines by priority (story > warning > chatter), FIFO within one', () => {
    const r = new Radio(cfg);
    const heard: string[] = [];
    r.onLine = (l) => heard.push(l.text);
    r.say('FCO', 'story A', 3); // on air
    r.say('FCO', 'chatter', 1);
    r.say('FCO', 'warning', 2);
    r.say('NAV', 'story B', 3);
    run(r, 2.5);
    expect(heard).toEqual(['story A', 'story B', 'warning']);
  });

  it('leaves a gap of silence between two lines', () => {
    const r = new Radio(cfg);
    r.say('FCO', 'one', 3);
    r.say('FCO', 'two', 3);
    run(r, 1.05);
    expect(r.current).toBeNull();
    run(r, 0.3);
    expect(r.current?.text).toBe('two');
  });

  it('a story line or a warning cuts off chatter on air', () => {
    const r = new Radio(cfg);
    r.say('FCO', 'Target down.', 1);
    r.say('FCO', 'Be advised: the clinic.', 3);
    expect(r.current?.text).toBe('Be advised: the clinic.');
  });

  it('does not cut off a story line for anything', () => {
    const r = new Radio(cfg);
    r.say('FCO', 'story', 3);
    r.say('FCO', 'warning', 2);
    expect(r.current?.text).toBe('story');
  });

  it('drops stale chatter instead of reporting old kills late (story lines never go stale)', () => {
    const r = new Radio({ ...cfg, maxSeconds: 30, baseSeconds: 20 });
    r.say('FCO', 'long story', 3);
    r.say('FCO', 'Target down.', 1);
    r.say('FCO', 'next story', 3);
    run(r, 21);
    expect(r.current?.text).toBe('next story');
    run(r, 25);
    expect(r.waiting).toBe(0);
    expect(r.current).toBeNull(); // the kill call was dropped
  });
});

describe('Radio between phases', () => {
  it('dropWaiting forgets queued lines but lets the one on air finish', () => {
    const r = new Radio(cfg);
    r.say('FCO', 'on air', 3);
    r.say('FCO', 'old news', 3);
    r.dropWaiting();
    expect(r.current?.text).toBe('on air');
    run(r, 3);
    expect(r.current).toBeNull();
  });
});

describe('Radio key (M9 squelch)', () => {
  it('keys on when a line goes on air and off when it ends, is cut off or cleared', () => {
    const r = new Radio();
    const keys: string[] = [];
    r.onKey = (on, l) => keys.push(`${on ? 'on' : 'off'}:${l.text}`);
    r.say('NAV', 'chatter', 1);
    expect(keys).toEqual(['on:chatter']);
    r.say('FCO', 'story', 3); // cuts the chatter off
    expect(keys).toEqual(['on:chatter', 'off:chatter', 'on:story']);
    for (let i = 0; i < 30 * 20; i++) r.update(1 / 30);
    expect(keys.at(-1)).toBe('off:story');
    r.say('NAV', 'last', 2);
    r.clear();
    expect(keys.slice(-2)).toEqual(['on:last', 'off:last']);
    r.clear(); // nothing on air: no extra key-up
    expect(keys.at(-1)).toBe('off:last');
    expect(keys.filter((k) => k.startsWith('on')).length).toBe(
      keys.filter((k) => k.startsWith('off')).length,
    );
  });
});
