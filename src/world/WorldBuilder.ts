import {
  BoxGeometry,
  BufferAttribute,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
} from 'three';
import { CoverSet, coverAlongBox, coverFromBoxes } from '../ai/CoverPoints';
import { CONFIG } from '../config';
import { createRng, range, type Rng } from '../core/rng';
import { HEAT } from '../fx/Heat';
import { ALBEDO, GLOW, groundAlbedo, signature, type Signature } from '../fx/Light';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Collision, CollisionBox } from './Collision';
import { forestTrees } from './forest';
import { createGroundHeat } from './groundHeat';
import { InstancedSignature } from './InstancedSignature';
import {
  toPathPoints,
  type BuildingDef,
  type MapData,
  type PropDef,
  type WallDef,
} from './mapTypes';
import { buildRoadGeometry } from './Roads';
import type { Terrain } from './Terrain';
import {
  buildingRect,
  distanceToPolyline,
  inRect,
  propRect,
  samplePolyline,
  wallRects,
  type Rect,
} from './validateMap';

/** Signatures of the map's materials (heat from `Heat.ts`, near-IR albedo/glow from `Light.ts`). */
const SIG = {
  wall: signature(HEAT.wall, ALBEDO.wall),
  barn: signature(HEAT.wall - 0.03, ALBEDO.wall * 0.9),
  roof: signature(HEAT.roof, ALBEDO.roof),
  chimney: signature(HEAT.chimney, ALBEDO.chimney),
  darkWindow: signature(HEAT.wall + 0.06, ALBEDO.window),
  hedge: signature(HEAT.tree + 0.01, ALBEDO.tree * 0.9),
  // Quarry faces: stone keeps the day's heat, so they stand out from the cooling soil.
  rock: signature(0.27, 0.42),
  car: signature(0.2, ALBEDO.vehicleBody),
  hay: signature(0.2, 0.55),
  crates: signature(0.21, 0.35),
  generator: signature(0.9, ALBEDO.vehicleBody),
  exhaust: signature(HEAT.exhaust, ALBEDO.vehicleBody),
  deck: signature(0.2, 0.3),
  // M8+ Phase D
  wreck: signature(0.15, 0.07), // burnt out: cold and dark
  stone: signature(0.24, 0.45),
  steel: signature(0.19, 0.35),
  tank: signature(0.23, 0.55),
  pole: signature(0.2, 0.22),
  wire: signature(0.17, 0.2),
  beacon: signature(0.75, 0.3, 0.9), // the mast's warning light glows in NV
  water: signature(HEAT.water, ALBEDO.water),
  paved: signature(HEAT.road, ALBEDO.road),
  dirt: signature(HEAT.road - 0.05, ALBEDO.road + 0.07),
} as const;

const litWindow = (rng: Rng): Signature =>
  signature(
    HEAT.window + range(rng, -0.05, 0.08),
    ALBEDO.window,
    GLOW.litWindow * range(rng, 0.8, 1),
  );

/** Height of one storey (m), and how far walls sink below the lowest ground under them. */
const STOREY = 3.1;
const SINK = 0.4;

/**
 * Turns `MapData` into the world (PLAN.md §7.12): the shaped terrain with field heat, roads,
 * the stream and its bridge, every building (walls, hip or gable roofs, windows, chimneys,
 * the clinic's generator), hedges, walls, quarry rock, props and tree lines, plus their
 * collision boxes and the cover points around them. Everything of a kind shares one instanced
 * draw call, so the whole map costs about a dozen draw calls.
 */
export class WorldBuilder {
  readonly root = new Group();
  readonly cover = new CoverSet();
  /** Collision boxes of protected buildings (the clinic and its generator), for M7's fail rule. */
  readonly protectedBoxes: number[] = [];
  /** Things that blow up when hit (the fuel depot's tanks, M8+ Phase D): center and radius. */
  readonly explosives: { id: string; x: number; y: number; z: number; radius: number }[] = [];
  /** Trees placed in the forests (M8+ Phase D). */
  readonly forestTreeCount: number;
  private forest: InstancedSignature | null = null;

  /** Instances every pool had to drop for lack of room (should be 0: a test checks it). */
  get droppedInstances(): number {
    return [this.boxes, this.rough, this.hipRoofs, this.trees, this.cylinders, this.forest].reduce(
      (n, p) => n + (p?.dropped ?? 0),
      0,
    );
  }

