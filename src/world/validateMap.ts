import type { BuildingDef, MapData, PropDef, Vec2, WallDef } from './mapTypes';

/** Props' footprints (width, depth) by kind; the builder uses the same sizes. */
export const PROP_SIZE: Readonly<Record<PropDef['kind'], Vec2>> = {
  car: [1.9, 4.3],
  hay: [2.2, 2.2],
  crates: [2.4, 2.4],
};

/** A rotated rectangle on the ground (same rotation convention as `Collision`'s boxes). */
export interface Rect {
  readonly x: number;
  readonly z: number;
  readonly rot: number;
  readonly hw: number;
  readonly hd: number;
}

export function buildingRect(b: BuildingDef, grow = 0): Rect {
  return {
    x: b.pos[0],
    z: b.pos[1],
    rot: b.rot,
    hw: b.size[0] / 2 + grow,
    hd: b.size[1] / 2 + grow,
  };
}

export function propRect(p: PropDef, grow = 0): Rect {
  const [w, d] = PROP_SIZE[p.kind];
  return { x: p.pos[0], z: p.pos[1], rot: p.rot, hw: w / 2 + grow, hd: d / 2 + grow };
}

/** One rect per straight wall segment. */
export function wallRects(w: WallDef, grow = 0): Rect[] {
  const out: Rect[] = [];
  for (let i = 1; i < w.points.length; i++) {
    const [ax, az] = w.points[i - 1];
    const [bx, bz] = w.points[i];
    const len = Math.hypot(bx - ax, bz - az);
    // Local x runs along the segment: rotY = atan2(-dz, dx) under the Collision convention.
    out.push({
      x: (ax + bx) / 2,
      z: (az + bz) / 2,
      rot: Math.atan2(-(bz - az), bx - ax),
      hw: len / 2 + grow,
      hd: w.thickness / 2 + grow,
    });
  }
  return out;
}

/** True if ground point (x, z) is inside the rotated rectangle. */
export function inRect(r: Rect, x: number, z: number): boolean {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const dx = x - r.x;
  const dz = z - r.z;
  return Math.abs(c * dx - s * dz) <= r.hw && Math.abs(s * dx + c * dz) <= r.hd;
}

function corners(r: Rect): Vec2[] {
  const c = Math.cos(r.rot);
  const s = Math.sin(r.rot);
  const out: Vec2[] = [];
  for (const [lx, lz] of [
    [-r.hw, -r.hd],
    [r.hw, -r.hd],
    [r.hw, r.hd],
    [-r.hw, r.hd],
  ]) {
    out.push([r.x + c * lx + s * lz, r.z - s * lx + c * lz]);
  }
  return out;
}

/** Separating-axis test for two rotated rectangles. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const r of [a, b]) {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    // The rect's local axes in world space.
    for (const [ax, az] of [
      [c, -s],
      [s, c],
    ]) {
      let minA = Infinity;
      let maxA = -Infinity;
      let minB = Infinity;
      let maxB = -Infinity;
      for (const [x, z] of ca) {
        const p = x * ax + z * az;
        minA = Math.min(minA, p);
        maxA = Math.max(maxA, p);
      }
      for (const [x, z] of cb) {
        const p = x * ax + z * az;
        minB = Math.min(minB, p);
        maxB = Math.max(maxB, p);
      }
      if (maxA < minB || maxB < minA) return false;
    }
  }
  return true;
}

/** Points every `step` meters along a polyline (including both ends). */
export function samplePolyline(points: readonly Vec2[], step: number): Vec2[] {
  const out: Vec2[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return out;
}

/** Ground distance from (x, z) to the nearest point of a polyline. */
export function distanceToPolyline(points: readonly Vec2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1];
    const [bx, bz] = points[i];
    const vx = bx - ax;
    const vz = bz - az;
    const len2 = vx * vx + vz * vz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / len2)) : 0;
    best = Math.min(best, Math.hypot(ax + vx * t - x, az + vz * t - z));
  }
  return best;
}

