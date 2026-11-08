import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { AirDefense, hitChance, type PlaneState } from './AirDefense';

const C = CONFIG.airDefense;
const DT = 1 / 30;

/** The gunship orbiting 900 m out at 700 m altitude around `center`. */
function plane(cx = 0, cz = 0): PlaneState {
  return { position: new Vector3(cx + 900, 700, cz), center: new Vector3(cx, 0, cz) };
}

function rig(sites = [{ id: 'g', x: 0, y: 1, z: 0 }]) {
  const bus = new EventBus<GameEvents>();
  const log: string[] = [];
  for (const ev of [
    'aaFiring',
    'aaDestroyed',
    'hullHit',
    'engineLost',
    'missileLaunch',
    'missileDefeated',
    'flares',
    'missionFailed',
  ] as const) {
    bus.on(ev, () => log.push(ev));
  }
  const ad = new AirDefense(sites, bus, createRng(3));
  let tracers = 0;
  const step = (s: number, p: PlaneState | null = plane()) => {
    for (let t = 0; t < s; t += DT) ad.update(DT, p, (_f, _t, n) => (tracers += n));
  };
  return { ad, bus, log, step, tracers: () => tracers };
}

describe('AA guns (M8+ Phase E)', () => {
  it('a dormant gun never fires; activated, it fires bursts of tracers at the gunship', () => {
    const r = rig();
    r.step(10);
    expect(r.tracers()).toBe(0);
    r.ad.activate('g');
    r.step(10);
    expect(r.tracers()).toBeGreaterThan(20);
    expect(r.log).toContain('aaFiring');
  });

  it('only fires while it is within reach of the orbit (so you can always shoot back)', () => {
    const r = rig();
    r.ad.activate('g');
    r.step(10, plane(C.engageRadius + 200, 0));
    expect(r.tracers()).toBe(0);
  });

  it('hits more the closer it is and the longer it has been tracking', () => {
    expect(hitChance(700, 100)).toBeGreaterThan(hitChance(1400, 100));
    expect(hitChance(800, 1)).toBeLessThan(hitChance(800, C.trackSeconds));
    expect(hitChance(800, 0)).toBe(0);
  });

  it('wears the hull down, loses an engine below the mark, and shoots the gunship down at 0', () => {
    const r = rig();
    r.ad.activate('g');
    r.step(600);
    expect(r.ad.hull).toBe(0);
    expect(r.ad.engineLost).toBe(true);
    expect(r.log.filter((e) => e === 'engineLost')).toHaveLength(1);
    expect(r.log.filter((e) => e === 'missionFailed')).toHaveLength(1);
  });

  it('is a target: a destroyed gun stops firing and is reported once', () => {
    const r = rig();
    r.ad.activate('g');
    const g = r.ad.gun('g')!;
    g.takeDamage(C.gunHp, '105', new Vector3());
    expect(g.alive).toBe(false);
    r.step(5);
    expect(r.tracers()).toBe(0);
    expect(r.log.filter((e) => e === 'aaDestroyed')).toHaveLength(1);
  });

  it('counts the AA covering a strike target; trucks count too', () => {
    const r = rig([
      { id: 'a', x: 0, y: 0, z: 0 },
      { id: 'b', x: 100, y: 0, z: 0 },
      { id: 'c', x: 5000, y: 0, z: 0 },
    ]);
    expect(r.ad.strikeThreat(50, 0)).toBe(0); // dormant guns don't count
    for (const id of ['a', 'b', 'c']) r.ad.activate(id);
    expect(r.ad.strikeThreat(50, 0)).toBe(2);
    r.ad.trucks = () => [{ id: 't', position: new Vector3(60, 0, 40), firing: true }];
    expect(r.ad.strikeThreat(50, 0)).toBe(3);
  });
});

describe('MANPADS and flares (M8+ Phase E)', () => {
  it('a missile climbs to the gunship and hits it for heavy damage', () => {
    const r = rig([]);
    r.ad.launch(new Vector3(0, 0, 0));
    expect(r.log).toContain('missileLaunch');
    r.step(8);
    expect(r.ad.hull).toBe(C.hull - C.missileDamage);
    expect(r.ad.inbound).toHaveLength(0);
  });

  it('flares dropped in time decoy it; too late, it still hits', () => {
    const early = rig([]);
    early.ad.launch(new Vector3());
    early.step(1);
    expect(early.ad.dropFlares(plane())).toBe('decoyed');
    early.step(8);
    expect(early.ad.hull).toBe(C.hull);

    const late = rig([]);
    late.ad.launch(new Vector3());
    const m = late.ad.inbound[0];
    while (late.ad.timeToImpact(m, plane()) > C.flareLead * 0.5) late.step(DT);
    expect(late.ad.dropFlares(plane())).toBe('late');
    late.step(3);
    expect(late.ad.hull).toBe(C.hull - C.missileDamage);
  });

  it('flares with nothing inbound are wasted, and they run out', () => {
    const r = rig([]);
    for (let i = 0; i < C.flares; i++) expect(r.ad.dropFlares(plane())).toBe('wasted');
    expect(r.ad.flares).toBe(0);
    expect(r.ad.dropFlares(plane())).toBe('empty');
  });

  it('missile flight time leaves a real window to react (several seconds)', () => {
    const slant = plane().position.length();
    expect(slant / C.missileSpeed - C.flareLead).toBeGreaterThan(2);
  });
});
