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
import { Explosives } from '../world/explosives';
import { inForest } from '../world/forest';
import { ORDNANCE } from '../gunship/airSupportDefs';
import type { Footprint } from './clinic';
import { MISSION } from './missionDef';
import { MissionHost } from './MissionHost';
import { MissionStats } from './stats';

/** The static world: built once per page, shared by every run (M8 restart keeps it). */
export function createWorld() {
  const terrain = new Terrain(CONFIG.terrain, mapHeightField(MAP));
  // Ray hits can't be higher than the highest ground (+ margin); buildings are boxes on top.
  const collision = new Collision(terrain, terrain.maxHeight + 2);
  const world = new WorldBuilder(MAP, terrain, collision);
  const crossings = new StreamCrossings(MAP.stream, MAP.bridges);
  const footprints: Footprint[] = world.protectedBoxes.map((i) => {
    const b = collision.boxes[i];
    return {
      center: { x: b.center.x, z: b.center.z },
      half: { x: b.half.x, z: b.half.z },
      rotY: b.rotY,
    };
  });
  return { terrain, collision, world, crossings, footprints };
}

export type StaticWorld = ReturnType<typeof createWorld>;

/**
 * Everything that changes during one run of the mission: event bus, soldiers, vehicles,
 * spawner, the mission script and the end-screen stats. A restart throws this away and makes
 * a new one on the same static world, so nothing from the last run leaks into the next (the
 * fixed seeds make every run start the same way).
 */
export function createBattle(w: StaticWorld) {
  // The world's cover points are shared: free every reservation the last run left behind.
  w.world.cover.releaseAll();
  const bus = new EventBus<GameEvents>();
  const ground = (x: number, z: number) => w.terrain.heightAt(x, z);
  // Ridgeback starts at the OP and walks only when the mission says so (`moveTeam`).
  const units = new UnitManager(
    (x, z) => w.world.surfaceAt(x, z), // over the bridge deck, not through the stream bed
    bus,
    createRng(4040),
    toPathPoints(MAP.friendlyRoutes[MAP.routeOrder[0]]),
    {
      loopRoute: false,
      // Houses and hills block sight and walking; the stream can only be crossed on the bridge.
      world: {
        lineOfSight: (a, b) => w.collision.lineOfSight(a, b),
        pushOut: (x, z, r, out) => w.collision.pushOut(x, z, r, out),
        detour: (fx, fz, tx, tz, out) => w.crossings.detour(fx, fz, tx, tz, out),
        concealment: (x, z) => (inForest(MAP, x, z) ? CONFIG.forest.concealment : 1),
      },
      cover: w.world.cover,
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
  const spawner = new WaveSpawner(createRng(5050));
  const host = new MissionHost(MISSION, {
    map: MAP,
    bus,
    units,
    vehicles,
    spawner,
    groundAt: ground,
    protectedFootprints: w.footprints,
    rng: createRng(9090),
  });
  const stats = new MissionStats(bus);
  // The fuel depot's tanks: every impact near them hurts them (fresh each run).
  const depot = new Explosives(w.world.explosives);
  bus.on('impact', (e) => depot.hit(e.pos.x, e.pos.z, ORDNANCE[e.weapon]));
  return { bus, units, vehicles, spawner, host, stats, ground, depot };
}

export type Battle = ReturnType<typeof createBattle>;
