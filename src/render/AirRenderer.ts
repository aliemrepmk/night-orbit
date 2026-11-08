import {
  BoxGeometry,
  type BufferGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import type { AirDefense } from '../combat/AirDefense';
import type { AirSupport } from '../gunship/AirSupport';
import { ThermalMaterial } from './ThermalMaterial';
import { ATTACK_JET, boxModel, FAST_JET, sandbagRing } from './models';

/** One instanced part with per-instance signatures, rebuilt every frame. */
class Part {
  readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private readonly attr: InstancedBufferAttribute;
  private n = 0;

  constructor(geo: BufferGeometry, capacity: number, material: ThermalMaterial) {
    this.sig = new Float32Array(capacity * 3);
    this.attr = new InstancedBufferAttribute(this.sig, 3);
    geo.setAttribute('instanceSignature', this.attr);
    this.mesh = new InstancedMesh(geo, material, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  begin(): void {
    this.n = 0;
  }

  add(m: Matrix4, heat: number, albedo: number, glow: number): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    this.sig.set([heat, albedo, glow], this.n * 3);
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.needsUpdate = true;
  }
}

/** Jets are drawn this much larger than life so they read at 105 mm from 1 km (like soldiers). */
const JET_SCALE = 1.4;

/**
 * Draws the strike jets (M8+ Phase E) and the AA gun emplacements: generic low-poly models with
 * hot engines and barrels that warm up when they fire. 7 draw calls in all.
 */
export class AirRenderer {
  readonly root = new Group();
  private readonly attackFrame: Part;
  private readonly attackEngines: Part;
  private readonly fastFrame: Part;
  private readonly fastEngines: Part;
  private readonly bags: Part;
  private readonly mounts: Part;
  private readonly barrels: Part;
  private readonly m = new Matrix4();
  private readonly local = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly one = new Vector3(1, 1, 1);

  constructor() {
    const mat = new ThermalMaterial({ source: 'instance', noise: 0.4 });
    this.attackFrame = new Part(boxModel(ATTACK_JET.frame), 4, mat);
    this.attackEngines = new Part(boxModel(ATTACK_JET.engines), 4, mat);
    this.fastFrame = new Part(boxModel(FAST_JET.frame), 4, mat);
    this.fastEngines = new Part(boxModel(FAST_JET.engines), 4, mat);
    this.bags = new Part(boxModel(sandbagRing(2.8, 9)), 8, mat);
    this.mounts = new Part(new BoxGeometry(1.3, 1, 1.3).translate(0, 0.6, 0), 8, mat);
    // A barrel pivots at its breech: the box runs from the origin along +z.
    this.barrels = new Part(new BoxGeometry(0.16, 0.16, 3.2).translate(0, 0, 1.6), 16, mat);
    for (const part of this.parts()) this.root.add(part.mesh);
  }

  private parts(): Part[] {
    return [
      this.attackFrame,
      this.attackEngines,
      this.fastFrame,
      this.fastEngines,
      this.bags,
      this.mounts,
      this.barrels,
    ];
  }

  /** Per rendered frame. `plane`: where the barrels of firing guns point. */
  sync(
    air: AirSupport,
    groundAt: (x: number, z: number) => number,
    defense: AirDefense,
    plane: Vector3,
  ): void {
    for (const part of this.parts()) part.begin();

    for (const j of air.jets) {
      if (!air.jetPosition(j, groundAt(j.x, j.z), this.p)) continue;
      this.e.set(air.jetPitch(j), j.heading, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.p, this.q, this.s.setScalar(JET_SCALE));
      const fast = j.strike.id === 'bomb';
      (fast ? this.fastFrame : this.attackFrame).add(this.m, 0.42, 0.35, 0);
      (fast ? this.fastEngines : this.attackEngines).add(this.m, 1, 0.2, 0.6);
    }

    for (const g of defense.guns) {
      const y = g.position.y - 1.2; // emplacement on the ground
      this.p.set(g.position.x, y, g.position.z);
      this.q.identity();
      this.m.compose(this.p, this.q, this.one);
      this.bags.add(this.m, 0.24, 0.4, 0);
      const warm = Number.isFinite(g.sinceShot) ? Math.exp(-g.sinceShot / 6) : 0;
      this.mounts.add(this.m, g.alive ? 0.32 + 0.3 * warm : 0.2, 0.3, 0);
      // Barrels: toward the gunship while firing, raised at rest, drooping once destroyed.
      const yaw = g.firing ? Math.atan2(plane.x - g.position.x, plane.z - g.position.z) : 0.6;
      const elev = !g.alive
        ? 0.25
        : g.firing
          ? Math.atan2(
              plane.y - g.position.y,
              Math.hypot(plane.x - g.position.x, plane.z - g.position.z),
            )
          : 0.8;
      for (const side of [-0.22, 0.22]) {
        this.e.set(-elev, yaw, 0);
        this.q.setFromEuler(this.e);
        this.local.compose(this.p.set(side, 0, 0), this.q, this.one);
        this.m.makeTranslation(g.position.x, y + 1.3, g.position.z).multiply(this.local);
        this.barrels.add(this.m, g.alive ? 0.3 + 0.65 * warm : 0.18, 0.3, g.alive ? 0.3 * warm : 0);
      }
    }

    for (const part of this.parts()) part.end();
  }
}
