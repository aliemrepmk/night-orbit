import type { BuildingDef, MapData, PropDef, Vec2 } from './mapTypes';

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
  // Along the back street (south of the main road)
  ['v_b1', -95, 168, 0.02, 10, 8, 1],
  ['v_b2', -65, 166, 0, 9, 8, 2],
  ['v_b3', -35, 165, 0, 10, 8, 1],
  ['v_b4', 0, 168, 0.05, 9, 7, 1],
  ['v_b5', 28, 171, 0.05, 10, 8, 1],
  ['v_b6', 86, 166, -0.3, 9, 8, 1],
  ['v_b7', 118, 104, -0.5, 8, 7, 1],
  // Along the west lane
  ['v_l1', -112, -8, 0.2, 9, 8, 1],
  ['v_l2', -128, -58, 0.3, 8, 7, 1],
  ['v_l3', -72, -36, 0.2, 9, 8, 1],
  // Along the east street
  ['v_x1', 145, -14, 0.1, 9, 8, 1],
  ['v_x2', 198, -40, 0.3, 10, 8, 2],
  ['v_x3', 160, -80, 0.3, 8, 7, 1],
  ['v_x4', 202, 12, 0, 9, 8, 1],
  // North edge
  ['v_o1', -62, -112, 0.2, 9, 8, 1],
  ['v_o2', 56, -96, 0.1, 9, 8, 1],
  ['v_o3', 60, -60, 0, 10, 8, 1],
];

/**
 * The outer village (M7 play-test feedback: "make the village a lot bigger"): 100 more houses
 * in rows along every village street and the two outer lanes (`north_row`, `south_row`),
 * placed by a one-off script that kept them 14 m apart, off the roads and clear of every
 * route, approach path and spawn point; then checked by `validateMap`.
 */
