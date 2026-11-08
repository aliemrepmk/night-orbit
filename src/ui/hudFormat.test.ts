import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../gunship/weaponDefs';
import { WeaponState } from '../gunship/Weapons';
import {
  bar,
  countdown,
  failReasonText,
  gunLine,
  inboundLine,
  kestrelLine,
  objectiveLine,
  subtitleLine,
  timerLine,
  strikeLine,
  teamLine,
  type GunReadout,
  flareLine,
  hullLine,
} from './hudFormat';

function readout(w: WeaponState): GunReadout {
  return {
    label: w.def.label,
    fireMode: w.def.fireMode,
    status: w.status,
    rounds: w.rounds,
    capacity: w.def.capacity,
    heat: w.heat,
    reloadLeft: w.reloadLeft,
  };
}

describe('HUD weapon lines', () => {
  it('rounds countdowns up, so a gun never shows 0.0 while still loading', () => {
    expect(countdown(0.01)).toBe('0.1');
    expect(countdown(1.4)).toBe('1.4');
    expect(countdown(2.04)).toBe('2.1');
  });

  it('draws heat as a bar', () => {
    expect(bar(0)).toBe('▯▯▯▯▯▯▯▯');
    expect(bar(0.5)).toBe('▮▮▮▮▯▯▯▯');
    expect(bar(2)).toBe('▮▮▮▮▮▮▮▮');
  });

  it('shows the 25 mm barrel heat, then an overheat countdown', () => {
    const w = new WeaponState(WEAPONS['25']);
    expect(gunLine(readout(w), true)).toBe('▶ 25MM  HEAT ▯▯▯▯▯▯▯▯');
    w.heat = 1;
    w.reloadLeft = 2.04;
    expect(gunLine(readout(w), true)).toBe('▶ 25MM  OVERHEAT 2.1');
  });

  it('shows the 40 mm clip as filled and empty boxes, then RELOAD', () => {
    const w = new WeaponState(WEAPONS['40']);
    w.rounds = 3;
    expect(gunLine(readout(w), false)).toBe('  40MM  ■■■□□');
    w.rounds = 0;
    w.reloadLeft = 1.4;
    expect(gunLine(readout(w), false)).toBe('  40MM  RELOAD 1.4');
  });

  it('shows the 105 mm as READY or a LOADING countdown', () => {
    const w = new WeaponState(WEAPONS['105']);
    expect(gunLine(readout(w), false)).toBe('  105MM READY');
    w.reloadLeft = 3.25;
    expect(gunLine(readout(w), false)).toBe('  105MM LOADING 3.3');
  });
});

describe('teamLine', () => {
  it('shows Ridgeback health as a 10-cell bar and a percentage', () => {
    expect(teamLine(100, 100, false)).toBe('RIDGEBACK ▮▮▮▮▮▮▮▮▮▮ 100%');
    expect(teamLine(82, 100, false)).toBe('RIDGEBACK ▮▮▮▮▮▮▮▮▯▯  82%');
  });

  it('flags UNDER FIRE and never reads 0% while the team is still standing', () => {
    expect(teamLine(0.3, 100, true)).toBe('RIDGEBACK ▯▯▯▯▯▯▯▯▯▯   1%  UNDER FIRE');
    expect(teamLine(0, 100, true)).toBe('RIDGEBACK ▯▯▯▯▯▯▯▯▯▯   0%  UNDER FIRE');
  });
});

describe('failReasonText', () => {
  it('names every fail reason', () => {
    expect(failReasonText('friendly_fire')).toContain('FRIENDLY FIRE');
    expect(failReasonText('team_overrun')).toContain('OVERRUN');
    expect(failReasonText('clinic_hit')).toContain('CLINIC');
    expect(failReasonText('helicopter_friendly_fire')).toContain('KESTREL 6');
    expect(failReasonText('helicopter_lost')).toContain('SHOT DOWN');
  });
});

describe('HUD air-support lines', () => {
  it('shows READY or the rearm countdown (rounded up), with ▶ on the strike being aimed', () => {
    expect(strikeLine('GUN RUN', 0, true)).toBe('▶ GUN RUN READY');
    expect(strikeLine('BOMB', 41.2, false)).toBe('  BOMB    REARM 42');
    expect(strikeLine('BOMB', 0.01, false)).toBe('  BOMB    REARM 1');
  });

  it('counts an inbound strike down in whole seconds, never showing 0', () => {
    expect(inboundLine('HAMMER 1-1', 4.2)).toBe('HAMMER 1-1 INBOUND 5');
    expect(inboundLine('SABRE 2-2', 0.05)).toBe('SABRE 2-2 INBOUND 1');
  });
});

describe('HUD mission lines (M7)', () => {
  it('radio subtitles name the speaker', () => {
    expect(subtitleLine('FCO', 'Splash. Good hits.')).toBe('[FCO] Splash. Good hits.');
  });

  it('the objective reads in capitals, and is empty with no objective', () => {
    expect(objectiveLine('Hold the square')).toBe('OBJ: HOLD THE SQUARE');
    expect(objectiveLine('')).toBe('');
  });

  it('countdowns read mm:ss, rounded up, never negative', () => {
    expect(timerLine('KESTREL 6', 180)).toBe('KESTREL 6  03:00');
    expect(timerLine('KESTREL 6', 179.2)).toBe('KESTREL 6  03:00');
    expect(timerLine('KESTREL 6', 59.5)).toBe('KESTREL 6  01:00');
    expect(timerLine('KESTREL 6', 0.4)).toBe('KESTREL 6  00:01');
    expect(timerLine('KESTREL 6', -3)).toBe('KESTREL 6  00:00');
  });
});

describe('HUD Kestrel 6 line (M7)', () => {
  it('shows its health and when it is under fire', () => {
    expect(kestrelLine(400, 400, false)).toBe('KESTREL 6 ▮▮▮▮▮▮▮▮▮▮ 100%');
    expect(kestrelLine(200, 400, true)).toBe('KESTREL 6 ▮▮▮▮▮▯▯▯▯▯  50%  UNDER FIRE');
  });
});

describe('air-defense HUD lines (M8+ Phase E)', () => {
  it('shows the hull with a bar and percent, and ENGINE OUT once an engine is lost', () => {
    expect(hullLine(100, 100, false)).toBe(`HULL      ${bar(1, 10)} 100%`);
    expect(hullLine(29, 100, true)).toMatch(/ 29% {2}ENGINE OUT$/);
  });

  it('shows flares left as boxes and the key', () => {
    expect(flareLine(4, 6)).toBe('FLR ■■■■□□  X');
    expect(flareLine(0, 6)).toBe('FLR □□□□□□  X');
  });
});
