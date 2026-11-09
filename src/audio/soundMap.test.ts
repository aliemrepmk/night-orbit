import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { cuesFor, EVENT_SOUNDS, OUTSIDE_NET, wireSounds, type SoundSink } from './soundMap';
import { SOUNDS, impactVolume, type SoundId } from './sounds';

const nearAim = () => 0;

function fakeSink() {
  const played: { id: SoundId; volume: number }[] = [];
  const hiss: boolean[] = [];
  const sink: SoundSink = {
    play: (id, volume = 1) => played.push({ id, volume }),
    radioHiss: (on) => hiss.push(on),
  };
  return { sink, played, hiss, ids: () => played.map((p) => p.id) };
}

describe('sound-event mapping (M9: each event triggers the right sound id)', () => {
  it('each gun fires its own sound, and each shell lands with its own impact', () => {
    for (const w of ['25', '40', '105'] as const) {
      expect(cuesFor('shotFired', { weapon: w }, nearAim)).toEqual([{ id: `fire${w}`, volume: 1 }]);
    }
    for (const w of ['25', '40', '105', 'gunrun', 'bomb'] as const) {
      const e = { pos: new Vector3(), weapon: w, distanceToAim: 300, enemiesHit: 0 };
      expect(cuesFor('impact', e, nearAim)).toEqual([
        { id: `impact${w}`, volume: impactVolume(300, w) },
      ]);
    }
  });

  it('cockpit beeps: a gun picked, a gun ready (the 105 mm with the loader’s clank first)', () => {
    expect(cuesFor('weaponSelected', { weapon: '40' }, nearAim).map((c) => c.id)).toEqual([
      'select',
    ]);
    expect(cuesFor('weaponReady', { weapon: '25' }, nearAim).map((c) => c.id)).toEqual(['ready']);
    expect(cuesFor('weaponReady', { weapon: '105' }, nearAim).map((c) => c.id)).toEqual([
      'breech',
      'ready',
    ]);
  });

  it('the radio: squelch on the outside net, a click on the crew intercom', () => {
    for (const speaker of ['RIDGEBACK', 'KESTREL', 'PILOT'] as const) {
      expect(cuesFor('radioKey', { on: true, speaker }, nearAim)[0].id).toBe('squelchOpen');
      expect(cuesFor('radioKey', { on: false, speaker }, nearAim)[0].id).toBe('squelchClose');
    }
    for (const speaker of ['FCO', 'NAV'] as const) {
      expect(OUTSIDE_NET.has(speaker)).toBe(false);
      expect(cuesFor('radioKey', { on: true, speaker }, nearAim)[0].id).toBe('intercom');
    }
  });

  it('air defense and twists: hull hits (missiles louder), flares (a deny beep when empty), mortar rounds', () => {
    const missile = cuesFor('hullHit', { damage: 22, hull: 50, by: 'missile' }, nearAim)[0];
    const aa = cuesFor('hullHit', { damage: 2, hull: 50, by: 'aa' }, nearAim)[0];
    expect(missile.id).toBe('hullHit');
    expect(missile.volume).toBeGreaterThan(aa.volume);
    expect(cuesFor('flares', { result: 'decoyed', left: 3 }, nearAim)[0].id).toBe('flare');
    expect(cuesFor('flares', { result: 'empty', left: 0 }, nearAim)[0].id).toBe('deny');
    const far = cuesFor('enemyShell', { x: 0, z: 0 }, () => 2000)[0];
    expect(far).toEqual({ id: 'impact40', volume: impactVolume(2000) });
  });

  it('every mapped sound exists, and silent events map to nothing', () => {
    for (const id of Object.keys(EVENT_SOUNDS)) expect(id).not.toBe('');
    expect(cuesFor('fog', { seconds: 30 }, nearAim)).toEqual([]);
    expect(cuesFor('aaDestroyed', { id: 'aa_ridge' }, nearAim)).toEqual([]);
  });

  it('radio sounds play on the radio bus, everything else on effects', () => {
    for (const id of ['squelchOpen', 'squelchClose', 'intercom'] as const)
      expect(SOUNDS[id].bus).toBe('radio');
    for (const id of ['fire25', 'impact105', 'select', 'ready', 'breech'] as const)
      expect(SOUNDS[id].bus ?? 'sfx').toBe('sfx');
  });
});

describe('wireSounds (events → the sink)', () => {
  it('plays the cues of emitted events, and static only under outside-net lines', () => {
    const bus = new EventBus<GameEvents>();
    const f = fakeSink();
    wireSounds(bus, f.sink, nearAim);
    bus.emit('shotFired', { weapon: '105' });
    bus.emit('weaponReady', { weapon: '105' });
    bus.emit('radioKey', { on: true, speaker: 'RIDGEBACK' });
    bus.emit('radioKey', { on: false, speaker: 'RIDGEBACK' });
    bus.emit('radioKey', { on: true, speaker: 'FCO' });
    bus.emit('fog', { seconds: 30 });
    expect(f.ids()).toEqual([
      'fire105',
      'breech',
      'ready',
      'squelchOpen',
      'squelchClose',
      'intercom',
    ]);
    expect(f.hiss).toEqual([true, false]);
  });

  it('unsubscribes cleanly (a restart does not double the sounds)', () => {
    const bus = new EventBus<GameEvents>();
    const f = fakeSink();
    const off = wireSounds(bus, f.sink, nearAim);
    off();
    bus.emit('shotFired', { weapon: '25' });
    bus.emit('radioKey', { on: true, speaker: 'KESTREL' });
    expect(f.played).toEqual([]);
    expect(f.hiss).toEqual([]);
  });
});
