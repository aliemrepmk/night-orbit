import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ORDNANCE } from '../gunship/airSupportDefs';
import { MAP } from '../world/MapData';
import { headlessGame } from './headlessGame';
import { largestFootprint } from './clinic';
import { POOLS } from './lines';

const DT = 1 / 30;

function step(g: ReturnType<typeof headlessGame>, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += DT) {
    g.host.update(DT, { x: 0, z: -2000 });
    g.units.update(DT);
    g.vehicles.update(DT);
  }
}

function heard(g: ReturnType<typeof headlessGame>) {
  const lines: string[] = [];
  g.host.radio.onLine = (l) => lines.push(l.text);
  return lines;
}

describe('MissionHost: every fail path ends the mission', () => {
  it('a round on the clinic fails the mission ("clinic_hit")', () => {
    const g = headlessGame();
    g.host.start('village');
    const c = largestFootprint(g.footprints)!.center;
    g.bus.emit('impact', {
      pos: new Vector3(c.x, 0, c.z),
      weapon: '105',
      distanceToAim: 0,
      enemiesHit: 0,
    });
    expect(g.failures).toEqual(['clinic_hit']);
    expect(g.host.mission.status).toBe('failed');
  });

  it('a near miss on the clinic only draws a warning', () => {
    const g = headlessGame();
    g.host.start('village');
    const lines = heard(g);
    const f = largestFootprint(g.footprints)!;
    // Just outside the 40 mm's full-damage radius from the clinic's wall.
    const z = f.center.z + f.half.z + ORDNANCE['40'].innerRadius + 2;
    g.bus.emit('impact', {
      pos: new Vector3(f.center.x, 0, z),
      weapon: '40',
      distanceToAim: 0,
      enemiesHit: 0,
    });
    step(g, 12); // let the story lines play out
    expect(g.failures).toEqual([]);
    expect(lines.some((l) => POOLS.clinicNearMiss.lines.includes(l))).toBe(true);
  });

  it('friendly fire fails the mission', () => {
    const g = headlessGame();
    g.host.start();
    g.bus.emit('missionFailed', { reason: 'friendly_fire' });
    expect(g.host.mission.status).toBe('failed');
  });

  it('an overrun team fails the mission', () => {
    const g = headlessGame();
    g.host.start('fields');
    g.units.team.damage(1e6);
    step(g, 0.1);
    expect(g.failures).toEqual(['team_overrun']);
    expect(g.host.mission.status).toBe('failed');
  });

  it('god mode (cheat G) keeps the team standing', () => {
    const g = headlessGame();
    g.host.start('fields');
    g.units.team.invulnerable = true;
    g.units.team.damage(1e6);
    step(g, 0.1);
    expect(g.failures).toEqual([]);
  });
});

