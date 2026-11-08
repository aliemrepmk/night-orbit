import type { MapData, Vec2, ZoneId } from '../world/mapTypes';

export type OverlayKind = 'zone' | 'road' | 'route' | 'path' | 'vehicle' | 'spawn' | 'cover';

/** One thing to draw on the debug overlay, in ground coordinates. */
export interface OverlayShape {
  readonly kind: OverlayKind;
  readonly points: readonly Vec2[];
  /** Draw as separate dots instead of a connected line. */
  readonly dots?: boolean;
  readonly closed?: boolean;
  readonly label?: string;
}

/**
 * Everything the map-authoring overlay shows (PLAN.md §7.18): zone circles, roads, Ridgeback's
 * routes, enemy approach paths, vehicle paths, spawn points and cover points, with labels.
 * Pure: `DebugOverlay` projects these to the screen.
 */
export function mapOverlay(
  map: MapData,
  cover: readonly { x: number; z: number }[],
  circleSegments = 32,
): OverlayShape[] {
  const out: OverlayShape[] = [];
  for (const [id, z] of Object.entries(map.zones)) {
    const pts: Vec2[] = [];
    for (let k = 0; k < circleSegments; k++) {
      const a = (k / circleSegments) * Math.PI * 2;
      pts.push([z.center[0] + Math.cos(a) * z.radius, z.center[1] + Math.sin(a) * z.radius]);
    }
    out.push({ kind: 'zone', points: pts, closed: true, label: id.toUpperCase() });
  }
  for (const r of map.roads) out.push({ kind: 'road', points: r.points, label: r.id });
  for (const id of map.routeOrder) {
    const pts = map.friendlyRoutes[id];
    if (pts) out.push({ kind: 'route', points: pts, label: id });
  }
  for (const [id, p] of Object.entries(map.enemyPaths))
    out.push({ kind: 'path', points: p.points, label: id });
  for (const [id, pts] of Object.entries(map.vehiclePaths))
    out.push({ kind: 'vehicle', points: pts, label: id });
  const spawns = Object.values(map.spawnPoints).flat();
  if (spawns.length) out.push({ kind: 'spawn', points: spawns, dots: true });
  if (cover.length)
    out.push({ kind: 'cover', points: cover.map((c) => [c.x, c.z] as const), dots: true });
  return out;
}

/** The placer's output for a ground point: `[x, z]` in whole meters, ready to paste into MapData. */
export function formatPlacement(x: number, z: number): string {
  // `+ 0` turns -0 into 0.
  return `[${Math.round(x) + 0}, ${Math.round(z) + 0}]`;
}

/** Zones in journey order (west → east) for the look-test tour (F3). */
export const ZONE_TOUR: readonly ZoneId[] = [
  'op',
  'fields',
  'village',
  'crossroads',
  'lz',
  'forest',
];

/**
 * F3 tour step: the next zone to center the orbit on, or null to go back to following Ridgeback
 * (after the last zone). `current` is null while following the team.
 */
export function nextTourStop(current: ZoneId | null): ZoneId | null {
  if (current === null) return ZONE_TOUR[0];
  const i = ZONE_TOUR.indexOf(current);
  return i + 1 < ZONE_TOUR.length ? ZONE_TOUR[i + 1] : null;
}
