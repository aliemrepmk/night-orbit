import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { WaveSpawner } from '../units/spawning';
import { VEHICLES } from '../units/vehicleDefs';
import { MAP } from '../world/MapData';
import { HELICOPTER_PAD, MISSION, walkTimeout } from './missionDef';
import type { Action, Condition } from './missionTypes';

const phases = MISSION.phases;
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

describe('the Varesh Valley mission (PLAN.md §8)', () => {
  it('has calibration and the four phases, in order', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'calibration',
      'fields',
      'village',
      'vehicles',
      'extraction',
    ]);
  });

  it('every phase but the last ends by moving on, and the last completes the mission', () => {
    for (const p of phases.slice(0, -1)) {
      expect(p.steps[p.steps.length - 1].do.some((a) => a.kind === 'nextPhase')).toBe(true);
    }
    const last = phases[phases.length - 1];
    expect(last.steps[last.steps.length - 1].do.some((a) => a.kind === 'completeMission')).toBe(
      true,
    );
  });

  it('every spawn site, team route, vehicle path and vehicle type exists on the map', () => {
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
    for (const p of phases) {
      const sent = new Set<string>();
      for (const a of p.onEnter) if (a.kind === 'moveTeam') sent.add(a.route);
      for (const s of p.steps) {
        for (const c of conditions(s.when)) {
          if (c.kind === 'teamReached') expect(sent.has(c.route), `${p.id}: ${c.route}`).toBe(true);
        }
        for (const a of s.do) if (a.kind === 'moveTeam') sent.add(a.route);
      }
    }
  });

  it('Ridgeback is sent along every route of the journey, in journey order', () => {
    const routes = allActions().flatMap((a) => (a.kind === 'moveTeam' ? [a.route] : []));
    expect(routes).toEqual([...MAP.routeOrder]);
  });

  it('every step that waits on the world has a safety-valve timeout (no soft-locks)', () => {
    const waits = (c: Condition) =>
      conditions(c).some((x) =>
        ['teamReached', 'zoneEnemiesBelow', 'vehiclesDestroyed', 'helicopter', 'flag'].includes(
          x.kind,
        ),
      );
    for (const p of phases) {
      for (const s of p.steps) {
        if (waits(s.when)) expect(s.timeout, `${p.id}/${s.note}`).toBeGreaterThan(0);
      }
    }
  });

  it('timeouts on walks scale with the route length', () => {
    expect(walkTimeout('route_crossroads_lz')).toBeGreaterThan(walkTimeout('route_op_fields'));
    expect(walkTimeout('route_crossroads_lz')).toBeGreaterThan(300);
  });

  it('the helicopter pad is on the quarry floor near the LZ center', () => {
    const lz = MAP.zones.lz;
    expect(
      Math.hypot(HELICOPTER_PAD[0] - lz.center[0], HELICOPTER_PAD[1] - lz.center[1]),
    ).toBeLessThan(40);
  });

  it('each phase starts the team where the previous phase leaves it', () => {
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
