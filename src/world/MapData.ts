import type { BuildingDef, MapData, PropDef } from './mapTypes';

/**
 * THE handcrafted map of the Varesh Valley (PLAN.md §7.12): west → east, Ridgeback's journey runs
 * from the OP across the fields and the stream, through the village (clinic on the square), over
 * the crossroads and on to the quarry LZ. Edit this data, not the builder, to change the map; the
 * debug overlay (F2 in dev builds) and the placer (P logs the crosshair point) help with that.
 * `validateMap.test.ts` keeps it consistent (ids, inside the map, nothing on the roads).
 */

// Village houses: [id, x, z, rot, width, depth, floors].
const VILLAGE: readonly (readonly [string, number, number, number, number, number, 1 | 2])[] = [
  // West end, north of the main road
  ['v_w1', -95, 52, 0.35, 10, 8, 1],
  ['v_w2', -70, 37, 0.35, 9, 7, 2],
  ['v_w3', -45, 22, 0.3, 11, 8, 1],
  ['v_w4', -98, 22, 0.2, 8, 7, 1],
  ['v_w5', -66, 2, 0.1, 10, 8, 2],
  ['v_w6', -40, -15, 0, 9, 8, 1],
  // West end, south of the main road
  ['v_s1', -92, 97, 0.35, 10, 8, 1],
  ['v_s2', -60, 86, 0.35, 9, 7, 2],
  ['v_s3', -30, 76, 0.25, 10, 8, 1],
  ['v_s4', -78, 122, 0.3, 8, 7, 1],
  ['v_s5', -42, 110, 0.2, 9, 8, 1],
  // East of the square, south of the main road
  ['v_e1', 12, 76, 0, 10, 8, 2],
  ['v_e2', 31, 80, 0.05, 8, 7, 1],
  ['v_e3', 64, 77, -0.05, 9, 8, 1],
  ['v_e4', 96, 72, -0.05, 9, 8, 2],
  ['v_e5', 88, 106, 0.1, 8, 7, 1],
  ['v_e6', 22, 112, 0, 9, 8, 1],
  // East of the square, north of the main road
  ['v_n1', 72, 18, 0, 10, 8, 2],
  ['v_n2', 101, 14, 0.05, 9, 8, 1],
  ['v_n3', 127, 20, 0.08, 8, 7, 1],
  ['v_n4', 76, -16, 0, 10, 8, 1],
  ['v_n5', 110, -22, 0.1, 9, 7, 1],
  // Along the north street
  ['v_k1', -26, -46, 0.2, 9, 8, 1],
  ['v_k2', 24, -50, 0.15, 10, 8, 2],
  ['v_k3', -34, -82, 0.25, 8, 7, 1],
  ['v_k4', 18, -86, 0.2, 9, 8, 1],
];

const BUILDINGS: readonly BuildingDef[] = [
  // Farm (fields zone)
  { id: 'farmhouse', kind: 'house', pos: [-470, 40], rot: 0.2, size: [12, 9], floors: 2 },
  { id: 'barn', kind: 'barn', pos: [-428, 8], rot: 0.2, size: [18, 12] },
  { id: 'farm_shed', kind: 'shed', pos: [-502, 14], rot: 0.2, size: [6, 5] },
  // Village
  ...VILLAGE.map(([id, x, z, rot, w, d, floors]): BuildingDef => ({
    id,
    kind: 'house',
    pos: [x, z],
    rot,
    size: [w, d],
    floors,
  })),
  // The field clinic on the east side of the square: generator heat, lit windows. Protected.
  { id: 'clinic', kind: 'clinic', pos: [42, 14], rot: 0, size: [18, 12], protected: true },
  // Crossroads: gas station (canopy + shop), a garage, two houses
  { id: 'gas_canopy', kind: 'canopy', pos: [290, 72], rot: 0.05, size: [14, 10] },
  { id: 'gas_shop', kind: 'garage', pos: [268, 90], rot: 0.05, size: [10, 8] },
  { id: 'garage', kind: 'garage', pos: [290, -22], rot: -0.1, size: [12, 9] },
  { id: 'x_house1', kind: 'house', pos: [382, -22], rot: 0.1, size: [9, 8] },
  { id: 'x_house2', kind: 'house', pos: [420, 52], rot: -0.3, size: [10, 8] },
];

