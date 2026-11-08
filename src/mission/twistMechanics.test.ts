import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { fogEnvelope } from '../render/thermalMath';
import { WEAPONS } from '../gunship/weaponDefs';
import { INFANTRY } from '../units/unitDefs';
import { WeaponState } from '../gunship/Weapons';
import { createWorld } from './battle';
import { headlessGame, type HeadlessGame } from './headlessGame';
import { PILOT_DOWN } from './missionDef';
import { rateMission, summaryRows, MissionStats } from './stats';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';

const DT = 1 / 30;
const T = CONFIG.twists;
const world = createWorld();

function step(g: HeadlessGame, seconds: number) {
  for (let t = 0; t < seconds; t += DT) {
    g.host.update(DT, { x: 0, z: -2000 });
    g.units.update(DT);
    g.vehicles.update(DT);
  }
}

describe('twist mechanics (M8+ Phase F)', { timeout: 60_000 }, () => {
  it('a mortar crew shells Ridgeback: rounds walk in and hurt the team; killing the crew stops it', () => {
    const g = headlessGame(world);
    g.host.start('fields');
    const shells: { x: number; z: number }[] = [];
    g.bus.on('enemyShell', (e) => shells.push(e));
    g.host.perform({ kind: 'startMortar', at: [-520, -150] });
    const crew = g.units.enemies.filter((e) => e.alive && e.def.mortar);
    expect(crew).toHaveLength(2);
    const before = g.units.team.taken;
    step(g, 60);
    expect(shells.length).toBeGreaterThan(6);
    // Walking in: the last rounds land closer to the team than the first.
    const team = g.units.teamPosition;
    const d = (s: { x: number; z: number }) => Math.hypot(s.x - team.x, s.z - team.z);
    expect(d(shells[shells.length - 1])).toBeLessThan(T.mortarFirstMiss);
    expect(g.units.team.taken).toBeGreaterThan(before);
    for (const e of crew) e.takeDamage(1e6, '40', e.position);
    const n = shells.length;
    step(g, 30);
    expect(shells.length).toBe(n);
  });

  it('a wounded operator slows the team and makes it easier to hurt', () => {
    const g = headlessGame(world);
    g.host.perform({ kind: 'woundTeam' });
    expect(g.units.squad.speedScale).toBe(T.woundSpeed);
    g.units.team.damage(10);
    expect(g.units.team.taken).toBeCloseTo(10 * T.woundDamage);
  });

  it('the jam and the fog are passed to the game as events', () => {
    const g = headlessGame(world);
    const ev: string[] = [];
    g.bus.on('gunJammed', (e) => ev.push(`jam ${e.seconds}`));
    g.bus.on('fog', (e) => ev.push(`fog ${e.seconds}`));
    g.host.perform({ kind: 'jamGun', seconds: 30 });
    g.host.perform({ kind: 'fogIn', seconds: 120 });
    expect(ev).toEqual(['jam 30', 'fog 120']);
  });

  it('a jammed gun cannot fire until it clears', () => {
    const gun = new WeaponState(WEAPONS['105']);
    gun.jam(30);
    expect(gun.status).toBe('reloading');
    expect(gun.update(1, true, false, 1)).toBe(0);
    for (let t = 0; t < 30; t += 0.5) gun.update(0.5, true, false, 0);
    expect(gun.update(0.1, true, false, 1)).toBe(1);
  });

  it('fog rolls in, holds, and clears', () => {
    expect(fogEnvelope(120, 120, 12)).toBe(0);
    expect(fogEnvelope(114, 120, 12)).toBeCloseTo(0.5);
    expect(fogEnvelope(60, 120, 12)).toBe(1);
    expect(fogEnvelope(6, 120, 12)).toBeCloseTo(0.5);
    expect(fogEnvelope(0, 120, 12)).toBe(0);
  });

  it('the downed pilot: held long enough he is rescued (a bonus); enemies on him, he is taken', () => {
    const safe = headlessGame(world);
    safe.host.perform({ kind: 'downPilot', at: PILOT_DOWN });
    step(safe, T.pilotHold + 1);
    expect(safe.host.pilot!.state).toBe('rescued');
    expect(safe.host.bonuses).toContain('Pilot rescued');
    expect(safe.host.mission.flags.has('pilotDone')).toBe(true);

    const lost = headlessGame(world);
    lost.host.perform({ kind: 'downPilot', at: PILOT_DOWN });
    lost.units.spawnEnemy(INFANTRY.rifleman, PILOT_DOWN[0] + 5, PILOT_DOWN[1]);
    step(lost, 4);
    expect(lost.host.pilot!.state).toBe('captured');
    expect(lost.host.bonuses).toEqual([]);
  });

  it('the HVT run: a bonus when its car is a wreck, none when it escapes', () => {
    const g = headlessGame(world);
    g.host.start('vehicles');
    g.host.perform({ kind: 'spawnConvoy', path: 'hvt_escape', vehicles: ['suv'], tag: 'hvt' });
    const car = g.vehicles.vehicles.find((v) => v.tag === 'hvt')!;
    car.takeDamage(1e6, '105', car.position);
    g.host.perform({ kind: 'resolveHvt' });
    expect(g.host.bonuses).toEqual(['HVT destroyed']);

    const away = headlessGame(world);
    away.host.start('vehicles');
    away.host.perform({ kind: 'spawnConvoy', path: 'hvt_escape', vehicles: ['suv'], tag: 'hvt' });
    step(away, 150);
    expect(away.host.mission.flags.has('hvtEscaped')).toBe(true);
    away.host.perform({ kind: 'resolveHvt' });
    expect(away.host.bonuses).toEqual([]);
  });

  it('Kestrel 6 can break off an approach and leave, then be called in again', () => {
    const g = headlessGame(world);
    const h = g.host.helicopter;
    h.call(790, 560, 582, 296);
    for (let t = 0; t < 5; t += DT) h.update(DT);
    const y = h.position.y;
    h.abort();
    expect(h.state).toBe('departing');
    h.update(DT);
    expect(h.position.y).toBeGreaterThan(y - 1); // it climbs away, it doesn't drop to the ground
    for (let t = 0; t < 30; t += DT) h.update(DT);
    expect(h.state).toBe('gone');
    h.call(780, -760, 586, -364);
    expect(h.state).toBe('inbound');
  });

  it('bonuses add to the rating and show on the end screen', () => {
    const s = new MissionStats(new EventBus<GameEvents>());
    const plain = s.summary(150, 900);
    const bonus = s.summary(150, 900, ['Pilot rescued', 'HVT destroyed']);
    expect(rateMission(bonus).score - rateMission(plain).score).toBe(2 * T.bonusPoints);
    expect(summaryRows(bonus)).toContainEqual(['BONUS', 'Pilot rescued, HVT destroyed']);
    expect(summaryRows(plain).some(([k]) => k === 'BONUS')).toBe(false);
  });

  it('hitting the civilian bus fails the mission', async () => {
    const { Explosions } = await import('../combat/Explosions');
    const { Effects } = await import('../fx/Effects');
    const { Sensor } = await import('../gunship/Sensor');
    const { Gunship } = await import('../gunship/Gunship');
    const { SensorFX } = await import('../render/SensorFX');
    const { createRng } = await import('../core/rng');
    const g = headlessGame(world);
    g.host.start('village');
    g.host.perform({ kind: 'spawnConvoy', path: 'bus_route', vehicles: ['bus'], tag: 'bus' });
    const bus = g.vehicles.vehicles.find((v) => v.tag === 'bus')!;
    expect(bus.side).toBe('civilian');
    g.units.update(DT);
    const ship = new Gunship();
    const sensor = new Sensor(ship, { heightAt: () => 0 }, 1.6);
    const ex = new Explosions(
      new Effects(() => 0, createRng(1)),
      sensor,
      new SensorFX(),
      g.bus,
      (c, r) => g.units.targetsNear(c, r),
    );
    ex.detonate(
      new Vector3(bus.position.x + 1, bus.position.y, bus.position.z),
      WEAPONS['40'],
      true,
    );
    expect(g.failures).toContain('civilian_hit');
  });
});