const OUTER_VILLAGE: readonly (readonly [string, number, number, number, number, number, 1 | 2])[] =
  [
    ['v_g1', -67, 52, 0.32, 11, 7, 1],
    ['v_g2', -11, 59, 0.05, 9, 8, 1],
    ['v_g3', 12, 59, 0, 10, 7, 1],
    ['v_g4', 64, 60, 0.01, 10, 8, 1],
    ['v_g5', 114, 56, 0.02, 9, 7, 2],
    ['v_g6', 149, 54, 0.09, 9, 8, 1],
    ['v_g7', 166, 50, 0.15, 9, 8, 1],
    ['v_g8', 175, 27, 0.06, 10, 7, 1],
    ['v_g9', 187, 50, 0.08, 9, 8, 2],
    ['v_g10', 222, 20, 0.16, 8, 8, 1],
    ['v_g11', 225, 44, 0.12, 9, 7, 1],
    ['v_g12', 240, 19, 0.13, 10, 7, 2],
    ['v_g13', 243, 42, 0.04, 9, 8, 2],
    ['v_g14', -6, -9, 1.46, 10, 7, 1],
    ['v_g15', 15, -16, 1.49, 11, 7, 1],
    ['v_g16', 0, -99, 1.94, 9, 8, 1],
    ['v_g17', -31, -117, 1.98, 10, 8, 1],
    ['v_g18', -11, -130, 2.01, 8, 7, 2],
    ['v_g19', -29, -164, 2.03, 10, 8, 1],
    ['v_g20', -48, -158, 2.01, 9, 8, 1],
    ['v_g21', -58, -193, 1.83, 9, 8, 2],
    ['v_g22', -40, -202, 1.8, 9, 8, 1],
    ['v_g23', -62, 138, 0.07, 9, 8, 1],
    ['v_g24', -18, 137, -0.09, 8, 8, 1],
    ['v_g25', 3, 136, -0.12, 11, 8, 2],
    ['v_g26', 29, 139, -0.01, 10, 8, 1],
    ['v_g27', 69, 134, 0.24, 8, 8, 2],
    ['v_g28', 88, 127, 0.38, 10, 8, 1],
    ['v_g29', 105, 122, 0.3, 8, 8, 1],
    ['v_g30', 114, 141, 0.35, 10, 8, 1],
    ['v_g31', 134, 131, 0.96, 9, 7, 1],
    ['v_g32', 137, 94, 1.04, 10, 7, 1],
    ['v_g33', 152, 104, 1.03, 11, 7, 1],
    ['v_g34', 132, 74, 1.99, 10, 8, 1],
    ['v_g35', -89, -21, 1.82, 11, 8, 1],
    ['v_g36', -93, -45, 1.89, 11, 8, 1],
    ['v_g37', -100, -65, 1.77, 9, 7, 1],
    ['v_g38', -104, -85, 1.74, 9, 8, 1],
    ['v_g39', -124, -84, 1.83, 8, 8, 1],
    ['v_g40', -109, -117, 1.72, 9, 7, 2],
    ['v_g41', -131, -116, 1.79, 9, 8, 2],
    ['v_g42', -137, -139, 1.73, 9, 8, 1],
    ['v_g43', -114, -149, 1.71, 9, 8, 1],
    ['v_g44', -138, -157, 1.71, 9, 8, 1],
    ['v_g45', 180, -23, 1.46, 8, 8, 1],
    ['v_g46', 164, -42, 1.27, 9, 8, 2],
    ['v_g47', 191, -62, 1.27, 10, 7, 1],
    ['v_g48', 176, -72, 1.28, 10, 7, 1],
    ['v_g49', 180, -93, 1.26, 9, 8, 1],
    ['v_g50', 202, -99, 1.25, 9, 7, 1],
    ['v_g51', 187, -124, 1.28, 9, 8, 2],
    ['v_g52', 67, 104, -1.57, 8, 8, 1],
    ['v_g53', 46, 120, -1.66, 9, 8, 1],
    ['v_g54', 63, 172, -1.67, 9, 7, 1],
    ['v_g55', 41, 189, -1.54, 10, 7, 1],
    ['v_g56', -101, 205, 0.02, 11, 8, 2],
    ['v_g57', -78, 223, 0.02, 11, 8, 1],
    ['v_g58', -72, 203, -0.02, 8, 8, 1],
    ['v_g59', -58, 226, 0.04, 11, 7, 1],
    ['v_g60', -46, 206, -0.1, 11, 8, 1],
    ['v_g61', -35, 226, -0.08, 8, 8, 2],
    ['v_g62', -15, 204, 0.03, 9, 8, 1],
    ['v_g63', -11, 227, 0.07, 9, 8, 1],
    ['v_g64', 7, 225, -0.02, 10, 8, 1],
    ['v_g65', 11, 204, 0.1, 10, 8, 1],
    ['v_g66', 29, 222, 0.11, 8, 8, 2],
    ['v_g67', 69, 218, 0.22, 9, 8, 2],
    ['v_g68', 70, 196, 0.19, 10, 8, 2],
    ['v_g69', 89, 214, 0.27, 10, 7, 1],
    ['v_g70', 88, 193, 0.18, 8, 8, 1],
    ['v_g71', 112, 191, 0.2, 9, 7, 1],
    ['v_g72', 119, 211, 0.14, 9, 8, 2],
    ['v_g73', -89, -129, -0.03, 11, 8, 1],
    ['v_g74', -81, -150, -0.03, 8, 8, 2],
    ['v_g75', -63, -131, -0.03, 9, 7, 1],
    ['v_g76', 6, -156, 0.03, 10, 8, 1],
    ['v_g77', 11, -132, 0.12, 9, 8, 1],
    ['v_g78', 35, -156, 0.05, 11, 8, 1],
    ['v_g79', 49, -138, -0.22, 9, 8, 2],
    ['v_g80', 58, -154, -0.15, 9, 7, 1],
    ['v_g81', 66, -132, -0.13, 9, 8, 1],
    ['v_g82', 87, -152, -0.2, 8, 8, 1],
    ['v_g83', 89, -129, -0.21, 10, 8, 1],
    ['v_g84', 110, -127, -0.14, 9, 8, 1],
    ['v_g85', 116, -146, -0.16, 9, 8, 1],
    ['v_g86', 128, -120, -0.38, 9, 8, 1],
    ['v_g87', 151, -134, -0.33, 8, 7, 1],
    ['v_g88', 150, -113, -0.33, 8, 8, 1],
    ['v_g89', 30, -27, 1.71, 8, 7, 1],
    ['v_g90', -13, -171, 1.92, 11, 8, 1],
    ['v_g91', -72, -183, 1.85, 9, 7, 2],
    ['v_g92', -23, -204, 1.93, 9, 7, 1],
    ['v_g93', -88, -103, 1.69, 10, 7, 2],
    ['v_g94', -143, -95, 1.73, 9, 8, 2],
    ['v_g95', -96, 240, 0, 10, 8, 1],
    ['v_g96', 7, 185, 0.12, 9, 8, 2],
    ['v_g97', 96, -167, -0.23, 10, 8, 1],
    ['v_g98', 131, -159, -0.39, 9, 8, 2],
    ['v_g99', 147, -152, -0.27, 8, 7, 2],
    ['v_g100', 173, -144, -0.27, 10, 8, 1],
  ];

