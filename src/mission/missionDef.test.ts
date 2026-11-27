import { PROMPT_FLAGS } from './headlessGame';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { createRng } from '../core/rng';
import { WaveSpawner } from '../units/spawning';
import { VEHICLES } from '../units/vehicleDefs';
import { MAP } from '../world/MapData';
import { buildMission, HELICOPTER_PAD, SAWMILL_PAD, walkTimeout } from './missionDef';
import type { Action, Condition, Phase } from './missionTypes';
import { EXTRACTION_CHANCE, SIDE_CHANCE, type ExtractionTwist, type SideEvent } from './twists';

/** Every extraction twist with every side event switched on: all the content there is. */
const VARIANTS = (Object.keys(EXTRACTION_CHANCE) as ExtractionTwist[]).map((extraction) => ({
  seed: 0,
  extraction,
  side: Object.keys(SIDE_CHANCE) as SideEvent[],
}));

let phases: readonly Phase[] = [];
const allActions = (): Action[] =>
  phases.flatMap((p) => [
    ...p.onEnter,
    ...p.steps.flatMap((s) => [...s.do, ...(s.onTimeout ?? [])]),
  ]);
function conditions(c: Condition): Condition[] {
  if (c.kind === 'allOf') return [c, ...c.all.flatMap(conditions)];
  if (c.kind === 'anyOf') return [c, ...c.any.flatMap(conditions)];
  return [c];
}
const allConditions = () => phases.flatMap((p) => p.steps.flatMap((s) => conditions(s.when)));

for (const roll of VARIANTS)
  describe(`the Varesh Valley mission (PLAN.md §8; ${roll.extraction})`, () => {
    phases = buildMission(roll).phases;
    const mine = phases;
    const sawmill = roll.extraction !== 'holdTheLine';
    it('has calibration and the four phases in order, plus the forest after a sawmill twist', () => {
      phases = mine;
      expect(phases.map((p) => p.id)).toEqual([
        'calibration',
        'fields',
        'village',
        'vehicles',
        'extraction',
        ...(sawmill ? ['forest'] : []),
      ]);
    });

    it('every phase but the last ends by moving on, and the last completes the mission', () => {
      phases = mine;
      for (const p of phases.slice(0, -1)) {
        expect(p.steps[p.steps.length - 1].do.some((a) => a.kind === 'nextPhase')).toBe(true);
      }
      const last = phases[phases.length - 1];
      expect(last.steps[last.steps.length - 1].do.some((a) => a.kind === 'completeMission')).toBe(
        true,
      );
    });

    it('every spawn site, team route, vehicle path and vehicle type exists on the map', () => {
      phases = mine;
      const spawner = new WaveSpawner(createRng(1));
      for (const a of allActions()) {
        if (a.kind === 'spawnWave') expect(spawner.hasSite(a.site), a.site).toBe(true);
        if (a.kind === 'moveTeam') expect(MAP.friendlyRoutes[a.route], a.route).toBeDefined();
        if (a.kind === 'spawnConvoy') {
          expect(MAP.vehiclePaths[a.path], a.path).toBeDefined();
          for (const v of a.vehicles) expect(VEHICLES[v]).toBeDefined();
        }
      }
      for (const c of allConditions()) {
        if (c.kind === 'teamReached') expect(MAP.friendlyRoutes[c.route], c.route).toBeDefined();
      }
    });

    it('a route is only waited for after the team was sent along it', () => {
      phases = mine;
      for (const p of phases) {
        const sent = new Set<string>();
        for (const a of p.onEnter) if (a.kind === 'moveTeam') sent.add(a.route);
        for (const s of p.steps) {
          for (const c of conditions(s.when)) {
            if (c.kind === 'teamReached')
              expect(sent.has(c.route), `${p.id}: ${c.route}`).toBe(true);
          }
          for (const a of s.do) if (a.kind === 'moveTeam') sent.add(a.route);
        }
      }
    });

    it('Ridgeback is sent along every route of the journey, in journey order (then the sawmill branch)', () => {
      phases = mine;
      const routes = allActions().flatMap((a) => (a.kind === 'moveTeam' ? [a.route] : []));
      expect(routes).toEqual([...MAP.routeOrder, ...(sawmill ? ['route_lz_sawmill'] : [])]);
    });

    it('every step that waits on the world has a safety-valve timeout (no soft-locks)', () => {
      phases = mine;
      const prompt = (c: Condition) =>
        conditions(c).some(
          (x) => x.kind === 'flag' && (PROMPT_FLAGS as readonly string[]).includes(x.name),
        );
      const waits = (c: Condition) =>
        conditions(c).some((x) =>
          ['teamReached', 'zoneEnemiesBelow', 'vehiclesDestroyed', 'helicopter', 'flag'].includes(
            x.kind,
          ),
        );
      for (const p of phases) {
        for (const s of p.steps) {
          if (prompt(s.when)) {
            // A player prompt waits for the player (they can always do it) and repeats its hint
            // instead (M8+ fix: the calibration captions used to move on by themselves).
            expect(s.timeout, `${p.id}/${s.note}`).toBeUndefined();
            expect(s.remind?.every, `${p.id}/${s.note}`).toBeGreaterThan(0);
          } else if (waits(s.when)) {
            expect(s.timeout, `${p.id}/${s.note}`).toBeGreaterThan(0);
          }
        }
      }
    });

    it('timeouts on walks scale with the route length', () => {
      expect(walkTimeout('route_crossroads_lz')).toBeGreaterThan(walkTimeout('route_op_fields'));
      // At least twice the walk itself (the team stops to fight), whatever the walking speed.
      for (const [id, pts] of Object.entries(MAP.friendlyRoutes)) {
        let len = 0;
        for (let i = 1; i < pts.length; i++)
          len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        expect(walkTimeout(id)).toBeGreaterThanOrEqual((2 * len) / CONFIG.ridgeback.speed);
      }
    });

    it('the helicopter pads: on the quarry floor, and in the sawmill clearing', () => {
      const lz = MAP.zones.lz;
      expect(
        Math.hypot(HELICOPTER_PAD[0] - lz.center[0], HELICOPTER_PAD[1] - lz.center[1]),
      ).toBeLessThan(40);
      const clearing = MAP.forests[0].clearings[0];
      expect(
        Math.hypot(SAWMILL_PAD[0] - clearing.center[0], SAWMILL_PAD[1] - clearing.center[1]),
      ).toBeLessThan(clearing.radius - 15);
    });

    it('each phase starts the team where the previous phase leaves it', () => {
      phases = mine;
      for (let i = 1; i < phases.length; i++) {
        const sent = [...phases[i - 1].onEnter, ...phases[i - 1].steps.flatMap((s) => s.do)].filter(
          (a): a is Extract<Action, { kind: 'moveTeam' }> => a.kind === 'moveTeam',
        );
        if (sent.length === 0) continue;
        const route = MAP.friendlyRoutes[sent[sent.length - 1].route];
        const end = route[route.length - 1];
        expect(phases[i].teamStart, phases[i].id).toEqual(end);
      }
    });
  });
