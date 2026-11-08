import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { Collision } from '../world/Collision';
import { StreamCrossings } from '../world/crossings';
import { MAP } from '../world/MapData';
import { Terrain } from '../world/Terrain';
import { mapHeightField } from '../world/terrainShape';
import { WorldBuilder } from '../world/WorldBuilder';
import { WaveSpawner, journeyRoute } from './spawning';
import { UnitManager } from './UnitManager';

const DT = 1 / 60;

/** The game's unit setup on the real map, headless (as `Game` wires it). */
function mapScene() {
  const terrain = new Terrain(CONFIG.terrain, mapHeightField(MAP));
  const collision = new Collision(terrain, terrain.maxHeight + 2);
  const world = new WorldBuilder(MAP, terrain, collision);
  const crossings = new StreamCrossings(MAP.stream, MAP.bridges);
  const units = new UnitManager(
    (x, z) => world.surfaceAt(x, z),
    new EventBus<GameEvents>(),
    createRng(4040),
    journeyRoute(MAP),
    {
      world: {
        lineOfSight: (a, b) => collision.lineOfSight(a, b),
        pushOut: (x, z, r, out) => collision.pushOut(x, z, r, out),
        detour: (fx, fz, tx, tz, out) => crossings.detour(fx, fz, tx, tz, out),
      },
      cover: world.cover,
    },
  );
  units.team.damage = () => {}; // keep the scene running
  return { units, crossings, spawner: new WaveSpawner(createRng(5050)) };
}

describe('the test scene on the real map (M6 feedback)', () => {
  it('enemies only ever cross the stream over the bridge', { timeout: 60_000 }, () => {
    const { units, crossings, spawner } = mapScene();
    // Start the team just west of the bridge so the fight happens on both banks.
    const bridge = MAP.bridges[0].at;
    units.squad.anchor.set(bridge[0] - 80, 0, bridge[1] + 5);
    const last = new Map<number, { x: number; z: number }>();
    let crossingsSeen = 0;
    for (let k = 0; k < 60 * 180; k++) {
      spawner.update(DT, units);
      units.update(DT);
      for (const e of units.enemies) {
        if (!e.alive) continue;
        const prev = last.get(e.id);
        if (prev && crossings.crosses(prev.x, prev.z, e.position.x, e.position.z)) {
          crossingsSeen++;
          const d = Math.hypot(e.position.x - bridge[0], e.position.z - bridge[1]);
          expect(d).toBeLessThan(MAP.bridges[0].length);
        }
        last.set(e.id, { x: e.position.x, z: e.position.z });
      }
    }
    expect(crossingsSeen).toBeGreaterThan(0); // the scene really sent enemies across
  });
});
