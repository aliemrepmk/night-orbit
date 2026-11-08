import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { Effects } from '../fx/Effects';
import { Gunship } from '../gunship/Gunship';
import { Sensor } from '../gunship/Sensor';
import { STRIKES } from '../gunship/airSupportDefs';
import { WEAPONS } from '../gunship/weaponDefs';
import { SensorFX } from '../render/SensorFX';
import { Helicopter } from '../units/Helicopter';
import { ARMOR } from './Damage';
import { Explosions, shakeFor, whiteoutFor, type Target } from './Explosions';

describe('impact feedback scaling', () => {
  it('shakes hardest at the aim point and not at all far away', () => {
    const w = WEAPONS['105'];
    expect(shakeFor(w, 0)).toBe(w.fx.shakeDeg);
    expect(shakeFor(w, w.blastRadius * 3)).toBeLessThan(w.fx.shakeDeg);
    expect(shakeFor(w, w.blastRadius * CONFIG.fx.shakeReach)).toBe(0);
  });

  it('shakes more for heavier weapons at the same spot', () => {
    expect(shakeFor(WEAPONS['105'], 0)).toBeGreaterThan(shakeFor(WEAPONS['40'], 0));
    expect(shakeFor(WEAPONS['40'], 0)).toBeGreaterThan(shakeFor(WEAPONS['25'], 0));
  });

  it('whites out only for impacts in view, more when zoomed in on them', () => {
    const w = WEAPONS['105'];
    const wide = 1140 * Math.tan((28 * Math.PI) / 360);
    const narrow = 1140 * Math.tan((5 * Math.PI) / 360);
    expect(whiteoutFor(w, wide, false)).toBe(0);
    expect(whiteoutFor(w, narrow, true)).toBeGreaterThan(whiteoutFor(w, wide, true));
    expect(whiteoutFor(w, narrow, true)).toBeLessThanOrEqual(w.fx.whiteout);
    expect(whiteoutFor(WEAPONS['25'], narrow, true)).toBe(0); // 25 mm never whites out
  });
});

describe('Explosions.detonate', () => {
  function rig() {
    const gunship = new Gunship();
    gunship.snapTo(0, 0);
    const sensor = new Sensor(gunship, { heightAt: () => 0 }, 16 / 9);
    sensor.syncCamera();
    const sensorFx = new SensorFX();
    const bus = new EventBus<GameEvents>();
    const effects = new Effects(() => 0, createRng(1));
    const soldier = target('infantry', new Vector3(sensor.aim.x + 2, 0, sensor.aim.z));
    const truck = target('vehicle', new Vector3(sensor.aim.x + 50, 0, sensor.aim.z), 300);
    const ex = new Explosions(effects, sensor, sensorFx, bus, () => [soldier, truck]);
    return { sensor, sensorFx, bus, effects, soldier, truck, ex };
  }

  function target(
    kind: 'infantry' | 'vehicle',
    position: Vector3,
    hp = 100,
    side: 'enemy' | 'friendly' = 'enemy',
  ) {
    const t: Target & { hp: number } = {
      kind,
      side,
      position,
      armor: ARMOR.none,
      hp,
      get alive() {
        return this.hp > 0;
      },
      takeDamage(a: number) {
        this.hp -= a;
      },
    };
    return t;
  }

  it('kills what is in the blast, reports kills and the impact, and shakes the sensor', () => {
    const { sensor, sensorFx, bus, effects, soldier, truck, ex } = rig();
    const kills: string[] = [];
    let impacts = 0;
    bus.on('unitKilled', (e) => kills.push(`${e.kind}:${e.by}`));
    bus.on('impact', () => impacts++);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(soldier.alive).toBe(false);
    expect(truck.alive).toBe(true); // 50 m away: outside the 22 m blast
    expect(kills).toEqual(['infantry:105']);
    expect(impacts).toBe(1);
    expect(sensor.shakeDeg).toBeGreaterThan(0);
    expect(sensorFx.whiteout).toBeGreaterThan(0);
    expect(effects.activeCraters).toBe(1);
  });

  it('reports how many enemies the blast hurt (mission accuracy, M8), never friendlies', () => {
    const { sensor, bus, effects } = rig();
    const near = [
      target('infantry', new Vector3(sensor.aim.x + 1, 0, sensor.aim.z), 1e6),
      target('vehicle', new Vector3(sensor.aim.x - 2, 0, sensor.aim.z), 1e6),
      target('infantry', new Vector3(sensor.aim.x, 0, sensor.aim.z + 15), 1e6, 'friendly'),
    ];
    const ex = new Explosions(effects, sensor, new SensorFX(), bus, () => near);
    const hits: number[] = [];
    bus.on('impact', (e) => hits.push(e.enemiesHit));
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    ex.detonate(new Vector3(sensor.aim.x + 300, 0, sensor.aim.z), WEAPONS['40'], true);
    expect(hits).toEqual([2, 0]);
  });

  it('does not report a kill twice for a target that is already dead', () => {
    const { sensor, bus, ex } = rig();
    let kills = 0;
    bus.on('unitKilled', () => kills++);
    ex.detonate(sensor.aim.clone(), WEAPONS['40'], true);
    ex.detonate(sensor.aim.clone(), WEAPONS['40'], true);
    expect(kills).toBe(1);
  });

  function friendlyRig(friendlyOffset: number) {
    const r = rig();
    const friendly = target(
      'infantry',
      new Vector3(r.sensor.aim.x + friendlyOffset, 0, r.sensor.aim.z),
      100,
      'friendly',
    );
    const ex = new Explosions(r.effects, r.sensor, r.sensorFx, r.bus, () => [friendly]);
    const log: string[] = [];
    r.bus.on('friendlyKilledByPlayer', (e) => log.push(`friendlyKilled:${e.weapon}`));
    r.bus.on('missionFailed', (e) => log.push(`failed:${e.reason}`));
    r.bus.on('dangerClose', (e) => log.push(`dangerClose:${e.weapon}:${e.distance.toFixed(0)}`));
    r.bus.on('unitKilled', () => log.push('unitKilled'));
    return { ...r, friendly, ex, log };
  }

  it('fails the mission with friendly_fire when the player kills a friendly', () => {
    const { sensor, friendly, ex, log } = friendlyRig(3);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(friendly.alive).toBe(false);
    // Not counted as an enemy kill; no danger-close warning on top of the failure.
    expect(log).toEqual(['friendlyKilled:105', 'failed:friendly_fire']);
  });

  it('warns danger close when a friendly survives an impact inside the danger-close distance', () => {
    // 105 mm: blast 22 m, danger close 33 m. A friendly 28 m away is unhurt but too close.
    const { sensor, friendly, ex, log } = friendlyRig(28);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(friendly.hp).toBe(100);
    expect(log).toEqual(['dangerClose:105:28']);
  });

  it('warns danger close (not failure) when a friendly is wounded but survives', () => {
    const { sensor, friendly, ex, log } = friendlyRig(0);
    ex.detonate(sensor.aim.clone(), WEAPONS['25'], true); // 70 damage < 100 HP
    expect(friendly.alive).toBe(true);
    expect(friendly.hp).toBe(30);
    expect(log).toEqual(['dangerClose:25:0']);
  });

  it('says nothing when friendlies are beyond the danger-close distance', () => {
    const { sensor, ex, log } = friendlyRig(40);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(log).toEqual([]);
  });

  it('uses each weapon’s own danger-close distance (12 m is close for 40 mm, not for 25 mm)', () => {
    const a = friendlyRig(10);
    a.ex.detonate(a.sensor.aim.clone(), WEAPONS['40'], true);
    expect(a.log).toEqual(['dangerClose:40:10']);
    const b = friendlyRig(10);
    b.ex.detonate(b.sensor.aim.clone(), WEAPONS['25'], true);
    expect(b.log).toEqual([]);
  });

  it('air strikes follow the same rules: a bomb on a friendly fails the mission', () => {
    const { sensor, friendly, ex, log } = friendlyRig(30); // well inside the bomb's 40 m blast
    ex.detonate(sensor.aim.clone(), STRIKES.bomb.ordnance, true);
    expect(friendly.alive).toBe(false);
    expect(log).toEqual(['friendlyKilled:bomb', 'failed:friendly_fire']);
  });

  it('a bomb 70 m from a friendly hurts nobody but warns danger close (100 m)', () => {
    const { sensor, friendly, ex, log } = friendlyRig(70);
    ex.detonate(sensor.aim.clone(), STRIKES.bomb.ordnance, true);
    expect(friendly.hp).toBe(100);
    expect(log).toEqual(['dangerClose:bomb:70']);
  });

  it('a gun-run hit on an enemy counts as the player’s kill', () => {
    const r = rig();
    const enemy = target('infantry', r.sensor.aim.clone(), 100);
    const ex = new Explosions(r.effects, r.sensor, r.sensorFx, r.bus, () => [enemy]);
    const kills: string[] = [];
    r.bus.on('unitKilled', (e) => kills.push(e.by));
    ex.detonate(r.sensor.aim.clone(), STRIKES.gunrun.ordnance, true);
    expect(kills).toEqual(['gunrun']);
  });
});

