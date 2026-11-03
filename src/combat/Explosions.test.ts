import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { Effects } from '../fx/Effects';
import { Gunship } from '../gunship/Gunship';
import { Sensor } from '../gunship/Sensor';
import { WEAPONS } from '../gunship/weaponDefs';
import { SensorFX } from '../render/SensorFX';
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

  function target(kind: 'infantry' | 'vehicle', position: Vector3, hp = 100) {
    const t: Target & { hp: number } = {
      kind,
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

  it('does not report a kill twice for a target that is already dead', () => {
    const { sensor, bus, ex } = rig();
    let kills = 0;
    bus.on('unitKilled', () => kills++);
    ex.detonate(sensor.aim.clone(), WEAPONS['40'], true);
    ex.detonate(sensor.aim.clone(), WEAPONS['40'], true);
    expect(kills).toBe(1);
  });
});
