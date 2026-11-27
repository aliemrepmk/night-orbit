import { describe, it } from 'vitest';
import { createWorld } from './battle';
import { GunnerSim, SKILLS, type RunReport, type Skill } from './gunnerBot';
import { rollTwists } from './twists';

/**
 * The M10 balance report: the gunner bot plays the whole mission over many seeds at each
 * skill and prints how long it took and how much it hurt. Not part of `npm run check` (it
 * takes minutes): run `npm run balance` (optionally `SEEDS=20 SKILLS=sharp,average`).
 */
const SEEDS = Number(process.env.SEEDS ?? 8);
const SKILL_NAMES = (process.env.SKILLS ?? 'sharp,average,rookie').split(',');

function line(r: RunReport): string {
  const phases = r.phases.map((p) => `${p.id.slice(0, 4)} ${p.seconds}`).join(' · ');
  const shots = `${r.shots['25']}/${r.shots['40']}/${r.shots['105']}`;
  const end = r.result === 'complete' ? `${r.grade} ${r.score}` : `${r.result} ${r.failure}`;
  return [
    `seed ${String(r.seed).padStart(3)}`,
    `${(r.seconds / 60).toFixed(1).padStart(5)} min`,
    end.padEnd(26),
    `team min ${String(r.teamMin).padStart(3)}% taken ${String(r.teamTaken).padStart(4)}`,
    `hull ${String(r.hull).padStart(3)}% msl ${r.missileHits}/${r.missiles}`,
    `shots ${shots} air ${r.strikes.gunrun}/${r.strikes.bomb}${r.strikesAborted ? ` (-${r.strikesAborted})` : ''} kills ${r.kills} dc ${r.dangerClose}`,
    phases,
    r.timeouts.length ? `TIMEOUTS ${r.timeouts.join(',')}` : '',
    r.roll,
  ].join(' | ');
}

describe.runIf(process.env.BALANCE)('balance report (M10, gunner bot)', () => {
  const world = createWorld();
  for (const name of SKILL_NAMES) {
    const skill: Skill = SKILLS[name as keyof typeof SKILLS];
    it(`${name}: ${SEEDS} seeds`, { timeout: 60 * 60_000 }, () => {
      const runs: RunReport[] = [];
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = new GunnerSim(world, rollTwists(seed), skill).run();
        runs.push(r);
        console.log(`[${name}] ${line(r)}`);
      }
      const done = runs.filter((r) => r.result === 'complete');
      const avg = (f: (r: RunReport) => number, rs = runs) =>
        rs.length ? (rs.reduce((a, r) => a + f(r), 0) / rs.length).toFixed(1) : '-';
      console.log(
        `[${name}] SUMMARY complete ${done.length}/${runs.length}` +
          ` | fails ${
            runs
              .filter((r) => r.result === 'failed')
              .map((r) => r.failure)
              .join(',') || '-'
          }` +
          ` | avg min ${avg((r) => r.seconds / 60, done)} | team min ${avg((r) => r.teamMin)}%` +
          ` | hull ${avg((r) => r.hull)}% | score ${avg((r) => r.score, done)}` +
          ` | timeouts ${runs.reduce((a, r) => a + r.timeouts.length, 0)}`,
      );
    });
  }
});