  /** Roofs drawn (one per house). */
  get roofCount(): number {
    return this.hipRoofs.count;
  }
  private readonly bridges: { rect: Rect; top: number }[] = [];

  private readonly boxes = new InstancedSignature(new BoxGeometry(1, 1, 1), 2400, 0.6);
  private readonly cylinders = new InstancedSignature(new CylinderGeometry(1, 1, 1, 16), 16, 0.5);
  private readonly rough = new InstancedSignature(new BoxGeometry(1, 1, 1), 400, 1.5);
  private readonly hipRoofs = new InstancedSignature(
    new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
    400, // one per house (was 80: since M7's 143-house village, most houses had no roof)
    0.6,
  );
  private readonly trees = new InstancedSignature(
    new ConeGeometry(3, 10, 6).translate(0, 5, 0),
    2000,
    1.5,
  );

  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly p = new Vector3();
  private readonly s = new Vector3();

  constructor(
    private readonly map: MapData,
    private readonly terrain: Terrain,
    private readonly collision: Collision,
    seed = 2024,
  ) {
    const rng = createRng(seed);
    this.addGround();
    this.addRoadsAndStream();
    for (const b of map.bridges) this.addBridge(b.at, b.heading, b.length, b.width);
    const buildingBoxes: CollisionBox[] = [];
    for (const b of map.buildings) {
      const box = this.addBuilding(b, rng);
      if (b.kind !== 'canopy') buildingBoxes.push(box);
    }
    for (const w of map.walls) this.addWall(w);
    const propBoxes = map.props.map((p) => this.addProp(p));
    this.addTrees(rng);
    const pines = map.forests.map((f) => forestTrees(map, f, createRng(seed + 7)));
    this.forestTreeCount = pines.reduce((n, t) => n + t.length, 0);
    const forest = (this.forest = new InstancedSignature(
      new ConeGeometry(2.8, 13, 7).translate(0, 6.5, 0),
      Math.max(1, this.forestTreeCount),
      1.6,
    ));
    for (const trees of pines) {
      for (const [x, z] of trees) {
        const scale = range(rng, 0.8, 1.45);
        this.q.identity();
        forest.add(
          this.m.compose(
            this.p.set(x, this.ground(x, z) - 0.5, z),
            this.q,
            this.s.set(scale, scale * range(rng, 0.85, 1.25), scale),
          ),
          signature(HEAT.tree + range(rng, -0.025, 0.015), ALBEDO.tree * range(rng, 0.8, 1.05)),
        );
      }
    }
    for (const line of map.powerLines) this.addPowerLine(line.points, line.spacing);

    // Cover: building and prop corners, both faces of every hedge, wall and rock face.
    const candidates = new CoverSet();
    coverFromBoxes(buildingBoxes, CONFIG.ai.coverMargin, candidates);
    coverFromBoxes(propBoxes, 1.0, candidates);
    for (const box of this.collision.boxes) {
      if ((box as TaggedBox).tag === 'wall') coverAlongBox(box, 9, 1.0, candidates);
    }
    this.keepOpenCover(candidates);

    this.root.add(
      this.boxes.finish(),
      this.rough.finish(),
      this.hipRoofs.finish(),
      this.trees.finish(),
      forest.finish(),
      this.cylinders.finish(),
    );
  }

  /** Ground height for people walking: the terrain, or the deck where a bridge spans the stream. */
  surfaceAt(x: number, z: number): number {
    const h = this.terrain.heightAt(x, z);
    for (const b of this.bridges) if (inRect(b.rect, x, z)) return Math.max(h, b.top);
    return h;
  }

