import { describe, expect, it } from 'vitest';
import { createWorld } from './battle';
import { doEveryPrompt, headlessGame, type HeadlessGame } from './headlessGame';
import { buildMission } from './missionDef';
import { rollTwists, type TwistRoll } from './twists';

const DT = 1 / 30;

/**
 * The cheat-kill bot (PLAN.md §10 M7 🧪): does every calibration prompt, and every half second
 * kills each enemy soldier, vehicle and AA gun within `reach` m of Ridgeback, as if the player
 * shot it. It never touches the civilian bus.
 */
function bot(g: HeadlessGame, reach: number) {
  let t = 0;
  return (dt: number) => {
    doEveryPrompt(g);
    t += dt;
    if (t < 0.5) return;
    t = 0;
    const team = g.units.teamPosition;
    const near = (x: number, z: number) => Math.hypot(x - team.x, z - team.z) <= reach;
    for (const e of g.units.enemies) {
      if (!e.alive || !near(e.position.x, e.position.z)) continue;
      e.takeDamage(1e6, '40', e.position);
      g.bus.emit('unitKilled', { kind: 'infantry', by: '40' });
    }
    for (const v of g.vehicles.vehicles) {
      if (!v.inUse || !v.alive || v.def.civilian || !near(v.position.x, v.position.z)) continue;
      v.takeDamage(1e7, '105', v.position);
      g.bus.emit('unitKilled', { kind: 'vehicle', by: '105' });
    }
    for (const a of g.airDefense.guns) {
      if (a.active && a.alive && near(a.position.x, a.position.z))
        a.takeDamage(1e6, '105', a.position);
    }
  };
}

/**
 * Plays the whole mission. Also measures pacing: the longest stretch (after calibration) with
 * no enemy on the field or on its way, i.e. the player just waiting.
 */
function play(g: HeadlessGame, reach: number, maxSeconds = 25 * 60) {
  const shoot = bot(g, reach);
  const phases: { id: string; at: number }[] = [];
  let lastPhase = -1;
  let time = 0;
  let quiet = 0;
  let longestQuiet = 0;
  g.host.start();
  while (time < maxSeconds && g.host.mission.status === 'running') {
    shoot(DT);
    g.host.update(DT, { x: 0, z: -2000 }); // the sensor looks somewhere harmless
    g.units.update(DT);
    g.vehicles.update(DT);
    g.airDefense.update(DT, null, () => {}); // reports destroyed AA guns
    time += DT;
    if (g.host.mission.phaseIndex !== lastPhase) {
      lastPhase = g.host.mission.phaseIndex;
      phases.push({ id: g.host.mission.phase!.id, at: Math.round(time) });
    }
    const busy = g.units.aliveEnemies > 0 || g.spawner.queued > 0 || g.vehicles.alive > 0;
    quiet = busy || g.host.mission.phaseIndex === 0 ? 0 : quiet + DT;
    longestQuiet = Math.max(longestQuiet, quiet);
  }
  return { time, phases, longestQuiet };
}

/** Three runs that between them cover every extraction twist and every side event. */
const COVERAGE: TwistRoll[] = [
  { seed: 1, extraction: 'kestrelAbort', side: ['clinicAssault', 'mortar', 'downedPilot'] },
  { seed: 2, extraction: 'quarryOverrun', side: ['hvt', 'bus', 'wounded'] },
  { seed: 3, extraction: 'holdTheLine', side: ['fog', 'jam', 'manpadsAmbush'] },
];

describe('auto-play: the whole mission headless (M7 done-when, M8+ Phase F twists)', () => {
  const world = createWorld();
  for (const roll of COVERAGE) {
    it(
      `${roll.extraction} + ${roll.side.join(', ')}: a bot that keeps Ridgeback safe plays every phase to MISSION COMPLETE`,
      { timeout: 120_000 },
      () => {
        const g = headlessGame(world, roll);
        const { time, phases, longestQuiet } = play(g, 900); // about what the sensor can reach
        expect(g.failures).toEqual([]);
        expect(g.host.mission.status).toBe('complete');
        expect(phases.map((p) => p.id)).toEqual(buildMission(roll).phases.map((p) => p.id));
        // Every step fired on its own condition: no safety-valve timeout was needed.
        expect(g.host.mission.timedOut).toEqual([]);
        expect(g.units.boarded).toBe(true);
        // PLAN.md §8 / M8+: 12–17 min for a player (a perfect bot is quicker).
        expect(time).toBeGreaterThan(7 * 60);
        expect(time).toBeLessThan(22 * 60);
        // Pacing (M8+ Phase F): never long with nothing to shoot at.
        // (Measured with a bot that kills every group the moment it appears, so a player's
        // field is busier than this.)
        expect(longestQuiet).toBeLessThan(70);
      },
    );
  }

  it(
    'random seeds also finish (a bot that only shoots what comes close: the safety valves hold)',
    { timeout: 180_000 },
    () => {
      for (const seed of [11, 12]) {
        const g = headlessGame(world, rollTwists(seed));
        g.units.team.invulnerable = true;
        g.host.helicopter.invulnerable = true;
        play(g, 60, 45 * 60);
        expect(g.host.mission.status, `seed ${seed}`).toBe('complete');
      }
    },
  );
});