/** Ground points where two polylines cross. */
export function crossings(a: readonly Vec2[], b: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const [p1x, p1z] = a[i - 1];
      const [p2x, p2z] = a[i];
      const [q1x, q1z] = b[j - 1];
      const [q2x, q2z] = b[j];
      const d = (p2x - p1x) * (q2z - q1z) - (p2z - p1z) * (q2x - q1x);
      if (Math.abs(d) < 1e-9) continue;
      const t = ((q1x - p1x) * (q2z - q1z) - (q1z - p1z) * (q2x - q1x)) / d;
      const u = ((q1x - p1x) * (p2z - p1z) - (q1z - p1z) * (p2x - p1x)) / d;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
        out.push([p1x + (p2x - p1x) * t, p1z + (p2z - p1z) * t]);
    }
  }
  return out;
}

const fmt = (p: Vec2) => `[${p[0].toFixed(0)}, ${p[1].toFixed(0)}]`;

/**
 * Checks the map for authoring mistakes (PLAN.md M6 🧪) and returns them as readable messages
 * (empty = valid): everything inside the map, ids unique and referenced ones present, routes
 * connected, nothing built on roads or on top of each other, one protected clinic, bridges where
 * roads cross the stream, vehicles only on roads.
 */
export function validateMap(map: MapData, mapSize: number): string[] {
  const errors: string[] = [];
  const half = mapSize / 2;
  const inside = (what: string, pts: readonly Vec2[]) => {
    for (const p of pts) {
      if (Math.abs(p[0]) > half || Math.abs(p[1]) > half)
        errors.push(`${what}: ${fmt(p)} is outside the map`);
    }
  };
  for (const r of map.roads) inside(`road ${r.id}`, r.points);
  inside('stream', map.stream.points);
  for (const b of map.buildings) inside(`building ${b.id}`, [b.pos]);
  for (const w of map.walls) inside(`${w.kind}`, w.points);
  for (const p of map.props) inside(`${p.kind}`, [p.pos]);
  for (const t of map.treeLines) inside('tree line', t.points);
  for (const [id, pts] of Object.entries(map.friendlyRoutes)) inside(`route ${id}`, pts);
  for (const [id, p] of Object.entries(map.enemyPaths)) inside(`enemy path ${id}`, p.points);
  for (const [id, pts] of Object.entries(map.vehiclePaths)) inside(`vehicle path ${id}`, pts);
  for (const [zone, pts] of Object.entries(map.spawnPoints)) inside(`spawn (${zone})`, pts);

  // Ids
  const ids = new Set<string>();
  for (const b of map.buildings) {
    if (ids.has(b.id)) errors.push(`building id ${b.id} is used twice`);
    ids.add(b.id);
  }
  const roadIds = new Set<string>();
  for (const r of map.roads) {
    if (roadIds.has(r.id)) errors.push(`road id ${r.id} is used twice`);
    roadIds.add(r.id);
  }

  // The protected clinic
  const clinics = map.buildings.filter((b) => b.kind === 'clinic');
  if (clinics.length !== 1) errors.push(`expected exactly one clinic, found ${clinics.length}`);
  for (const c of clinics) if (!c.protected) errors.push(`clinic ${c.id} is not marked protected`);
  for (const b of map.buildings) {
    if (b.protected && b.kind !== 'clinic')
      errors.push(`building ${b.id} is protected but not a clinic`);
  }
  const village = map.zones.village;
  for (const c of clinics) {
    if (Math.hypot(c.pos[0] - village.center[0], c.pos[1] - village.center[1]) > village.radius) {
      errors.push(`clinic ${c.id} is not in the village zone`);
    }
  }

  // Routes: every id in routeOrder exists, each starts where the previous one ended
  for (const id of map.routeOrder)
    if (!map.friendlyRoutes[id]) errors.push(`routeOrder names unknown route ${id}`);
  for (const id of Object.keys(map.friendlyRoutes)) {
    if (!map.routeOrder.includes(id)) errors.push(`route ${id} is not in routeOrder`);
    if (map.friendlyRoutes[id].length < 2) errors.push(`route ${id} needs at least two points`);
  }
  for (let i = 1; i < map.routeOrder.length; i++) {
    const prev = map.friendlyRoutes[map.routeOrder[i - 1]];
    const next = map.friendlyRoutes[map.routeOrder[i]];
    if (!prev || !next) continue;
    const a = prev[prev.length - 1];
    const b = next[0];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1) {
      errors.push(
        `route ${map.routeOrder[i]} starts at ${fmt(b)}, not where ${map.routeOrder[i - 1]} ends (${fmt(a)})`,
      );
    }
  }

  // Solid things: buildings, walls, props
  const solids: { what: string; rect: Rect }[] = [
    ...map.buildings.map((b) => ({ what: `building ${b.id}`, rect: buildingRect(b) })),
    ...map.walls.flatMap((w, i) => wallRects(w).map((rect) => ({ what: `${w.kind} #${i}`, rect }))),
    ...map.props.map((p, i) => ({ what: `${p.kind} #${i}`, rect: propRect(p) })),
  ];

  // Nothing solid on a road (a meter of verge on each side)
  for (const road of map.roads) {
    const samples = samplePolyline(road.points, 1);
    for (const s of solids) {
      const grown = {
        ...s.rect,
        hw: s.rect.hw + road.width / 2 + 1,
        hd: s.rect.hd + road.width / 2 + 1,
      };
      if (samples.some(([x, z]) => inRect(grown, x, z)))
        errors.push(`${s.what} is on road ${road.id}`);
    }
  }

  // Buildings and props don't overlap each other (1 m gap); walls may touch buildings
  const blocks = solids.filter(
    (s) => !s.what.startsWith('hedge') && !s.what.startsWith('wall') && !s.what.startsWith('rock'),
  );
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = { ...blocks[i].rect, hw: blocks[i].rect.hw + 0.5, hd: blocks[i].rect.hd + 0.5 };
      const b = { ...blocks[j].rect, hw: blocks[j].rect.hw + 0.5, hd: blocks[j].rect.hd + 0.5 };
      if (rectsOverlap(a, b)) errors.push(`${blocks[i].what} overlaps ${blocks[j].what}`);
    }
  }

  // Where people walk or appear is open ground
  const open = (what: string, pts: readonly Vec2[]) => {
    for (const p of pts) {
      for (const s of solids) {
        if (inRect({ ...s.rect, hw: s.rect.hw + 0.5, hd: s.rect.hd + 0.5 }, p[0], p[1])) {
          errors.push(`${what} at ${fmt(p)} is inside ${s.what}`);
          break;
        }
      }
    }
  };
  for (const [zone, pts] of Object.entries(map.spawnPoints)) open(`spawn (${zone})`, pts);
  for (const [id, pts] of Object.entries(map.friendlyRoutes))
    open(`route ${id}`, samplePolyline(pts, 2));
  for (const [id, p] of Object.entries(map.enemyPaths))
    open(`enemy path ${id}`, samplePolyline(p.points, 2));

  // Enemy paths end in their zone
  for (const [id, p] of Object.entries(map.enemyPaths)) {
    const z = map.zones[p.zone];
    const end = p.points[p.points.length - 1];
    if (Math.hypot(end[0] - z.center[0], end[1] - z.center[1]) > z.radius * 1.3) {
      errors.push(`enemy path ${id} ends at ${fmt(end)}, outside its zone ${p.zone}`);
    }
  }

  // Vehicles stay on the roads
  for (const [id, pts] of Object.entries(map.vehiclePaths)) {
    for (const [x, z] of samplePolyline(pts, 2)) {
      const onRoad = map.roads.some((r) => distanceToPolyline(r.points, x, z) <= r.width / 2);
      if (!onRoad) {
        errors.push(`vehicle path ${id} leaves the road at ${fmt([x, z])}`);
        break;
      }
    }
  }

  // Every road crossing the stream has a bridge
  for (const road of map.roads) {
    for (const c of crossings(road.points, map.stream.points)) {
      const bridged = map.bridges.some((b) => Math.hypot(b.at[0] - c[0], b.at[1] - c[1]) < 15);
      if (!bridged) errors.push(`road ${road.id} crosses the stream at ${fmt(c)} without a bridge`);
    }
  }
  for (const b of map.bridges) {
    if (distanceToPolyline(map.stream.points, b.at[0], b.at[1]) > map.stream.width) {
      errors.push(`bridge ${b.id} is not over the stream`);
    }
    if (!map.roads.some((r) => distanceToPolyline(r.points, b.at[0], b.at[1]) <= r.width / 2)) {
      errors.push(`bridge ${b.id} is not on a road`);
    }
  }
  return errors;
}
