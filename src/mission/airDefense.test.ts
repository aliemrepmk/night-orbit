import { describe, expect, it } from 'vitest';
import { Gunship } from '../gunship/Gunship';
import { INFANTRY } from '../units/unitDefs';
import { MAP } from '../world/MapData';
import { doEveryPrompt, headlessGame, type HeadlessGame } from './headlessGame';

const DT = 1 / 30;

/** Runs the battle with a real gunship orbiting `center`, as Game does. */
function fly(g: HeadlessGame, ship: Gunship, seconds: number) {
  g.units.plane = ship;
  let tracers = 0;
  for (let t = 0; t < seconds; t += DT) {
    doEveryPrompt(g);
    ship.update(DT);
    g.host.update(DT, { x: 0, z: -2000 });
    g.units.update(DT);
    g.vehicles.update(DT);
    g.airDefense.update(DT, ship, (_f, _t, n) => (tracers += n));
  }
  return tracers;
}

describe('air defense in the mission (M8+ Phase E)', { timeout: 60_000 }, () => {
  it('the fields phase brings the ridge gun into action, and it fires at a gunship over the fields', () => {
    const g = headlessGame();
    g.units.team.invulnerable = true;
    g.host.start('fields');
    expect(g.airDefense.gun('aa_ridge')!.active).toBe(true);
    expect(g.airDefense.gun('aa_forest')!.active).toBe(false);
    const ship = new Gunship();
    ship.snapTo(MAP.zones.fields.center[0], MAP.zones.fields.center[1]);
    const tracers = fly(g, ship, 45);
    expect(tracers).toBeGreaterThan(30);
    expect(g.airDefense.hull).toBeLessThan(100);
  });

  it('AA guns are targets for blasts (in the unit grid, like vehicles)', () => {
    const g = headlessGame();
    g.units.update(DT); // the grid is rebuilt every tick
    const gun = g.airDefense.gun('aa_ridge')!;
    expect(g.units.targetsNear(gun.position, 5)).toContain(gun);
  });

  it('a MANPADS soldier near the gunship aims, then launches a missile', () => {
    const g = headlessGame();
    const ship = new Gunship();
    ship.snapTo(-440, 120);
    const e = g.units.spawnEnemy(INFANTRY.manpads, -440, 100)!;
    const launches: number[] = [];
    g.bus.on('missileLaunch', () => launches.push(1));
    fly(g, ship, 2);
    expect(launches).toHaveLength(0); // setting up first
    fly(g, ship, 12);
    expect(launches.length).toBeGreaterThanOrEqual(1);
    expect(e.launchCooldown).toBeGreaterThan(0);
  });

  it('the vehicles phase sends an AA truck that counts as a shooter once it is in place', () => {
    const g = headlessGame();
    g.host.start('vehicles');
    expect(g.vehicles.vehicles.some((v) => v.inUse && v.def.antiAir)).toBe(true);
    expect([...g.airDefense.trucks()].length).toBe(1);
  });
});
