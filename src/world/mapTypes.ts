/**
 * The shape of the handcrafted map (PLAN.md §7.12). Pure data types: `MapData.ts` holds THE map,
 * `validateMap.ts` checks it, `WorldBuilder.ts` turns it into meshes and collision.
 * Coordinates are `[x, z]` in meters (+x east, −z north); rotations in radians about +y.
 */
export type Vec2 = readonly [number, number];

/** `[x, z]` map points as `{ x, z }` path points (for `ai/Paths`, road ribbons). */
export function toPathPoints(points: readonly Vec2[]): { x: number; z: number }[] {
  return points.map(([x, z]) => ({ x, z }));
}

/** `forest`: Black Pine Forest and the sawmill clearing, the alternate LZ (M8+ Phase D). */
export type ZoneId = 'op' | 'fields' | 'village' | 'crossroads' | 'lz' | 'forest';

export interface Zone {
  readonly center: Vec2;
  readonly radius: number;
}

export interface TerrainShape {
  readonly seed: number;
  /** Peak-to-trough scale of the rolling hills inside the valley. */
  readonly hillHeight: number;
  /** Beyond `valleyStart` meters from the center the ground rises by up to `valleyRise` (mountains). */
  readonly valleyStart: number;
  readonly valleyRise: number;
}

/** Ground leveled to its center height within `radius`, blending back over `falloff` meters. */
export interface FlatArea {
  readonly center: Vec2;
  readonly radius: number;
  readonly falloff: number;
}

export interface RoadDef {
  readonly id: string;
  readonly kind: 'dirt' | 'paved';
  readonly width: number;
  readonly points: readonly Vec2[];
}

export interface StreamDef {
  readonly width: number;
  readonly depth: number;
  readonly points: readonly Vec2[];
}

export interface BridgeDef {
  readonly id: string;
  readonly at: Vec2;
  /** Direction the deck runs (along the road). */
  readonly heading: number;
  readonly length: number;
  readonly width: number;
}

/** `gravel`: the quarry floor (bare stone that keeps the day's heat). */
export type FieldKind = 'plowed' | 'grass' | 'stubble' | 'gravel';

export interface FieldDef {
  readonly kind: FieldKind;
  readonly polygon: readonly Vec2[];
}

export interface TreeLineDef {
  readonly points: readonly Vec2[];
  /** Trees per 10 m of line. */
  readonly density: number;
}

/** `mast`: a radio relay mast; `tank`: a fuel tank (M8+ Phase D). */
export type BuildingKind =
  'house' | 'barn' | 'shed' | 'clinic' | 'garage' | 'canopy' | 'mast' | 'tank';

export interface BuildingDef {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly pos: Vec2;
  readonly rot: number;
  /** Footprint [width along local x, depth along local z]. */
  readonly size: Vec2;
  readonly floors?: 1 | 2;
  /** Firing on it fails the mission (the clinic). */
  readonly protected?: boolean;
  /** Goes up in a fireball when hit hard enough (the fuel depot's tanks). */
  readonly explosive?: boolean;
}

/** Long solid strips: hedgerows, compound walls, quarry rock faces. */
export type WallKind = 'hedge' | 'wall' | 'rock';

export interface WallDef {
  readonly kind: WallKind;
  readonly points: readonly Vec2[];
  readonly height: number;
  readonly thickness: number;
}

/** Small solid objects soldiers can hide behind. */
/** `wreck`: a burnt-out car (cold); `grave`: a headstone (M8+ Phase D). */
export type PropKind = 'car' | 'hay' | 'crates' | 'wreck' | 'grave';

export interface PropDef {
  readonly kind: PropKind;
  readonly pos: Vec2;
  readonly rot: number;
}

/** A forest: trees filling a polygon, except in its clearings (M8+ Phase D). */
export interface ForestDef {
  readonly id: string;
  readonly polygon: readonly Vec2[];
  /** Average distance between trees (m). */
  readonly spacing: number;
  readonly clearings: readonly { readonly center: Vec2; readonly radius: number }[];
}

/** Poles every `spacing` meters along a line, with wires between their tops. */
export interface PowerLineDef {
  readonly points: readonly Vec2[];
  readonly spacing: number;
}

export interface EnemyPathDef {
  readonly zone: ZoneId;
  readonly points: readonly Vec2[];
}

export interface MapData {
  readonly terrain: TerrainShape;
  readonly flats: readonly FlatArea[];
  readonly roads: readonly RoadDef[];
  readonly stream: StreamDef;
  readonly bridges: readonly BridgeDef[];
  readonly fields: readonly FieldDef[];
  readonly treeLines: readonly TreeLineDef[];
  readonly forests: readonly ForestDef[];
  readonly powerLines: readonly PowerLineDef[];
  /** AA gun emplacements (M8+ Phase E): dormant until the mission activates them. */
  readonly aaSites: readonly { readonly id: string; readonly pos: Vec2 }[];
  readonly buildings: readonly BuildingDef[];
  readonly walls: readonly WallDef[];
  readonly props: readonly PropDef[];
  readonly zones: Readonly<Record<ZoneId, Zone>>;
  /** Ridgeback's route segments (M7's `moveTeam` uses them by id), in journey order. */
  readonly friendlyRoutes: Readonly<Record<string, readonly Vec2[]>>;
  readonly routeOrder: readonly string[];
  /** Infantry approach paths (spawn → cover area), by id. */
  readonly enemyPaths: Readonly<Record<string, EnemyPathDef>>;
  /** Where enemies appear, per zone (tree lines, doorways, street ends). */
  readonly spawnPoints: Readonly<Record<ZoneId, readonly Vec2[]>>;
  /** Vehicle routes along the roads, by id (convoys, the village technical). */
  readonly vehiclePaths: Readonly<Record<string, readonly Vec2[]>>;
}
