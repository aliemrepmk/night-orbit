import type { MapData, Vec2, ZoneId } from '../world/mapTypes';

/** The briefing's map sketch (M8, PLAN.md §7.16), as SVG-ready data: map x → svg x, map z → svg y. */
export interface BriefingMap {
  readonly viewBox: string;
  readonly roads: readonly { d: string; paved: boolean }[];
  readonly stream: string;
  /** Ridgeback's whole walk, OP → LZ. */
  readonly route: string;
  readonly zones: readonly { id: ZoneId; label: string; x: number; y: number; r: number }[];
  /** The protected clinic (a cross is drawn on it). */
  readonly clinic: { x: number; y: number } | null;
}

export const ZONE_LABELS: Readonly<Record<ZoneId, string>> = {
  op: 'OP',
  fields: 'FIELDS',
  village: 'VILLAGE',
  crossroads: 'CROSSROADS',
  lz: 'LZ QUARRY',
};

const PAD = 70;

function path(points: readonly Vec2[]): string {
  return points.map(([x, z], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(z)}`).join(' ');
}

/** Builds the sketch from the map data: the frame fits every zone and the route, plus a margin. */
export function briefingMap(map: MapData): BriefingMap {
  const route: Vec2[] = [];
  for (const id of map.routeOrder) {
    for (const p of map.friendlyRoutes[id]) {
      const last = route[route.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) route.push(p);
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  const ids = Object.keys(map.zones) as ZoneId[];
  for (const id of ids)
    grow(map.zones[id].center[0], map.zones[id].center[1], map.zones[id].radius);
  for (const [x, z] of route) grow(x, z);
  minX -= PAD;
  minZ -= PAD;
  const w = maxX - minX + PAD;
  const h = maxZ - minZ + PAD;

  const clinic = map.buildings.find((b) => b.protected && b.kind === 'clinic');
  return {
    viewBox: `${Math.round(minX)} ${Math.round(minZ)} ${Math.round(w)} ${Math.round(h)}`,
    roads: map.roads.map((r) => ({ d: path(r.points), paved: r.kind === 'paved' })),
    stream: path(map.stream.points),
    route: path(route),
    zones: ids.map((id) => ({
      id,
      label: ZONE_LABELS[id],
      x: map.zones[id].center[0],
      y: map.zones[id].center[1],
      r: map.zones[id].radius,
    })),
    clinic: clinic ? { x: clinic.pos[0], y: clinic.pos[1] } : null,
  };
}

/** The sketch as an SVG string (monochrome; styled by `.brief-map` in hud.css). */
export function briefingSvg(m: BriefingMap): string {
  const zones = m.zones
    .map(
      (z) =>
        `<circle class="zone" cx="${z.x}" cy="${z.y}" r="${z.r}"/>` +
        `<text x="${z.x}" y="${z.y - z.r - 14}">${z.label}</text>`,
    )
    .join('');
  const roads = m.roads
    .map((r) => `<path class="road${r.paved ? ' paved' : ''}" d="${r.d}"/>`)
    .join('');
  const clinic = m.clinic
    ? `<path class="clinic" d="M${m.clinic.x - 14} ${m.clinic.y} h28 M${m.clinic.x} ${m.clinic.y - 14} v28"/>`
    : '';
  return (
    `<svg class="brief-map" viewBox="${m.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the Varesh Valley">` +
    `<path class="stream" d="${m.stream}"/>${roads}${zones}` +
    `<path class="route" d="${m.route}"/>${clinic}</svg>`
  );
}