describe('MissionHost: script actions on the real systems', () => {
  it('starting at a phase puts Ridgeback at its start, holding', () => {
    const g = headlessGame();
    g.host.start('village');
    expect(g.host.mission.phase!.id).toBe('village');
    const t = g.units.teamPosition;
    expect(Math.hypot(t.x - -240, t.z - 131)).toBeLessThan(1);
  });

  it('calibration prompts advance as the player does them', () => {
    const g = headlessGame();
    g.host.start();
    step(g, 5);
    expect(g.host.mission.objective).toMatch(/slew/i);
    g.host.playerDid('slewed');
    step(g, 0.2);
    expect(g.host.mission.objective).toMatch(/25 mm/);
    g.host.playerDid('weapon25');
    step(g, 0.2);
    expect(g.host.mission.objective).toMatch(/40 mm/);
  });

  it('the vehicles phase sends a tagged convoy down the north road', () => {
    const g = headlessGame();
    g.host.start('vehicles');
    expect(g.host.vehiclesAlive('convoy')).toBe(4);
    expect(g.host.focus).toBe('crossroads');
    const lead = g.vehicles.vehicles.find((v) => v.tag === 'convoy')!;
    expect(Math.hypot(lead.position.x - 340, lead.position.z - -640)).toBeLessThan(200);
  });

  it('cheat N skips to the next phase and clears the field', () => {
    const g = headlessGame();
    g.host.start('fields');
    step(g, 10);
    expect(
      g.units.aliveEnemies +
        (g.host as unknown as { d: { spawner: { queued: number } } }).d.spawner.queued,
    ).toBeGreaterThan(0);
    g.host.skipPhase();
    expect(g.host.mission.phase!.id).toBe('village');
    expect(g.units.aliveEnemies).toBe(0);
  });

  it('zone counts include soldiers still trickling in (a wave is not "clear" before it appears)', () => {
    const g = headlessGame();
    g.host.start('fields'); // 6 queued at the tree line
    expect(g.host.enemiesInZone('fields')).toBeGreaterThanOrEqual(6);
  });

  it(
    'the extraction: Kestrel 6 lands, Ridgeback boards, it lifts off, mission complete',
    { timeout: 60_000 },
    () => {
      const g = headlessGame();
      g.units.team.invulnerable = true;
      g.host.start('extraction');
      expect(g.host.mission.timer('kestrel')?.left).toBe(180);
      let t = 0;
      let landedAt = -1;
      while (t < 300 && g.host.mission.status === 'running') {
        step(g, 1);
        t += 1;
        g.units.killAllEnemies();
        g.vehicles.destroyAll();
        if (landedAt < 0 && g.host.helicopter.state === 'landed') landedAt = t;
      }
      expect(landedAt).toBeGreaterThan(150); // it shows up in the last 30 s
      expect(landedAt).toBeLessThanOrEqual(185);
      expect(g.units.boarded).toBe(true);
      expect(g.host.mission.status).toBe('complete');
      const pad = g.host.helicopter.padPosition;
      expect(
        Math.hypot(pad.x - MAP.zones.lz.center[0], pad.z - MAP.zones.lz.center[1]),
      ).toBeLessThan(40);
    },
  );
});

describe('MissionHost radio between phases', () => {
  it('a new phase drops the last phase’s unplayed lines (regression: calibration lines played in the village)', () => {
    const g = headlessGame();
    const lines: string[] = [];
    g.host.radio.onLine = (l) => lines.push(l.text);
    g.host.start();
    for (const f of ['slewed', 'weapon25', 'weapon40', 'weapon105', 'sensor']) g.host.playerDid(f);
    // The prompts are done at once: calibration ends and its lines (and the fields' first
    // lines) queue up behind the one on air.
    step(g, 4.5); // the first prompt comes 4 s in; the rest follow tick by tick
    expect(g.host.mission.phase!.id).toBe('fields');
    expect(g.host.radio.waiting).toBeGreaterThan(0); // the fields' opening lines wait
    lines.length = 0;
    g.host.skipPhase(); // → village
    step(g, 20);
    expect(lines.some((l) => /key 3|Press F|tree line|cleared on anything/.test(l))).toBe(false);
    expect(lines.some((l) => /clinic/i.test(l))).toBe(true);
  });
});

describe('MissionHost: Kestrel 6 under fire (M7)', () => {
  function onThePad() {
    const g = headlessGame();
    g.units.team.invulnerable = true;
    g.host.start('extraction');
    const lines: string[] = [];
    g.host.radio.onLine = (l) => lines.push(l.text);
    g.host.helicopter.call(700, 300, 582, 296);
    step(g, 25);
    expect(g.host.helicopter.state).toBe('landed');
    return { g, lines };
  }

  it('enemy fire that brings it down fails the mission ("helicopter_lost")', () => {
    const { g } = onThePad();
    g.host.helicopter.takeFire(1e5);
    step(g, 0.1);
    expect(g.failures).toEqual(['helicopter_lost']);
    expect(g.host.mission.status).toBe('failed');
  });

  it('Kestrel calls for help under fire, louder once badly hit', () => {
    const { g, lines } = onThePad();
    g.host.helicopter.takeFire(10);
    step(g, 8);
    expect(lines.some((l) => POOLS.heloUnderFire.lines.includes(l))).toBe(true);
    g.host.helicopter.takeFire(g.host.helicopter.maxHp * 0.6);
    step(g, 8);
    expect(lines.some((l) => POOLS.heloHurt.lines.includes(l))).toBe(true);
    expect(g.failures).toEqual([]);
  });

  it('the host registers it as a target the blasts and soldiers see', () => {
    const { g } = onThePad();
    expect(g.units.airTarget).toBe(g.host.helicopter);
    const near = g.units.targetsNear(g.host.helicopter.position, 5);
    expect(near).toContain(g.host.helicopter);
  });
});