const BUILDINGS: readonly BuildingDef[] = [
  // Farm (fields zone)
  { id: 'farmhouse', kind: 'house', pos: [-470, 40], rot: 0.2, size: [12, 9], floors: 2 },
  { id: 'barn', kind: 'barn', pos: [-428, 8], rot: 0.2, size: [18, 12] },
  { id: 'farm_shed', kind: 'shed', pos: [-502, 14], rot: 0.2, size: [6, 5] },
  // Village
  ...[...VILLAGE, ...OUTER_VILLAGE].map(([id, x, z, rot, w, d, floors]): BuildingDef => ({
    id,
    kind: 'house',
    pos: [x, z],
    rot,
    size: [w, d],
    floors,
  })),
  // A workshop at the east end of the village
  { id: 'workshop', kind: 'garage', pos: [176, 76], rot: 0, size: [12, 9] },
  // The field clinic on the east side of the square: generator heat, lit windows. Protected.
  { id: 'clinic', kind: 'clinic', pos: [42, 14], rot: 0, size: [18, 12], protected: true },
  // Crossroads: gas station (canopy + shop), a garage, two houses
  { id: 'gas_canopy', kind: 'canopy', pos: [290, 72], rot: 0.05, size: [14, 10] },
  { id: 'gas_shop', kind: 'garage', pos: [268, 90], rot: 0.05, size: [10, 8] },
  { id: 'garage', kind: 'garage', pos: [290, -22], rot: -0.1, size: [12, 9] },
  { id: 'x_house1', kind: 'house', pos: [382, -22], rot: 0.1, size: [9, 8] },
  { id: 'x_house2', kind: 'house', pos: [420, 52], rot: -0.3, size: [10, 8] },
  // M8+ Phase D: the fuel depot behind the crossroads garage. The tanks explode when hit.
  { id: 'depot_tank1', kind: 'tank', pos: [268, -52], rot: 0, size: [9, 9], explosive: true },
  { id: 'depot_tank2', kind: 'tank', pos: [268, -74], rot: 0, size: [9, 9], explosive: true },
  { id: 'depot_tank3', kind: 'tank', pos: [290, -64], rot: 0, size: [9, 9], explosive: true },
  // The radio relay on the hill north of the village (an AA site from Phase E).
  { id: 'relay_mast', kind: 'mast', pos: [122, -475], rot: 0, size: [3, 3] },
  { id: 'relay_hut', kind: 'shed', pos: [148, -470], rot: 0, size: [7, 5] },
  // A farm hamlet on the south fields.
  { id: 'hamlet_1', kind: 'house', pos: [-395, 300], rot: 0.15, size: [9, 8] },
  { id: 'hamlet_2', kind: 'house', pos: [-370, 324], rot: -0.2, size: [8, 7] },
  { id: 'hamlet_3', kind: 'house', pos: [-414, 330], rot: 0.4, size: [10, 8] },
  { id: 'hamlet_barn', kind: 'barn', pos: [-345, 294], rot: 0.1, size: [15, 10] },
  // Black Pine Forest: the sawmill (alternate LZ SAWMILL) and the forester's lodge.
  { id: 'sawmill', kind: 'barn', pos: [626, -406], rot: 0.1, size: [24, 12] },
  { id: 'mill_shed', kind: 'shed', pos: [566, -414], rot: -0.1, size: [8, 6] },
  { id: 'lodge', kind: 'house', pos: [520, -250], rot: 0.3, size: [10, 8] },
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
  { kind: 'car', pos: [-50, 154], rot: 0 },
  { kind: 'car', pos: [100, 150], rot: -0.3 },
  { kind: 'crates', pos: [160, 86], rot: 0.1 },
  { kind: 'car', pos: [-120, -32], rot: 1.3 },
  { kind: 'car', pos: [206, -76], rot: 1.2 },
  { kind: 'hay', pos: [-140, -30], rot: 0.4 },
  // Crossroads
  { kind: 'car', pos: [310, 76], rot: 0.05 },
  { kind: 'car', pos: [372, -6], rot: 0.8 },
  { kind: 'crates', pos: [300, 4], rot: 0.3 },
  // M8+ Phase D: burnt-out wrecks by the roads (cold, dark shapes).
  { kind: 'wreck', pos: [336, -262], rot: 1.2 },
  { kind: 'wreck', pos: [520, -14], rot: 0.3 },
  { kind: 'wreck', pos: [-160, 180], rot: 2.1 },
  { kind: 'wreck', pos: [690, -40], rot: -0.6 },
  // Log piles at the sawmill.
  { kind: 'crates', pos: [592, -432], rot: 0.1 },
  { kind: 'crates', pos: [646, -380], rot: 0.5 },
  // Headstones in the cemetery west of the village.
  ...[0, 1, 2, 3].flatMap((i) =>
    [0, 1, 2].map((j): PropDef => ({ kind: 'grave', pos: [-187 + i * 8, -47 + j * 8], rot: 0 })),
  ),
];

