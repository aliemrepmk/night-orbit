import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { WaveSpawner } from '../units/spawning';
import { UnitManager } from '../units/UnitManager';
import { VehicleManager } from '../units/VehicleManager';
import { Collision } from '../world/Collision';
import { StreamCrossings } from '../world/crossings';
import { MAP } from '../world/MapData';
import { toPathPoints } from '../world/mapTypes';
import { Terrain } from '../world/Terrain';
import { mapHeightField } from '../world/terrainShape';
import { WorldBuilder } from '../world/WorldBuilder';
import type { Footprint } from './clinic';
import { MISSION } from './missionDef';
import { MissionHost } from './MissionHost';

/**
 * The whole game minus the screen, wired like `Game` (real map, real units, real mission), for
 * the auto-play and host tests and for headless tuning runs. No renderer, no DOM.
 */
export function headlessGame() {
  const terrain = new Terrain(CONFIG.terrain, mapHeightField(MAP));
  const collision = new Collision(terrain, terrain.maxHeight + 2);
  const world = new WorldBuilder(MAP, terrain, collision);
  const crossings = new StreamCrossings(MAP.stream, MAP.bridges);
  const bus = new EventBus<GameEvents>();
  const ground = (x: number, z: number) => terrain.heightAt(x, z);
  const units = new UnitManager(
    (x, z) => world.surfaceAt(x, z),
    bus,
    createRng(4040),
    toPathPoints(MAP.friendlyRoutes[MAP.routeOrder[0]]),
    {
      world: {
        lineOfSight: (a, b) => collision.lineOfSight(a, b),
        pushOut: (x, z, r, out) => collision.pushOut(x, z, r, out),
        detour: (fx, fz, tx, tz, out) => crossings.detour(fx, fz, tx, tz, out),
      },
      cover: world.cover,
      loopRoute: false,
    },
  );
  units.squad.halt();
  const vehicles = new VehicleManager(
    units,
    ground,
    bus,
    createRng(6060),
    CONFIG.vehicles,
    CONFIG.spawning.machineGunnerChance,
  );
  const footprints: Footprint[] = world.protectedBoxes.map((i) => {
    const b = collision.boxes[i];
    return { center: b.center, half: b.half, rotY: b.rotY };
  });
  const spawner = new WaveSpawner(createRng(5050));
  const host = new MissionHost(MISSION, {
    map: MAP,
    bus,
    units,
    vehicles,
    spawner,
    groundAt: ground,
    protectedFootprints: footprints,
    rng: createRng(9090),
  });
  const failures: string[] = [];
  bus.on('missionFailed', (e) => failures.push(e.reason));
  return { host, units, vehicles, bus, failures, footprints };
}

export type HeadlessGame = ReturnType<typeof headlessGame>;