  private ground(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  /** One instance of a unit box: center, yaw (and optional pitch along its facing), size. */
  private box(
    target: InstancedSignature,
    x: number,
    y: number,
    z: number,
    rot: number,
    w: number,
    h: number,
    d: number,
    sig: Signature,
    pitch = 0,
  ): void {
    this.e.set(pitch, rot, 0);
    this.q.setFromEuler(this.e);
    target.add(this.m.compose(this.p.set(x, y, z), this.q, this.s.set(w, h, d)), sig);
  }

  /** World position of a point given in a building's local frame (x along width, z along depth). */
  private local(
    r: { x: number; z: number; rot: number },
    lx: number,
    lz: number,
  ): [number, number] {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    return [r.x + c * lx + s * lz, r.z - s * lx + c * lz];
  }

  /** Lowest and highest ground under a footprint (corners and center). */
  private groundSpan(r: Rect): [number, number] {
    let lo = Infinity;
    let hi = -Infinity;
    for (const [lx, lz] of [
      [0, 0],
      [-r.hw, -r.hd],
      [r.hw, -r.hd],
      [r.hw, r.hd],
      [-r.hw, r.hd],
    ]) {
      const [x, z] = this.local(r, lx, lz);
      const g = this.ground(x, z);
      lo = Math.min(lo, g);
      hi = Math.max(hi, g);
    }
    return [lo, hi];
  }

  private addCollision(r: Rect, bottom: number, top: number, extra: Partial<TaggedBox> = {}) {
    const box: TaggedBox = {
      center: new Vector3(r.x, (bottom + top) / 2, r.z),
      half: new Vector3(r.hw, (top - bottom) / 2, r.hd),
      rotY: r.rot,
      ...extra,
    };
    this.collision.addBox(box);
    return box;
  }

  private addGround(): void {
    const geo = this.terrain.buildGeometry();
    const heat = createGroundHeat(4242, this.map.fields);
    const pos = geo.getAttribute('position');
    const sig = new Float32Array(pos.count * 3); // (heat, albedo, glow) per vertex
    for (let k = 0; k < pos.count; k++) {
      const h = heat(pos.getX(k), pos.getZ(k));
      sig[k * 3] = h;
      sig[k * 3 + 1] = groundAlbedo(h);
    }
    geo.setAttribute('signature', new BufferAttribute(sig, 3));
    this.root.add(new Mesh(geo, new ThermalMaterial({ source: 'vertex' })));
  }

  private addRoadsAndStream(): void {
    const flatMat = (s: Signature) => {
      const m = new ThermalMaterial({ signature: s });
      // Drawn on top of the terrain without flickering into it.
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -4;
      return m;
    };
    const paved = flatMat(SIG.paved);
    const dirt = flatMat(SIG.dirt);
    const ground = (x: number, z: number) => this.ground(x, z);
    for (const r of this.map.roads) {
      this.root.add(
        new Mesh(
          buildRoadGeometry(toPathPoints(r.points), r.width, ground),
          r.kind === 'paved' ? paved : dirt,
        ),
      );
    }
    const st = this.map.stream;
    this.root.add(
      new Mesh(
        buildRoadGeometry(toPathPoints(st.points), st.width, ground, 4, 0.35),
        flatMat(SIG.water),
      ),
    );
  }

  private addBridge(at: readonly [number, number], heading: number, length: number, width: number) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const ends = [
      this.ground(at[0] - (fx * length) / 2, at[1] - (fz * length) / 2),
      this.ground(at[0] + (fx * length) / 2, at[1] + (fz * length) / 2),
    ];
    const deckY = Math.max(...ends) + 0.1;
    // Collision convention: rotY = heading makes local +z run along the deck.
    const rect: Rect = { x: at[0], z: at[1], rot: heading, hw: width / 2, hd: length / 2 };
    this.box(this.boxes, at[0], deckY, at[1], heading, width, 0.6, length, SIG.deck);
    for (const side of [-1, 1]) {
      const [x, z] = this.local(rect, (side * width) / 2, 0);
      this.box(this.boxes, x, deckY + 0.8, z, heading, 0.25, 1.0, length, SIG.deck);
    }
    this.addCollision(rect, deckY - 0.3, deckY + 0.3, { walkable: true });
    this.bridges.push({ rect, top: deckY + 0.3 });
  }

