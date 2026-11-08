import { describe, expect, it } from 'vitest';
import type { ZoneId } from '../world/mapTypes';
import { Mission, type HelicopterStage, type MissionWorld } from './Mission';
import type { Action, MissionDef } from './missionTypes';
import {
  allOf,
  anyOf,
  completeMission,
  flag,
  helicopter,
  moveTeam,
  nextPhase,
  routZone,
  say,
  setFlag,
  setObjective,
  startTimer,
  teamReached,
  timeInPhase,
  timeInStep,
  timerBelow,
  timerDone,
  vehiclesDestroyed,
  zoneEnemiesBelow,
} from './script';

/** A world made of plain fields the test can set, recording every action it is asked to do. */
function fakeWorld() {
  const w = {
    reached: new Set<string>(),
    enemies: {} as Partial<Record<ZoneId, number>>,
    vehicles: {} as Record<string, number>,
    heli: 'none' as HelicopterStage,
    done: [] as Action[],
  };
  const world: MissionWorld = {
    teamReached: (r) => w.reached.has(r),
    enemiesInZone: (z) => w.enemies[z] ?? 0,
    vehiclesAlive: (t) => w.vehicles[t] ?? 0,
    helicopterStage: () => w.heli,
    perform: (a) => w.done.push(a),
  };
  return { w, world };
}

const tick = (m: Mission, seconds: number, dt = 0.1) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) m.update(dt);
};

const kinds = (actions: Action[]) => actions.map((a) => a.kind);

describe('Mission runner', () => {
  const def: MissionDef = {
    id: 'test',
    phases: [
      {
        id: 'one',
        objective: 'First',
        teamStart: [0, 0],
        onEnter: [say('FCO', 'hello'), moveTeam('r1')],
        steps: [
          { when: timeInPhase(2), do: [say('NAV', 'two seconds')] },
          { when: teamReached('r1'), do: [setObjective('Second objective')] },
          { when: zoneEnemiesBelow('fields', 2), do: [nextPhase(), say('FCO', 'after next')] },
        ],
      },
      {
        id: 'two',
        objective: 'Two',
        teamStart: [5, 5],
        onEnter: [setFlag('entered')],
        steps: [{ when: flag('entered'), do: [completeMission()] }],
      },
    ],
  };

  it('runs onEnter at start, then each step once, in order', () => {
    const { w, world } = fakeWorld();
    w.enemies.fields = 5;
    const m = new Mission(def, world);
    m.start();
    expect(m.objective).toBe('First');
    expect(kinds(w.done)).toEqual(['say', 'moveTeam']);
    tick(m, 1);
    expect(w.done).toHaveLength(2);
    tick(m, 1.5);
    expect(w.done).toHaveLength(3); // the 2 s step fired…
    tick(m, 10);
    expect(w.done).toHaveLength(3); // …once, and step 2 waits for the team
    w.reached.add('r1');
    tick(m, 0.2);
    expect(m.objective).toBe('Second objective');
  });

  it('a later step is not checked before the earlier ones have fired', () => {
    const { w, world } = fakeWorld();
    w.enemies.fields = 0; // step 3 would be true at once…
    const m = new Mission(def, world);
    m.start();
    tick(m, 1);
    expect(m.phase!.id).toBe('one'); // …but steps 1 and 2 come first
  });

  it('nextPhase enters the next phase after the rest of the step, then completes', () => {
    const { w, world } = fakeWorld();
    w.enemies.fields = 0;
    w.reached.add('r1');
    const m = new Mission(def, world);
    m.start();
    tick(m, 3);
    // "after next" was still said (the step runs top to bottom), then phase two began.
    expect(w.done.map((a) => (a.kind === 'say' ? a.text : a.kind))).toContain('after next');
    expect(m.flags.has('entered')).toBe(true);
    expect(m.status).toBe('complete');
  });

  it('starts at a named phase (`?phase=`), and rejects unknown ones', () => {
    const { world } = fakeWorld();
    const m = new Mission(def, world);
    expect(m.start('two').id).toBe('two');
    expect(() => new Mission(def, world).start('nope')).toThrow();
  });

  it('skipPhase jumps ahead, and past the last phase completes', () => {
    const { world } = fakeWorld();
    const m = new Mission(def, world);
    m.start();
    expect(m.skipPhase()?.id).toBe('two');
    m.skipPhase();
    expect(m.status).toBe('complete');
  });

  it('a failed mission stops running its script', () => {
    const { w, world } = fakeWorld();
    const m = new Mission(def, world);
    m.start();
    m.fail();
    tick(m, 5);
    expect(m.status).toBe('failed');
    expect(w.done).toHaveLength(2);
  });
});

