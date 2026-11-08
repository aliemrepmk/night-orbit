import { describe, expect, it } from 'vitest';
import { createWorld } from './battle';
import { doEveryPrompt, headlessGame, type HeadlessGame } from './headlessGame';

const DT = 1 / 30;

/** Plays `seconds` of the mission with nobody shooting (the sensor looks somewhere harmless). */
function play(g: HeadlessGame, seconds: number) {
  for (let t = 0; t < seconds; t += DT) {
    doEveryPrompt(g);
    g.host.update(DT, { x: 0, z: -2000 });
    g.units.update(DT);
    g.vehicles.update(DT);
  }
}

/** A fingerprint of the run's state: anything leaking from a previous run would change it. */
function snapshot(g: HeadlessGame) {
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    phase: g.host.mission.phaseIndex,
    team: [r(g.units.teamPosition.x), r(g.units.teamPosition.z), r(g.units.team.value)],
    enemies: g.units.enemies.filter((e) => e.alive).map((e) => [r(e.position.x), r(e.position.z)]),
    vehicles: g.vehicles.alive,
  };
}

describe('restart (M8): a new run on the same world', { timeout: 120_000 }, () => {
  it('starts fresh: phase 0, full health, no enemies, no stats, every cover point free', () => {
    const world = createWorld();
    const first = headlessGame(world);
    first.host.start('village');
    play(first, 90);
    expect(first.units.enemies.some((e) => e.alive)).toBe(true);
    expect(world.world.cover.points.some((p) => !world.world.cover.isFree(p))).toBe(true);

    const second = headlessGame(world);
    expect(world.world.cover.points.every((p) => world.world.cover.isFree(p))).toBe(true);
    second.host.start();
    expect(second.host.mission.phaseIndex).toBe(0);
    expect(second.units.team.value).toBe(second.units.team.max);
    expect(second.units.team.taken).toBe(0);
    expect(second.units.enemies.filter((e) => e.alive)).toHaveLength(0);
    expect(second.stats.summary(0, 0).kills).toBe(0);
    // The old run's bus no longer reaches the new run.
    first.bus.emit('unitKilled', { kind: 'infantry', by: '105' });
    expect(second.stats.kills).toBe(0);
  });

  it('plays exactly like a first run on a brand-new world (nothing leaks between runs)', () => {
    const world = createWorld();
    const dirty = headlessGame(world);
    dirty.host.start('village');
    play(dirty, 60);

    const restarted = headlessGame(world);
    const fresh = headlessGame();
    restarted.host.start('fields');
    fresh.host.start('fields');
    play(restarted, 60);
    play(fresh, 60);
    expect(snapshot(restarted)).toEqual(snapshot(fresh));
    expect(snapshot(fresh).enemies.length).toBeGreaterThan(0);
  });
});