  private addBuilding(b: BuildingDef, rng: Rng): CollisionBox {
    const r = buildingRect(b);
    const [lo, hi] = this.groundSpan(r);
    const base = lo - SINK;
    const [w, d] = b.size;
    const floors = b.floors ?? 1;
    const tall = (h: number) => hi + h; // wall top: storeys above the highest ground

    switch (b.kind) {
      case 'house': {
        const top = tall(floors * STOREY + 0.4);
        this.box(this.boxes, r.x, (base + top) / 2, r.z, r.rot, w, top - base, d, SIG.wall);
        const roofH = range(rng, 2, 3.2);
        this.e.set(0, r.rot, 0);
        this.q.setFromEuler(this.e);
        this.hipRoofs.add(
          this.m.compose(this.p.set(r.x, top, r.z), this.q, this.s.set(w + 0.6, roofH, d + 0.6)),
          SIG.roof,
        );
        this.addWindows(r, hi, floors, rng, b.id.startsWith('v_') ? 0.7 : 0.6);
        if (rng() < 0.5) {
          const [cx, cz] = this.local(r, w * 0.25, 0);
          this.box(this.boxes, cx, top + roofH * 0.55, cz, r.rot, 0.9, 2.2, 0.9, SIG.chimney);
        }
        return this.addCollision(r, base, top + roofH * 0.6);
      }
      case 'barn': {
        const top = tall(5.5);
        this.box(this.boxes, r.x, (base + top) / 2, r.z, r.rot, w, top - base, d, SIG.barn);
        // Gable roof: two tilted planes meeting at a ridge along the barn's length (local x).
        const pitch = 0.6;
        const slope = (d / 2 + 0.5) / Math.cos(pitch);
        const rise = Math.tan(pitch) * (d / 2);
        for (const side of [-1, 1]) {
          const [x, z] = this.local(r, 0, (side * d) / 4);
          this.box(
            this.boxes,
            x,
            top + rise / 2,
            z,
            r.rot,
            w + 0.8,
            0.3,
            slope,
            SIG.roof,
            side * pitch,
          );
        }
        return this.addCollision(r, base, top + rise * 0.6);
      }
      case 'shed':
      case 'garage': {
        const top = tall(b.kind === 'shed' ? 2.8 : 3.6);
        this.box(this.boxes, r.x, (base + top) / 2, r.z, r.rot, w, top - base, d, SIG.wall);
        this.box(this.boxes, r.x, top + 0.15, r.z, r.rot, w + 0.4, 0.3, d + 0.4, SIG.roof);
        if (b.kind === 'garage') this.addWindows(r, hi, 1, rng, 0.4);
        return this.addCollision(r, base, top + 0.3);
      }
      case 'clinic': {
        const top = tall(4.2);
        this.box(this.boxes, r.x, (base + top) / 2, r.z, r.rot, w, top - base, d, SIG.wall);
        this.box(this.boxes, r.x, top + 0.2, r.z, r.rot, w + 0.6, 0.4, d + 0.6, SIG.roof);
        this.addWindows(r, hi, 1, rng, 1, true); // every room lit, on all four sides
        // The generator: the hottest thing on the square, and how the FCO tells it apart.
        const [gx, gz] = this.local(r, w / 2 + 2.2, 0);
        const g = this.ground(gx, gz);
        this.box(this.boxes, gx, g + 0.8, gz, r.rot, 1.4, 1.6, 2.4, SIG.generator);
        this.box(this.boxes, gx, g + 2.2, gz, r.rot, 0.25, 1.4, 0.25, SIG.exhaust);
        const genRect: Rect = { x: gx, z: gz, rot: r.rot, hw: 0.7, hd: 1.2 };
        this.collision.addBox({
          center: new Vector3(gx, g + 0.8, gz),
          half: new Vector3(genRect.hw, 0.8, genRect.hd),
          rotY: r.rot,
        });
        this.protectedBoxes.push(this.collision.boxes.length - 1);
        const box = this.addCollision(r, base, top + 0.4);
        this.protectedBoxes.push(this.collision.boxes.length - 1);
        return box;
      }
      case 'mast': {
        // A tall steel radio mast with two platforms and a warning light on top.
        const top = hi + 42;
        this.box(this.boxes, r.x, (base + top) / 2, r.z, r.rot, 1.2, top - base, 1.2, SIG.steel);
        for (const y of [hi + 18, hi + 32])
          this.box(this.boxes, r.x, y, r.z, r.rot, 3.2, 0.3, 3.2, SIG.steel);
        this.box(this.boxes, r.x, top + 0.4, r.z, r.rot, 0.7, 0.7, 0.7, SIG.beacon);
        return this.addCollision({ ...r, hw: 0.8, hd: 0.8 }, base, top);
      }
      case 'tank': {
        // A fuel tank: a squat steel cylinder. It explodes when hit (see `explosives`).
        const radius = (Math.min(w, d) / 2) * 0.95;
        const top = hi + 7;
        this.e.set(0, 0, 0);
        this.q.setFromEuler(this.e);
        this.cylinders.add(
          this.m.compose(
            this.p.set(r.x, (base + top) / 2, r.z),
            this.q,
            this.s.set(radius, top - base, radius),
          ),
          SIG.tank,
        );
        if (b.explosive) this.explosives.push({ id: b.id, x: r.x, y: hi + 3.5, z: r.z, radius });
        return this.addCollision(r, base, top);
      }
      case 'canopy': {
        const top = hi + 4.6;
        for (const [sx, sz] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const [x, z] = this.local(r, sx * (w / 2 - 0.6), sz * (d / 2 - 0.6));
          this.box(this.boxes, x, (base + top) / 2, z, r.rot, 0.4, top - base, 0.4, SIG.wall);
        }
        this.box(this.boxes, r.x, top + 0.25, r.z, r.rot, w, 0.5, d, SIG.roof);
        // Only the roof is solid: people can stand underneath it.
        return this.addCollision(r, top, top + 0.5);
      }
    }
  }