const PROPS: readonly PropDef[] = [
  // Hay bales in the fields and the farmyard
  { kind: 'hay', pos: [-540, 90], rot: 0.3 },
  { kind: 'hay', pos: [-520, 96], rot: 1.1 },
  { kind: 'hay', pos: [-430, 220], rot: 0.2 },
  { kind: 'hay', pos: [-410, 236], rot: 0.9 },
  { kind: 'hay', pos: [-450, 60], rot: 0 },
  // Parked cars and crates in the village and on the square
  { kind: 'car', pos: [-14, 8], rot: 0.1 },
  { kind: 'car', pos: [16, 2], rot: 1.5 },
  { kind: 'crates', pos: [-24, 14], rot: 0.4 },
  { kind: 'car', pos: [-76, 78], rot: 0.35 },
  { kind: 'car', pos: [84, 58], rot: 0 },
  { kind: 'crates', pos: [52, 36], rot: 0.2 },
  { kind: 'crates', pos: [-12, -40], rot: 0.6 },
  // Crossroads
  { kind: 'car', pos: [310, 76], rot: 0.05 },
  { kind: 'car', pos: [372, -6], rot: 0.8 },
  { kind: 'crates', pos: [300, 4], rot: 0.3 },
];

export const MAP: MapData = {
  terrain: { seed: 1337, hillHeight: 18, valleyStart: 760, valleyRise: 140 },

  // Level ground under the places people walk and build.
  flats: [
    { center: [-660, 170], radius: 30, falloff: 40 }, // OP
    { center: [-460, 30], radius: 50, falloff: 40 }, // farmyard
    { center: [0, 40], radius: 160, falloff: 80 }, // village
    { center: [330, 25], radius: 120, falloff: 60 }, // crossroads
    { center: [560, 300], radius: 130, falloff: 80 }, // quarry floor
  ],

  roads: [
    {
      id: 'farm_track',
      kind: 'dirt',
      width: 5,
      points: [
        [-660, 170],
        [-560, 150],
        [-430, 140],
        [-300, 135],
        [-225, 130],
        [-150, 110],
        [-110, 80],
      ],
    },
    {
      id: 'farm_drive',
      kind: 'dirt',
      width: 4,
      points: [
        [-452, 139],
        [-455, 58],
      ],
    },
    {
      id: 'main_road',
      kind: 'paved',
      width: 7,
      points: [
        [-110, 80],
        [-60, 62],
        [-20, 50],
        [20, 48],
        [70, 50],
        [130, 45],
        [200, 35],
        [330, 20],
      ],
    },
    {
      id: 'north_street',
      kind: 'dirt',
      width: 5,
      points: [
        [0, 48],
        [5, -20],
        [-6, -90],
        [-40, -165],
        [-70, -260],
      ],
    },
    {
      id: 'south_lane',
      kind: 'dirt',
      width: 5,
      points: [
        [45, 48],
        [56, 100],
        [52, 180],
      ],
    },
    {
      id: 'north_road',
      kind: 'paved',
      width: 7,
      points: [
        [330, -790],
        [345, -500],
        [360, -300],
        [338, -120],
        [330, 20],
      ],
    },
    {
      id: 'east_road',
      kind: 'paved',
      width: 7,
      points: [
        [790, -10],
        [600, 0],
        [450, 12],
        [330, 20],
      ],
    },
    {
      id: 'lz_track',
      kind: 'dirt',
      width: 5,
      points: [
        [330, 20],
        [400, 92],
        [470, 190],
        [530, 262],
        [560, 300],
      ],
    },
  ],

  stream: {
    width: 6,
    depth: 1.6,
    points: [
      [-270, -790],
      [-250, -500],
      [-235, -250],
      [-240, 0],
      [-225, 130],
      [-205, 300],
      [-215, 520],
      [-190, 790],
    ],
  },

  bridges: [{ id: 'farm_bridge', at: [-225, 130], heading: 1.64, length: 16, width: 6 }],

  fields: [
    {
      kind: 'plowed',
      polygon: [
        [-640, 40],
        [-520, 30],
        [-510, 118],
        [-630, 125],
      ],
    },
    {
      kind: 'grass',
      polygon: [
        [-500, 160],
        [-330, 155],
        [-320, 280],
        [-490, 300],
      ],
    },
    {
      kind: 'plowed',
      polygon: [
        [-620, 205],
        [-515, 195],
        [-505, 320],
        [-610, 332],
      ],
    },
    {
      kind: 'stubble',
      polygon: [
        [-400, 22],
        [-290, 30],
        [-292, 112],
        [-400, 104],
      ],
    },
    {
      kind: 'grass',
      polygon: [
        [-600, -60],
        [-300, -50],
        [-300, 8],
        [-600, 0],
      ],
    },
    {
      kind: 'plowed',
      polygon: [
        [-120, 190],
        [80, 205],
        [90, 330],
        [-110, 332],
      ],
    },
    {
      kind: 'grass',
      polygon: [
        [140, 120],
        [280, 112],
        [290, 260],
        [130, 270],
      ],
    },
    {
      kind: 'stubble',
      polygon: [
        [420, -300],
        [560, -290],
        [570, -160],
        [430, -170],
      ],
    },
  ],

  treeLines: [
    {
      points: [
        [-700, -95],
        [-550, -105],
        [-400, -88],
        [-262, -96],
      ],
      density: 1.1,
    }, // fields north
    {
      points: [
        [-258, -460],
        [-246, -250],
        [-252, -120],
      ],
      density: 0.6,
    }, // stream bank
    {
      points: [
        [-160, -120],
        [-60, -135],
        [60, -130],
        [160, -112],
      ],
      density: 0.6,
    }, // village north
    {
      points: [
        [400, -210],
        [500, -150],
        [620, -185],
      ],
      density: 0.8,
    }, // crossroads woods
    {
      points: [
        [-720, 480],
        [-500, 560],
        [-300, 600],
      ],
      density: 0.9,
    },
    {
      points: [
        [260, 540],
        [480, 600],
        [720, 560],
      ],
      density: 0.9,
    },
    {
      points: [
        [-640, -380],
        [-460, -450],
        [-300, -520],
      ],
      density: 0.9,
    },
    {
      points: [
        [120, -380],
        [190, -500],
        [250, -640],
      ],
      density: 0.8,
    },
  ],

  buildings: BUILDINGS,

  walls: [
    // Hedgerows between the fields (gaps where the farm track crosses)
    {
      kind: 'hedge',
      points: [
        [-560, 205],
        [-335, 192],
      ],
      height: 2.4,
      thickness: 1.6,
    },
    {
      kind: 'hedge',
      points: [
        [-382, 58],
        [-378, 126],
      ],
      height: 2.4,
      thickness: 1.6,
    },
    {
      kind: 'hedge',
      points: [
        [-376, 150],
        [-371, 282],
      ],
      height: 2.4,
      thickness: 1.6,
    },
    {
      kind: 'hedge',
      points: [
        [-600, 18],
        [-490, 12],
      ],
      height: 2.4,
      thickness: 1.6,
    },
    // Crossroads compound walls
    {
      kind: 'wall',
      points: [
        [240, 58],
        [252, 104],
      ],
      height: 2.2,
      thickness: 0.6,
    },
    {
      kind: 'wall',
      points: [
        [365, -32],
        [420, -40],
      ],
      height: 2.2,
      thickness: 0.6,
    },
    {
      kind: 'wall',
      points: [
        [300, -50],
        [302, -92],
      ],
      height: 2.2,
      thickness: 0.6,
    },
    // Quarry rock faces around the LZ: gaps to the north-east, south-east and west
    {
      kind: 'rock',
      points: [
        [512, 172],
        [590, 162],
        [668, 204],
      ],
      height: 12,
      thickness: 6,
    },
    {
      kind: 'rock',
      points: [
        [694, 252],
        [704, 352],
      ],
      height: 14,
      thickness: 7,
    },
    {
      kind: 'rock',
      points: [
        [652, 432],
        [562, 452],
        [474, 420],
      ],
      height: 12,
      thickness: 6,
    },
  ],

  props: PROPS,

  zones: {
    op: { center: [-660, 170], radius: 50 },
    fields: { center: [-440, 120], radius: 230 },
    village: { center: [0, 40], radius: 170 },
    crossroads: { center: [330, 20], radius: 120 },
    lz: { center: [560, 300], radius: 140 },
  },

  friendlyRoutes: {
    route_op_fields: [
      [-660, 170],
      [-560, 150],
      [-470, 139],
    ],
    route_fields_bridge: [
      [-470, 139],
      [-380, 138],
      [-300, 135],
      [-240, 131],
    ],
    route_bridge_village: [
      [-240, 131],
      [-200, 123],
      [-150, 110],
      [-115, 84],
    ],
    route_village_square: [
      [-115, 84],
      [-60, 64],
      [-12, 32],
    ],
    route_square_east: [
      [-12, 32],
      [60, 40],
      [140, 40],
    ],
    route_east_crossroads: [
      [140, 40],
      [230, 31],
      [312, 28],
    ],
    route_crossroads_lz: [
      [312, 28],
      [400, 96],
      [470, 194],
      [540, 278],
      [560, 300],
    ],
  },
  routeOrder: [
    'route_op_fields',
    'route_fields_bridge',
    'route_bridge_village',
    'route_village_square',
    'route_square_east',
    'route_east_crossroads',
    'route_crossroads_lz',
  ],

  enemyPaths: {
    fields_treeline: {
      zone: 'fields',
      points: [
        [-450, -112],
        [-440, -10],
        [-430, 100],
      ],
    },
    fields_hedge: {
      zone: 'fields',
      points: [
        [-560, 218],
        [-450, 212],
        [-392, 206],
      ],
    },
    village_north: {
      zone: 'village',
      points: [
        [-62, -250],
        [-38, -160],
        [-10, -90],
        [2, -20],
      ],
    },
    village_east: {
      zone: 'village',
      points: [
        [210, -10],
        [140, 10],
        [86, 2],
      ],
    },
    crossroads_north: {
      zone: 'crossroads',
      points: [
        [372, -220],
        [352, -110],
        [340, -20],
      ],
    },
    lz_ne: {
      zone: 'lz',
      points: [
        [780, 120],
        [700, 222],
        [610, 282],
      ],
    },
    lz_se: {
      zone: 'lz',
      points: [
        [780, 470],
        [690, 392],
        [610, 322],
      ],
    },
    lz_w: {
      zone: 'lz',
      points: [
        [380, 420],
        [470, 362],
        [540, 312],
      ],
    },
  },

  spawnPoints: {
    op: [],
    fields: [
      [-600, -112],
      [-450, -112],
      [-320, -108],
      [-466, 50],
      [-432, 19],
      [-560, 218],
    ],
    village: [
      [-62, -250],
      [-90, -160],
      [210, -10],
      [190, 80],
      [76, -4],
      [-26, -34],
      [101, 25],
    ],
    crossroads: [
      [372, -220],
      [500, -50],
      [460, 110],
    ],
    lz: [
      [780, 120],
      [780, 470],
      [380, 420],
    ],
  },

  vehiclePaths: {
    north_convoy: [
      [330, -790],
      [345, -500],
      [360, -300],
      [338, -120],
      [333, -20],
    ],
    east_convoy: [
      [790, -10],
      [600, 0],
      [450, 12],
      [370, 17],
    ],
    village_technical: [
      [790, -10],
      [600, 0],
      [450, 12],
      [330, 20],
      [200, 35],
      [140, 44],
    ],
  },
};