describe('Explosions and Kestrel 6 (M7)', () => {
  function heliRig(height: number) {
    const gunship = new Gunship();
    gunship.snapTo(0, 0);
    const sensor = new Sensor(gunship, { heightAt: () => 0 }, 16 / 9);
    sensor.syncCamera();
    const bus = new EventBus<GameEvents>();
    const heli = new Helicopter(() => 0);
    heli.call(sensor.aim.x - 500, sensor.aim.z, sensor.aim.x, sensor.aim.z);
    heli.position.set(sensor.aim.x + 2, height, sensor.aim.z);
    const ex = new Explosions(
      new Effects(() => 0, createRng(1)),
      sensor,
      new SensorFX(),
      bus,
      () => [heli],
    );
    const log: string[] = [];
    bus.on('friendlyKilledByPlayer', (e) => log.push(`friendlyKilled:${e.weapon}`));
    bus.on('missionFailed', (e) => log.push(`failed:${e.reason}`));
    bus.on('dangerClose', (e) => log.push(`dangerClose:${e.weapon}`));
    return { sensor, heli, ex, log };
  }

  it('a 105 mm round next to the landed helicopter destroys it: its own fail reason', () => {
    const { sensor, heli, ex, log } = heliRig(0);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(heli.state).toBe('destroyed');
    expect(log).toEqual(['friendlyKilled:105', 'failed:helicopter_friendly_fire']);
  });

  it('a 40 mm hit only damages it, and counts as danger close', () => {
    const { sensor, heli, ex, log } = heliRig(0);
    ex.detonate(sensor.aim.clone(), WEAPONS['40'], true);
    expect(heli.alive).toBe(true);
    expect(heli.hp).toBeLessThan(heli.maxHp);
    expect(log).toEqual(['dangerClose:40']);
  });

  it('a ground impact under it while it flies high does not touch it (3D distance)', () => {
    const { sensor, heli, ex } = heliRig(70);
    ex.detonate(sensor.aim.clone(), WEAPONS['105'], true);
    expect(heli.hp).toBe(heli.maxHp);
  });
});