  /** Windows on the long walls (all four for the clinic), one row per storey; some rooms dark. */
  private addWindows(
    r: Rect,
    ground: number,
    floors: number,
    rng: Rng,
    litChance: number,
    allSides = false,
  ) {
    const faces: [number, number, number, number][] = [
      // [normal x, normal z, along-wall half length, rotation offset]
      [0, -1, r.hw, 0],
      [0, 1, r.hw, 0],
    ];
    if (allSides) faces.push([-1, 0, r.hd, Math.PI / 2], [1, 0, r.hd, Math.PI / 2]);
    for (const [nx, nz, half, turn] of faces) {
      const n = Math.max(1, Math.floor((half * 2) / 3.2));
      for (let f = 0; f < floors; f++) {
        const y = ground + 1.6 + f * STOREY;
        for (let i = 0; i < n; i++) {
          const along = ((i + 0.5) / n - 0.5) * half * 2 * 0.8;
          const lx = nx === 0 ? along : nx * (r.hw + 0.05);
          const lz = nz === 0 ? along : nz * (r.hd + 0.05);
          const [x, z] = this.local(r, lx, lz);
          const sig = rng() < litChance ? litWindow(rng) : SIG.darkWindow;
          this.box(this.boxes, x, y, z, r.rot + turn, 1.2, 1.1, 0.3, sig);
        }
      }
    }
  }

  private addWall(w: WallDef): void {
    const sig = w.kind === 'hedge' ? SIG.hedge : w.kind === 'rock' ? SIG.rock : SIG.wall;
    const target = w.kind === 'wall' ? this.boxes : this.rough;
    for (const r of wallRects(w)) {
      const [lo, hi] = this.groundSpan(r);
      const base = lo - SINK;
      const top = hi + w.height;
      this.box(target, r.x, (base + top) / 2, r.z, r.rot, r.hw * 2, top - base, r.hd * 2, sig);
      this.addCollision(r, base, top, { tag: 'wall' });
    }
  }

  private addProp(p: PropDef): CollisionBox {
    const r = propRect(p);
    const g = this.ground(r.x, r.z);
    const [w, d] = [r.hw * 2, r.hd * 2];
    switch (p.kind) {
      case 'car':
        this.box(this.boxes, r.x, g + 0.75, r.z, r.rot, w, 0.9, d, SIG.car);
        this.box(this.boxes, r.x, g + 1.45, r.z, r.rot, w - 0.2, 0.55, d * 0.5, SIG.car);
        return this.addCollision(r, g - 0.2, g + 1.7);
      case 'hay':
        this.box(this.rough, r.x, g + 0.8, r.z, r.rot, w, 1.6, d, SIG.hay);
        return this.addCollision(r, g - 0.2, g + 1.6);
      case 'crates':
        this.box(this.boxes, r.x, g + 0.6, r.z, r.rot, w, 1.2, d, SIG.crates);
        this.box(this.boxes, r.x, g + 1.6, r.z, r.rot + 0.4, w * 0.6, 0.8, d * 0.6, SIG.crates);
        return this.addCollision(r, g - 0.2, g + 2.0);
      case 'wreck':
        // A burnt-out car, sagging on one side, roof caved in.
        this.box(this.boxes, r.x, g + 0.55, r.z, r.rot, w, 0.8, d, SIG.wreck, 0.06);
        this.box(this.boxes, r.x, g + 1.1, r.z, r.rot, w - 0.3, 0.35, d * 0.45, SIG.wreck);
        return this.addCollision(r, g - 0.2, g + 1.3);
      case 'grave':
        this.box(this.boxes, r.x, g + 0.5, r.z, r.rot, w, 1.0, d, SIG.stone);
        return this.addCollision(r, g - 0.2, g + 1.0);
    }
  }

