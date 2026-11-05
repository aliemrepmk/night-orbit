/**
 * The shape of the handcrafted map (PLAN.md §7.12). Pure data types: `MapData.ts` holds THE map,
 * `validateMap.ts` checks it, `WorldBuilder.ts` turns it into meshes and collision.
 * Coordinates are `[x, z]` in meters (+x east, −z north); rotations in radians about +y.
 */
export type Vec2 = readonly [number, number];

export type ZoneId = 'op' | 'fields' | 'village' | 'crossroads' | 'lz';

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

export type FieldKind = 'plowed' | 'grass' | 'stubble';

export interface FieldDef {
  readonly kind: FieldKind;
  readonly polygon: readonly Vec2[];
}

export interface TreeLineDef {
  readonly points: readonly Vec2[];
  /** Trees per 10 m of line. */
  readonly density: number;
}

export type BuildingKind = 'house' | 'barn' | 'shed' | 'clinic' | 'garage' | 'canopy';

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
export type PropKind = 'car' | 'hay' | 'crates';

export interface PropDef {
  readonly kind: PropKind;
  readonly pos: Vec2;
  readonly rot: number;
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
