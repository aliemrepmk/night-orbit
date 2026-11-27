import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import {
  formatDuration,
  MissionStats,
  rateMission,
  ratingBreakdown,
  summaryRows,
  type MissionSummary,
} from './stats';

const R = CONFIG.rating;
const clean: MissionSummary = {
  kills: 80,
  impacts: 100,
  hits: Math.round(R.accuracyPar * 100),
  accuracy: R.accuracyPar,
  damageTaken: 0,
  dangerClose: 0,
  seconds: R.parSeconds,
};

describe('MissionStats', () => {
  it('counts player kills (not Ridgeback’s), gun impacts and hits, and danger-close calls', () => {
    const bus = new EventBus<GameEvents>();
    const s = new MissionStats(bus);
    const pos = new Vector3();
    bus.emit('unitKilled', { kind: 'infantry', by: '105' });
    bus.emit('unitKilled', { kind: 'vehicle', by: 'bomb' });
    bus.emit('unitKilled', { kind: 'infantry', by: 'team' });
    bus.emit('impact', { pos, weapon: '25', distanceToAim: 0, enemiesHit: 1 });
    bus.emit('impact', { pos, weapon: '40', distanceToAim: 0, enemiesHit: 0 });
    bus.emit('impact', { pos, weapon: '105', distanceToAim: 0, enemiesHit: 3 });
    bus.emit('impact', { pos, weapon: 'gunrun', distanceToAim: 0, enemiesHit: 2 }); // air support
    bus.emit('dangerClose', { weapon: '105', distance: 20 });
    const sum = s.summary(42, 600);
    expect(sum).toEqual({
      bonuses: [],
      kills: 2,
      impacts: 3,
      hits: 2,
      accuracy: 2 / 3,
      damageTaken: 42,
      dangerClose: 1,
      seconds: 600,
    });
  });

  it('reads 0 % accuracy (not NaN) when nothing was fired', () => {
    const s = new MissionStats(new EventBus<GameEvents>());
    expect(s.summary(0, 1).accuracy).toBe(0);
    expect(summaryRows(s.summary(0, 1))).toContainEqual(['ACCURACY', '--']);
  });
});

describe('MissionStats per weapon (M10+ after-action report)', () => {
  it('counts kills per gun and strike, rounds per gun and strikes called', () => {
    const bus = new EventBus<GameEvents>();
    const st = new MissionStats(bus);
    bus.emit('unitKilled', { kind: 'infantry', by: '25' });
    bus.emit('unitKilled', { kind: 'infantry', by: '105' });
    bus.emit('unitKilled', { kind: 'infantry', by: '105' });
    bus.emit('unitKilled', { kind: 'vehicle', by: 'bomb' });
    bus.emit('unitKilled', { kind: 'infantry', by: 'team' });
    for (let i = 0; i < 3; i++) bus.emit('shotFired', { weapon: '40' });
    bus.emit('strikeCalled', { strike: 'gunrun', x: 0, z: 0, danger: false });
    expect(st.killsBy).toEqual({ '25': 1, '40': 0, '105': 2, gunrun: 0, bomb: 1 });
    expect(st.kills).toBe(4); // Ridgeback's own kills are not the player's
    expect(st.shots).toEqual({ '25': 0, '40': 3, '105': 0 });
    expect(st.strikes).toEqual({ gunrun: 1, bomb: 0 });
  });
});

describe('ratingBreakdown', () => {
  it('adds up to the score rateMission gives', () => {
    const s = {
      kills: 100,
      impacts: 200,
      hits: 90,
      accuracy: 0.45,
      damageTaken: 60,
      dangerClose: 2,
      seconds: 17 * 60,
      bonuses: ['pilot'],
    };
    const b = ratingBreakdown(s);
    const raw = 100 - b.damage - b.danger - b.time + b.accuracy + b.bonus;
    expect(b.score).toBe(Math.round(Math.min(100, Math.max(0, raw))));
    expect(rateMission(s).score).toBe(b.score);
    expect(b.damage).toBeGreaterThan(0);
    expect(b.time).toBeGreaterThan(0);
    expect(b.bonus).toBe(CONFIG.twists.bonusPoints);
  });
});

describe('rateMission', () => {
  it('gives a clean run at par a perfect S', () => {
    expect(rateMission(clean)).toEqual({ score: 100, grade: 'S', label: R.grades[0].label });
  });

  it('takes points for damage taken, capped', () => {
    expect(rateMission({ ...clean, damageTaken: 100 }).score).toBe(
      Math.round(100 - 100 * R.damagePerPoint),
    );
    expect(rateMission({ ...clean, damageTaken: 1e5 }).score).toBe(100 - R.damageMax);
  });

  it('takes points per danger-close impact, capped', () => {
    expect(rateMission({ ...clean, dangerClose: 2 }).score).toBe(100 - 2 * R.perDangerClose);
    expect(rateMission({ ...clean, dangerClose: 99 }).score).toBe(100 - R.dangerCloseMax);
  });

  it('accuracy above par makes up for mistakes, below par costs points, both capped', () => {
    const sloppy = { ...clean, dangerClose: 3 };
    const sharp = rateMission({ ...sloppy, accuracy: R.accuracyPar + 0.2 }).score;
    expect(sharp).toBeGreaterThan(rateMission(sloppy).score);
    expect(rateMission({ ...clean, accuracy: 0 }).score).toBe(
      100 - Math.min(R.accuracyMax, R.accuracyPar * R.accuracyScale),
    );
    expect(rateMission({ ...sloppy, accuracy: 1 }).score).toBe(
      Math.min(100, 100 - 3 * R.perDangerClose + R.accuracyMax),
    );
  });

  it('takes points for finishing late, capped', () => {
    expect(rateMission({ ...clean, seconds: R.parSeconds + 120 }).score).toBe(
      100 - 2 * R.perMinuteOver,
    );
    expect(rateMission({ ...clean, seconds: 1e6 }).score).toBe(100 - R.timeMax);
  });

  it('maps scores to grades at the configured boundaries, never below 0', () => {
    const worst = rateMission({
      ...clean,
      damageTaken: 1e5,
      dangerClose: 99,
      accuracy: 0,
      seconds: 1e6,
    });
    expect(worst.score).toBeGreaterThanOrEqual(0);
    expect(worst.grade).toBe(R.grades[R.grades.length - 1].grade);
    for (const g of R.grades) {
      if (g.min === 0) continue;
      const lost = 100 - g.min; // land exactly on the boundary through danger-close points
      const cfg = { ...R, perDangerClose: 1, dangerCloseMax: 100 };
      expect(rateMission({ ...clean, dangerClose: lost }, cfg).grade).toBe(g.grade);
    }
  });
});

describe('end-screen text', () => {
  it('formats durations as m:ss, and h:mm:ss past an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('lists kills, accuracy, damage taken, danger close and time', () => {
    const rows = summaryRows({
      ...clean,
      hits: 37,
      impacts: 120,
      accuracy: 37 / 120,
      damageTaken: 12.6,
    });
    expect(rows.map(([k]) => k)).toEqual([
      'KILLS',
      'ACCURACY',
      'DAMAGE TAKEN',
      'DANGER CLOSE',
      'TIME',
    ]);
    expect(rows[1][1]).toBe('31%  (37/120)');
    expect(rows[2][1]).toBe('13');
    expect(rows[4][1]).toBe('15:00');
  });
});