  /** Poles every `spacing` m (none on roads) and three wires between neighboring pole tops. */
  private addPowerLine(points: readonly (readonly [number, number])[], spacing: number): void {
    const tops: Vector3[] = [];
    for (const [x, z] of samplePolyline(points, spacing)) {
      if (this.map.roads.some((r) => distanceToPolyline(r.points, x, z) < r.width / 2 + 2))
        continue;
      const g = this.ground(x, z);
      this.box(this.boxes, x, g + 5, z, 0, 0.35, 10.5, 0.35, SIG.pole);
      this.box(this.boxes, x, g + 9.8, z, 0, 2.8, 0.2, 0.2, SIG.pole); // cross-arm
      tops.push(new Vector3(x, g + 9.9, z));
    }
    for (let i = 1; i < tops.length; i++) {
      const a = tops[i - 1];
      const b = tops[i];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const rot = Math.atan2(b.x - a.x, b.z - a.z);
      const pitch = -Math.atan2(b.y - a.y, len);
      for (const off of [-1.2, 0, 1.2]) {
        const ox = Math.cos(rot) * off;
        const oz = -Math.sin(rot) * off;
        this.box(
          this.boxes,
          (a.x + b.x) / 2 + ox,
          (a.y + b.y) / 2 - 0.4, // a little sag
          (a.z + b.z) / 2 + oz,
          rot,
          0.07,
          0.07,
          Math.hypot(len, b.y - a.y),
          SIG.wire,
          pitch,
        );
      }
    }
  }

  /** Trees along each tree line; none on roads, in the stream or inside buildings. */
  private addTrees(rng: Rng): void {
    const blocked = this.map.buildings.map((b) => buildingRect(b, 2));
    for (const line of this.map.treeLines) {
      for (const [px, pz] of samplePolyline(line.points, 10 / line.density)) {
        const x = px + range(rng, -2.5, 2.5);
        const z = pz + range(rng, -2.5, 2.5);
        if (this.map.roads.some((r) => distanceToPolyline(r.points, x, z) < r.width / 2 + 3))
          continue;
        if (distanceToPolyline(this.map.stream.points, x, z) < this.map.stream.width / 2 + 2)
          continue;
        if (blocked.some((r) => inRect(r, x, z))) continue;
        const scale = range(rng, 0.7, 1.4);
        this.e.set(0, 0, 0);
        this.q.setFromEuler(this.e);
        this.trees.add(
          this.m.compose(
            this.p.set(x, this.ground(x, z) - 0.5, z),
            this.q,
            this.s.set(scale, scale * range(rng, 0.8, 1.2), scale),
          ),
          signature(HEAT.tree + range(rng, -0.02, 0.02), ALBEDO.tree * range(rng, 0.85, 1.1)),
        );
      }
    }
  }

  /** Keeps candidate cover points that are on open ground (not inside anything, not in the stream). */
  private keepOpenCover(candidates: CoverSet): void {
    const half = CONFIG.map.size / 2;
    const out = { x: 0, z: 0 };
    for (const p of candidates.points) {
      if (Math.abs(p.x) > half || Math.abs(p.z) > half) continue;
      if (this.collision.pushOut(p.x, p.z, 0.3, out)) continue;
      if (distanceToPolyline(this.map.stream.points, p.x, p.z) < this.map.stream.width / 2 + 1)
        continue;
      this.cover.add(p.x, p.z);
    }
  }
}

/** Collision boxes the builder tags so it can find walls again when placing cover. */
interface TaggedBox extends CollisionBox {
  tag?: 'wall';
}
