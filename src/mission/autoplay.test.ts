import { describe, expect, it } from 'vitest';
import { doEveryPrompt, headlessGame, type HeadlessGame } from './headlessGame';
import { MISSION } from './missionDef';

const DT = 1 / 30;

/**
 * The cheat-kill bot (PLAN.md §10 M7 🧪): does every calibration prompt, and every half second
 * kills each enemy soldier and vehicle within `reach` m of Ridgeback, as if the player shot it.
 */
function bot(g: HeadlessGame, reach: number) {
  let t = 0;
  return (dt: number) => {
    doEveryPrompt(g);
    t += dt;
    if (t < 0.5) return;
    t = 0;
    const team = g.units.teamPosition;
    for (const e of g.units.enemies) {
      if (!e.alive || Math.hypot(e.position.x - team.x, e.position.z - team.z) > reach) continue;
      e.takeDamage(1e6, '40', e.position);
      g.bus.emit('unitKilled', { kind: 'infantry', by: '40' });
    }
    for (const v of g.vehicles.vehicles) {
      if (!v.inUse || !v.alive) continue;
      if (Math.hypot(v.position.x - team.x, v.position.z - team.z) > reach) continue;
      v.takeDamage(1e7, '105', v.position);
      g.bus.emit('unitKilled', { kind: 'vehicle', by: '105' });
    }
  };
}

function play(g: HeadlessGame, reach: number, maxSeconds = 25 * 60) {
  const shoot = bot(g, reach);
  const phases: { id: string; at: number }[] = [];
  let lastPhase = -1;
  let time = 0;
  g.host.start();
  while (time < maxSeconds && g.host.mission.status === 'running') {
    shoot(DT);
    g.host.update(DT, { x: 0, z: -2000 }); // the sensor looks somewhere harmless
    g.units.update(DT);
    g.vehicles.update(DT);
    time += DT;
    if (g.host.mission.phaseIndex !== lastPhase) {
      lastPhase = g.host.mission.phaseIndex;
      phases.push({ id: g.host.mission.phase!.id, at: Math.round(time) });
    }
  }
  return { time, phases };
}

describe('auto-play: the whole mission headless (M7 done-when)', () => {
  it(
    'a bot that keeps Ridgeback safe plays every phase in order to MISSION COMPLETE',
    { timeout: 120_000 },
    () => {
      const g = headlessGame();
      const { time, phases } = play(g, 900); // about what the sensor can reach from the orbit
      expect(g.failures).toEqual([]);
      expect(g.host.mission.status).toBe('complete');
      expect(phases.map((p) => p.id)).toEqual(MISSION.phases.map((p) => p.id));
      // Every step fired on its own condition: no safety-valve timeout was needed.
      expect(g.host.mission.timedOut).toEqual([]);
      // Ridgeback walked the whole way and flew out.
      expect(g.units.boarded).toBe(true);
      // PLAN.md §8 target: 12–15 minutes (a perfect bot is quicker than a player).
      expect(time).toBeGreaterThan(7 * 60);
      expect(time).toBeLessThan(18 * 60);
    },
  );

  it(
    'a bot that only shoots what comes close still finishes: the safety valves prevent soft-locks',
    { timeout: 120_000 },
    () => {
      const g = headlessGame();
      // This test is about soft-locks, not about surviving: god mode for the team and Kestrel 6.
      g.units.team.invulnerable = true;
      g.host.helicopter.invulnerable = true;
      play(g, 60);
      expect(g.host.mission.status).toBe('complete');
    },
  );
});