describe('Mission timeouts (the safety valve)', () => {
  const def: MissionDef = {
    id: 'valve',
    phases: [
      {
        id: 'p',
        objective: '',
        teamStart: [0, 0],
        onEnter: [],
        steps: [
          {
            note: 'clear',
            when: zoneEnemiesBelow('village', 1),
            timeout: 30,
            onTimeout: [routZone('village')],
            do: [say('FCO', 'moving on')],
          },
          { when: timeInStep(1), do: [completeMission()] },
        ],
      },
    ],
  };

  it('fires a stuck step after its timeout, routing the zone first', () => {
    const { w, world } = fakeWorld();
    w.enemies.village = 1; // one enemy hiding forever
    const m = new Mission(def, world);
    m.start();
    tick(m, 29.5);
    expect(w.done).toEqual([]);
    tick(m, 1);
    expect(kinds(w.done)).toEqual(['routZone', 'say']);
    expect(m.timedOut).toEqual(['p/clear']);
    tick(m, 2);
    expect(m.status).toBe('complete');
  });

  it('a step whose condition comes true in time does not run its timeout actions', () => {
    const { w, world } = fakeWorld();
    w.enemies.village = 1;
    const m = new Mission(def, world);
    m.start();
    tick(m, 10);
    w.enemies.village = 0;
    tick(m, 0.2);
    expect(kinds(w.done)).toEqual(['say']);
    expect(m.timedOut).toEqual([]);
  });
});

describe('Mission conditions', () => {
  const one = (when: Parameters<typeof allOf>[0]): MissionDef => ({
    id: 'c',
    phases: [
      {
        id: 'p',
        objective: '',
        teamStart: [0, 0],
        onEnter: [],
        steps: [{ when, do: [completeMission()] }],
      },
    ],
  });

  it('vehiclesDestroyed: true only once no tagged vehicle is alive', () => {
    const { w, world } = fakeWorld();
    w.vehicles.convoy = 2;
    const m = new Mission(one(vehiclesDestroyed('convoy')), world);
    m.start();
    tick(m, 1);
    expect(m.status).toBe('running');
    w.vehicles.convoy = 0;
    tick(m, 0.2);
    expect(m.status).toBe('complete');
  });

  it('timers count down; timerBelow and timerDone read them', () => {
    const { world } = fakeWorld();
    const def: MissionDef = {
      id: 't',
      phases: [
        {
          id: 'p',
          objective: '',
          teamStart: [0, 0],
          onEnter: [startTimer('k', 10, 'KESTREL 6')],
          steps: [
            { when: timerBelow('k', 4), do: [setFlag('low')] },
            { when: timerDone('k'), do: [completeMission()] },
          ],
        },
      ],
    };
    const m = new Mission(def, world);
    m.start();
    expect(m.timers).toEqual([{ id: 'k', label: 'KESTREL 6', left: 10 }]);
    tick(m, 5);
    expect(m.flags.has('low')).toBe(false);
    tick(m, 1.5);
    expect(m.flags.has('low')).toBe(true);
    tick(m, 4);
    expect(m.status).toBe('complete');
  });

  it('helicopter stages are ordered: "landed" stays true after boarding', () => {
    const { w, world } = fakeWorld();
    const m = new Mission(one(helicopter('landed')), world);
    m.start();
    w.heli = 'inbound';
    tick(m, 0.2);
    expect(m.status).toBe('running');
    w.heli = 'boarded';
    tick(m, 0.2);
    expect(m.status).toBe('complete');
  });

  it('allOf / anyOf combine conditions', () => {
    const { w, world } = fakeWorld();
    const m = new Mission(one(allOf(flag('a'), anyOf(flag('b'), teamReached('r')))), world);
    m.start();
    m.setFlag('a');
    tick(m, 0.2);
    expect(m.status).toBe('running');
    w.reached.add('r');
    tick(m, 0.2);
    expect(m.status).toBe('complete');
  });

  it('shows phase, step and note in its debug line', () => {
    const { world } = fakeWorld();
    const m = new Mission(one(flag('x')), world);
    m.start();
    expect(m.debugLine).toMatch(/^P 1\/1/);
  });
});
