import { AirDefense, type AAShooter } from '../combat/AirDefense';
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
import { buildMission, DEFAULT_ROLL } from './missionDef';
import type { TwistRoll } from './twists';
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
export function createBattle(w: StaticWorld, roll: TwistRoll = DEFAULT_ROLL) {
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
  // Enemy air defense (M8+ Phase E): AA emplacements (targets for every blast), AA trucks among
  // the vehicles, and MANPADS teams launching at the gunship.
  const airDefense = new AirDefense(
    MAP.aaSites.map((a) => ({
      id: a.id,
      x: a.pos[0],
      y: ground(a.pos[0], a.pos[1]) + 1.2,
      z: a.pos[1],
    })),
    bus,
    createRng(7070),
  );
  for (const g of airDefense.guns) units.addTarget(g);
  airDefense.trucks = () => aaTrucks(vehicles);
  units.onLaunch = (from) => airDefense.launch(from);
  // Mortar rounds (M8+ Phase F): hurt the team when close, and show as enemy shells.
  units.onMortar = (x, z) => {
    bus.emit('enemyShell', { x, z });
    const t = units.teamPosition;
    const d = Math.hypot(t.x - x, t.z - z);
    const r = CONFIG.twists.mortarRadius;
    if (d < r) units.team.damage(CONFIG.twists.mortarDamage * (1 - d / r));
  };
  const mission = buildMission(roll);
  const host = new MissionHost(mission, {
    map: MAP,
    bus,
    units,
    vehicles,
    spawner,
    groundAt: ground,
    protectedFootprints: w.footprints,
    rng: createRng(9090),
    airDefense,
  });
  const stats = new MissionStats(bus);
  // The fuel depot's tanks: every impact near them hurts them (fresh each run).
  const depot = new Explosives(w.world.explosives);
  bus.on('impact', (e) => depot.hit(e.pos.x, e.pos.z, ORDNANCE[e.weapon]));
  return { bus, units, vehicles, spawner, host, stats, ground, depot, airDefense, roll, mission };
}

/** Live AA trucks as air-defense shooters (they fire once in place or on the move). */
function* aaTrucks(vehicles: VehicleManager): Generator<AAShooter> {
  for (let i = 0; i < vehicles.vehicles.length; i++) {
    const v = vehicles.vehicles[i];
    if (v.inUse && v.alive && v.def.antiAir) {
      yield { id: `aaa${i}`, position: v.position, firing: true };
    }
  }
}

export type Battle = ReturnType<typeof createBattle>;
