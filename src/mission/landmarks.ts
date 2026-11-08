import type { MapData } from '../world/mapTypes';

/** A named place on the map that the crew can call things by (M8+ Phase F). */
export interface Landmark {
  readonly name: string;
  readonly x: number;
  readonly z: number;
}

/** Building ids (and fixed points) the radio refers to, with what the crew calls them. */
const NAMED_BUILDINGS: Readonly<Record<string, string>> = {
  farmhouse: 'the farmhouse',
  barn: 'the barn',
  clinic: 'the clinic',
  gas_shop: 'the gas station',
  garage: 'the crossroads garage',
  depot_tank1: 'the fuel depot',
  relay_mast: 'the radio mast',
  hamlet_barn: 'the hamlet',
  sawmill: 'the sawmill',
  lodge: "the forester's lodge",
  workshop: 'the workshop',
};

/** Every landmark of the map: named buildings, the bridge, the square, the quarry. */
export function landmarks(map: MapData): Landmark[] {
  const out: Landmark[] = [];
  for (const b of map.buildings) {
    const name = NAMED_BUILDINGS[b.id];
    if (name) out.push({ name, x: b.pos[0], z: b.pos[1] });
  }
  for (const br of map.bridges) out.push({ name: 'the bridge', x: br.at[0], z: br.at[1] });
  out.push({ name: 'the village square', x: -12, z: 32 });
  out.push({ name: 'the quarry', x: map.zones.lz.center[0], z: map.zones.lz.center[1] });
  out.push({
    name: 'the crossroads',
    x: map.zones.crossroads.center[0],
    z: map.zones.crossroads.center[1],
  });
  return out;
}

const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
];

/** Compass direction from (fx, fz) to (x, z): +x east, −z north. */
export function compass(fx: number, fz: number, x: number, z: number): string {
  const bearing = Math.atan2(x - fx, -(z - fz)); // 0 = north, clockwise
  const i = Math.round(((bearing + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 4)) % 8;
  return COMPASS[i];
}

/**
 * Where (x, z) is, the way the crew would say it: "at the barn" when close, "north of the barn"
 * up to `reach` m away, otherwise a bare compass point from the team ("to the east").
 */
export function describePlace(
  marks: readonly Landmark[],
  x: number,
  z: number,
  team: { x: number; z: number },
  reach = 260,
): string {
  let best: Landmark | null = null;
  let bestD = Infinity;
  for (const m of marks) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (best && bestD < 35) return `at ${best.name}`;
  if (best && bestD <= reach) return `${compass(best.x, best.z, x, z)} of ${best.name}`;
  return `to the ${compass(team.x, team.z, x, z)} of Ridgeback`;
}