export const MAP: MapData = {
  terrain: { seed: 1337, hillHeight: 18, valleyStart: 760, valleyRise: 140 },

  // Level ground under the places people walk and build.
  flats: [
    { center: [-660, 170], radius: 30, falloff: 40 }, // OP
    { center: [-460, 30], radius: 50, falloff: 40 }, // farmyard
    { center: [10, 30], radius: 215, falloff: 30 }, // village (outer village too; stops short of the stream)
    { center: [330, 25], radius: 120, falloff: 60 }, // crossroads
    { center: [560, 300], radius: 130, falloff: 80 }, // quarry floor
    { center: [600, -385], radius: 60, falloff: 40 }, // sawmill clearing (LZ SAWMILL)
    { center: [135, -465], radius: 34, falloff: 30 }, // radio relay compound
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
      id: 'back_street',
      kind: 'dirt',
      width: 5,
      points: [
        [-112, 148],
        [-30, 146],
        [55, 150],
        [125, 128],
        [150, 92],
        [132, 46],
      ],
    },
    {
      id: 'west_lane',
      kind: 'dirt',
      width: 5,
      points: [
        [-80, 68],
        [-90, 10],
        [-114, -86],
        [-130, -170],
      ],
    },
    {
      id: 'east_street',
      kind: 'dirt',
      width: 5,
      points: [
        [160, 41],
        [172, -30],
        [196, -110],
        [214, -190],
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
        [52, 212],
      ],
    },
    {
      id: 'south_row',
      kind: 'dirt',
      width: 5,
      points: [
        [-104, 214],
        [-20, 216],
        [52, 212],
        [128, 196],
      ],
    },
    {
      id: 'north_row',
      kind: 'dirt',
      width: 5,
      points: [
        [-124, -138],
        [-28, -140],
        [45, -148],
        [120, -135],
        [196, -110],
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
    // M8+ Phase D: forest tracks and the relay track.
    {
      id: 'logging_road',
      kind: 'dirt',
      width: 5,
      points: [
        [358, -330],
        [450, -352],
        [540, -372],
        [600, -382],
      ],
    },
    {
      id: 'forest_track',
      kind: 'dirt',
      width: 5,
      points: [
        [640, -2],
        [655, -120],
        [640, -250],
        [606, -342],
        [600, -382],
      ],
    },
    {
      id: 'relay_track',
      kind: 'dirt',
      width: 4,
      points: [
        [214, -190],
        [192, -300],
        [152, -410],
        [137, -448],
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

  bridges: [{ id: 'farm_bridge', at: [-225, 130], heading: 1.64, length: 16, width: 8 }],

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
      kind: 'gravel',
      polygon: [
        [478, 205],
        [600, 188],
        [680, 236],
        [690, 360],
        [630, 418],
        [520, 420],
        [462, 340],
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
    // M8+ Phase D: an orchard west of the hamlet (rows of fruit trees).
    ...[0, 1, 2, 3, 4].map((i) => ({
      points: [
        [-492, 290 + i * 11],
        [-440, 290 + i * 11],
      ] as Vec2[],
      density: 1.7,
    })),
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
    // M8+ Phase D: the cemetery west of the village (gate on the east side) and the relay compound.
    {
      kind: 'wall',
      points: [
        [-157, -40],
        [-157, -55],
        [-196, -55],
        [-196, -25],
        [-157, -25],
        [-157, -32],
      ],
      height: 1.6,
      thickness: 0.6,
    },
    {
      kind: 'wall',
      points: [
        [128, -440],
        [108, -440],
        [108, -492],
        [162, -492],
        [162, -440],
        [146, -440],
      ],
      height: 2.4,
      thickness: 0.5,
    },
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
    village: { center: [10, 30], radius: 240 },
    crossroads: { center: [330, 20], radius: 120 },
    lz: { center: [560, 300], radius: 140 },
    forest: { center: [595, -380], radius: 230 },
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
    // M8+ Phase D, a branch (not in routeOrder: the briefing doesn't give it away): from the quarry out through its north-east gap, over the east road and up the forest track to LZ SAWMILL.
    route_lz_sawmill: [
      [560, 300],
      [640, 262],
      [681, 228],
      [690, 170],
      [668, 60],
      [641, -2],
      [655, -120],
      [640, -250],
      [607, -340],
      [588, -362],
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
    // M8+ Phase D: into Black Pine Forest from every side.
    forest_north: {
      zone: 'forest',
      points: [
        [560, -690],
        [578, -560],
        [590, -450],
      ],
    },
    forest_east: {
      zone: 'forest',
      points: [
        [770, -390],
        [705, -392],
        [645, -378],
      ],
    },
    forest_west: {
      zone: 'forest',
      points: [
        [376, -470],
        [470, -440],
        [556, -400],
      ],
    },
    forest_south: {
      zone: 'forest',
      points: [
        [740, -70],
        [705, -200],
        [640, -300],
      ],
    },
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
    village_west: {
      zone: 'village',
      points: [
        [-130, -170],
        [-114, -86],
        [-90, 10],
        [-82, 50],
      ],
    },
    village_northeast: {
      zone: 'village',
      points: [
        [214, -190],
        [196, -110],
        [172, -30],
        [140, 30],
      ],
    },
    village_south: {
      zone: 'village',
      points: [
        [52, 260],
        [52, 180],
        [56, 100],
        [40, 60],
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
      [-660, -110],
      [-520, -116],
      [-380, -104],
      [-640, 250],
      [-520, 330],
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
      [-150, -120],
      [240, -120],
      [230, 120],
      [-20, 230],
      [120, 200],
      [-150, 40],
      [210, -10],
      [190, 80],
      [76, -4],
      [-26, -34],
      [101, 25],
    ],
    crossroads: [
      [260, -160],
      [520, 120],
      [440, -110],
      [372, -220],
      [500, -50],
      [460, 110],
    ],
    lz: [
      [780, 120],
      [780, 470],
      [380, 420],
    ],
    forest: [
      [560, -690],
      [770, -390],
      [376, -470],
      [740, -70],
      [460, -570],
      [700, -560],
      [470, -230],
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
    // M8+ Phase D: down the north road and the logging road to the sawmill, and up the forest track.
    logging_convoy: [
      [330, -790],
      [345, -500],
      [358, -330],
      [450, -352],
      [540, -372],
      [585, -380],
    ],
    forest_column: [
      [790, -10],
      [640, -2],
      [655, -120],
      [640, -250],
      [606, -342],
    ],
    // M8+ Phase F: the commander's car fleeing from the north road down the east road, and the
    // civilian bus crossing the village on the main road.
    hvt_escape: [
      [345, -500],
      [360, -300],
      [338, -120],
      [330, 20],
      [450, 12],
      [600, 0],
      [790, -10],
    ],
    bus_route: [
      [790, -10],
      [600, 0],
      [450, 12],
      [330, 20],
      [200, 35],
      [130, 45],
      [70, 50],
      [20, 48],
      [-20, 50],
      [-60, 62],
      [-110, 80],
    ],
    // M7: technicals that drive up the quarry track at Ridgeback during the extraction.
    lz_technical: [
      [790, -10],
      [600, 0],
      [450, 12],
      [370, 17],
      [330, 20],
      [400, 92],
      [470, 190],
      [512, 240],
    ],
  },

  // M8+ Phase D: Black Pine Forest, north-east between the north road and the valley wall, with
  // the sawmill clearing (LZ SAWMILL) in it.
  forests: [
    {
      id: 'black_pine',
      polygon: [
        [410, -170],
        [560, -135],
        [700, -160],
        [772, -260],
        [772, -620],
        [640, -720],
        [470, -705],
        [400, -560],
        [396, -330],
      ],
      spacing: 9,
      clearings: [{ center: [598, -385], radius: 70 }],
    },
  ],

  // A power line along the east side of the north road.
  powerLines: [
    {
      points: [
        [362, -60],
        [374, -200],
        [386, -300],
        [372, -500],
        [356, -780],
      ],
      spacing: 45,
    },
  ],

  // M8+ Phase E: AA gun emplacements near each zone (within the sensor's reach of the orbit
  // there, so every gun that opens up on you can be shot back). `aa_forest` is hidden in the woods.
  aaSites: [
    { id: 'aa_ridge', pos: [-420, -160] },
    { id: 'aa_village', pos: [20, -215] },
    { id: 'aa_crossroads', pos: [450, -110] },
    { id: 'aa_forest', pos: [700, -470] },
    { id: 'aa_lz', pos: [705, 395] },
  ],
};
