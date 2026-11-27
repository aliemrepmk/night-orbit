import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import type { FailReason } from '../core/events';
import { ratingBreakdown, rateMission, type MissionSummary } from '../mission/stats';
import {
  afterAction,
  cells,
  FAIL_TIPS,
  holdStatus,
  incidentReport,
  missionTime,
  phaseName,
  recordRows,
  timeline,
  type HoldSnapshot,
} from './reports';

const gun = (status: 'ready' | 'cycling' | 'reloading' | 'overheated', heat = 0, rounds = 0) => ({
  status,
  heat,
  rounds,
  capacity: 5,
});

const snap: HoldSnapshot = {
  objective: 'Cover Ridgeback through the village',
  phase: 'village',
  seconds: 401,
  team: 0.82,
  hull: 1,
  guns: { '25': gun('ready', 0.3), '40': gun('reloading', 0, 0), '105': gun('ready') },
  flares: 2,
  strikeCooldown: { gunrun: 0, bomb: 41.2 },
};

describe('HOLD status card (M10+)', () => {
  it('reads the objective, phase and mission time', () => {
    const h = holdStatus(snap);
    expect(h.objective).toBe('COVER RIDGEBACK THROUGH THE VILLAGE');
    expect(h.phase).toBe('PL 2 · VILLAGE');
    expect(h.time).toBe('T+ 06:41');
  });

  it('shows gauges as 10 cells, colored by health', () => {
    const [team, hull, heat, clip] = holdStatus(snap).gauges;
    expect([team.filled, team.value, team.tone]).toEqual([8, '82%', 'go']);
    expect(hull.filled).toBe(10);
    expect(heat.value).toBe('30%');
    expect([clip.value, clip.tone]).toEqual(['0/5', 'warn']); // reloading
    const low = holdStatus({ ...snap, team: 0.2 }).gauges[0];
    expect(low.tone).toBe('bad');
  });

  it('says when each strike rearms, and warns about the last flares', () => {
    const [g105, flares, run, bomb] = holdStatus(snap).systems;
    expect(g105).toMatchObject({ value: 'READY', tone: 'go' });
    expect(flares).toMatchObject({ value: `2 / ${CONFIG.airDefense.flares}`, tone: 'warn' });
    expect(run).toMatchObject({ value: 'READY', tone: 'go' });
    expect(bomb).toMatchObject({ value: 'REARM 0:42', tone: 'warn' });
  });

  it('never shows an empty gauge for any health at all, and clamps', () => {
    expect(cells(0.01)).toBe(1);
    expect(cells(0)).toBe(0);
    expect(cells(1.7)).toBe(10);
    expect(missionTime(-3)).toBe('T+ 00:00');
    expect(missionTime(3725)).toBe('T+ 62:05');
    expect(phaseName('mystery')).toBe('MYSTERY');
  });
});

describe('MISSION ABORTED incident report (M10+)', () => {
  it('names the cause, place, time, team and last radio call', () => {
    const r = incidentReport({
      reason: 'team_overrun',
      phase: 'village',
      grid: 'E4',
      seconds: 401,
      team: 0,
      lastCall: { speaker: 'RIDGEBACK', text: 'They are on top of us!' },
    });
    expect(r.title).toBe('RIDGEBACK OVERRUN');
    expect(r.rows.map((x) => x.value)).toEqual([
      'PL 2 · VILLAGE · E4',
      'T+ 06:41',
      '0% · NO CONTACT',
      'RIDGEBACK: “They are on top of us!”',
    ]);
    expect(r.rows[2].tone).toBe('bad');
  });

  it('has a tip for every way to fail, and leaves out a last call when there was none', () => {
    const reasons = Object.keys(FAIL_TIPS) as FailReason[];
    expect(reasons.length).toBeGreaterThanOrEqual(7);
    for (const reason of reasons) {
      const r = incidentReport({
        reason,
        phase: 'fields',
        grid: 'C5',
        seconds: 10,
        team: 1,
        lastCall: null,
      });
      expect(r.tip.length).toBeGreaterThan(20);
      expect(r.rows).toHaveLength(3);
    }
  });
});

describe('AFTER-ACTION REPORT (M10+)', () => {
  const summary: MissionSummary = {
    kills: 212,
    impacts: 300,
    hits: 114,
    accuracy: 0.38,
    damageTaken: 54,
    dangerClose: 1,
    seconds: 1012,
    bonuses: ['pilot'],
  };
  const a = afterAction({
    summary,
    rating: rateMission(summary),
    breakdown: ratingBreakdown(summary),
    killsBy: { '25': 61, '40': 88, '105': 52, gunrun: 6, bomb: 5 },
    shots: { '25': 1210, '40': 466, '105': 98 },
    strikes: { gunrun: 3, bomb: 1 },
    teamLowest: 0.61,
    hull: 0.88,
  });

  it('shows the grade, the score and a breakdown that adds up to it', () => {
    expect(a.score).toBe(`SCORE ${rateMission(summary).score} / 100`);
    const num = (v: string) => Number(v.replace('−', '-'));
    const total = a.breakdown.reduce((t, r) => t + num(r.value), 0);
    expect(Math.abs(total - rateMission(summary).score)).toBeLessThanOrEqual(a.breakdown.length); // rounding per row
    expect(a.breakdown.at(-1)?.label).toBe('BONUS · PILOT');
  });

  it('bars kills per weapon against the best one; strikes are summed', () => {
    expect(a.weapons.map((w) => [w.label, w.kills])).toEqual([
      ['25 MM', 61],
      ['40 MM', 88],
      ['105 MM', 52],
      ['STRIKES', 11],
    ]);
    expect(a.weapons[1].share).toBe(1);
    expect(a.engagement[0].value).toBe('25 MM 1,210 · 40 MM 466 · 105 MM 98');
    expect(a.engagement[2].value).toBe('3 GUN RUN · 1 BOMB');
  });

  it('compares the time with par and colors the outcome', () => {
    const time = a.outcome.find((r) => r.label === 'TIME')!;
    expect(time.value).toBe('16:52  (PAR 15:00)');
    expect(time.tone).toBe('warn');
    expect(a.outcome.find((r) => r.label === 'LOWEST TEAM HEALTH')!.tone).toBe('go');
  });

  it('builds a timeline from the phase log and the ending', () => {
    const t = timeline(
      [
        { id: 'calibration', at: 0 },
        { id: 'fields', at: 62 },
      ],
      { at: 1012, text: 'RIDGEBACK ABOARD', tone: 'go' },
    );
    expect(t.map((e) => `${e.time} ${e.text}`)).toEqual([
      'T+ 00:00 SP · CALIBRATION',
      'T+ 01:02 PL 1 · FIELDS',
      'T+ 16:52 RIDGEBACK ABOARD',
    ]);
  });

  it('keeps the record rows of the old end screens', () => {
    expect(recordRows(summary).map((r) => r.label)).toEqual([
      'KILLS',
      'ACCURACY',
      'DAMAGE TAKEN',
      'DANGER CLOSE',
      'TIME',
    ]);
  });
});
