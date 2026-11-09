import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { BUSES, busGains, effectiveGain, type Volumes } from './mix';

const FULL: Volumes = { volume: 1, sfxVolume: 1, radioVolume: 1, engineVolume: 1 };

describe('mixer buses (M9: master → sfx, radio, ambience)', () => {
  it('at full volume every node sits at its configured trim', () => {
    const g = busGains(FULL);
    expect(g.master).toBe(CONFIG.mix.master);
    for (const b of BUSES) expect(g[b]).toBe(CONFIG.mix[b]);
  });

  it('a bus volume scales only its own bus', () => {
    const half = busGains({ ...FULL, radioVolume: 0.5 });
    expect(half.radio).toBeCloseTo(CONFIG.mix.radio * 0.5);
    expect(half.sfx).toBe(CONFIG.mix.sfx);
    expect(half.ambience).toBe(CONFIG.mix.ambience);
    expect(half.master).toBe(CONFIG.mix.master);
  });

  it('the master volume scales everything: master × bus', () => {
    const v = { ...FULL, volume: 0.5, sfxVolume: 0.4 };
    expect(effectiveGain(v, 'sfx')).toBeCloseTo(CONFIG.mix.master * 0.5 * CONFIG.mix.sfx * 0.4);
    expect(effectiveGain(v, 'radio')).toBeCloseTo(CONFIG.mix.master * 0.5 * CONFIG.mix.radio);
  });

  it('muting the master or a bus silences it', () => {
    for (const b of BUSES) expect(effectiveGain({ ...FULL, volume: 0 }, b)).toBe(0);
    expect(effectiveGain({ ...FULL, sfxVolume: 0 }, 'sfx')).toBe(0);
    expect(effectiveGain({ ...FULL, sfxVolume: 0 }, 'radio')).toBeGreaterThan(0);
  });

  it('clamps bad volumes to 0–1 (never louder than full, never NaN)', () => {
    const g = busGains({ volume: 3, sfxVolume: -1, radioVolume: NaN, engineVolume: 1 });
    expect(g.master).toBe(CONFIG.mix.master);
    expect(g.sfx).toBe(0);
    expect(g.radio).toBe(0);
  });

  it('keeps headroom: full volume on every bus stays at or under unity', () => {
    for (const b of BUSES) expect(effectiveGain(FULL, b)).toBeLessThanOrEqual(1);
  });
});
