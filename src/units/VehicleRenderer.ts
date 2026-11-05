import {
  BoxGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import type { Effects } from '../fx/Effects';
import { FIRE, HEAT } from '../fx/Heat';
import { ALBEDO } from '../fx/Light';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Vehicle } from './Vehicle';
import type { PartKind } from './vehicleDefs';

/** Most box parts any vehicle type has. */
const MAX_PARTS = 6;

/** Heat of each part kind on a running vehicle (PLAN.md §7.10: engine and exhaust hot, wheels warm). */
const PART_HEAT: Readonly<Record<PartKind, number>> = {
  body: HEAT.vehicleBody,
  engine: HEAT.engine,
  exhaust: HEAT.exhaust,
  wheels: HEAT.wheels,
  gun: HEAT.vehicleBody,
};

/**
 * Draws every vehicle (box-composite, PLAN.md §7.10) with ONE InstancedMesh of unit boxes, each
 * part with its own signature, and emits their smoke and fire. Wrecks lose their cab or turret,
 * sit lower and lean a little.
 */
export class VehicleRenderer {
  readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private readonly sigAttr: InstancedBufferAttribute;
  private readonly capacity: number;

  private readonly base = new Matrix4();
  private readonly local = new Matrix4();
  private readonly world = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly noTurn = new Quaternion();

  constructor(maxVehicles = CONFIG.vehicles.maxVehicles) {
    this.capacity = maxVehicles * MAX_PARTS;
    const geo = new BoxGeometry(1, 1, 1);
    this.sig = new Float32Array(this.capacity * 3);
    this.sigAttr = new InstancedBufferAttribute(this.sig, 3);
    geo.setAttribute('instanceSignature', this.sigAttr);
    this.mesh = new InstancedMesh(
      geo,
      new ThermalMaterial({ source: 'instance', noise: 0.3 }),
      this.capacity,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // vehicles move; one draw call anyway
  }

  /** Per rendered frame: one instance per visible part. */
  sync(vehicles: readonly Vehicle[]): void {
    let n = 0;
    for (const v of vehicles) {
      if (!v.inUse) continue;
      const wreck = !v.alive;
      // Wrecks sink onto their rims and list to one side.
      this.e.set(wreck ? 0.04 : 0, v.heading, wreck ? 0.07 * (v.seed % 2 ? 1 : -1) : 0);
      this.q.setFromEuler(this.e);
      this.p.set(v.position.x, v.position.y - v.def.lift - (wreck ? 0.3 : 0), v.position.z);
      this.base.compose(this.p, this.q, this.one);
      const fire = v.burning ? (v.heat - FIRE.min) / (FIRE.max - FIRE.min) : 0;
      for (const part of v.def.parts) {
        if (n >= this.capacity) break;
        if (wreck && !part.wreck) continue;
        this.p.set(part.at[0], part.at[1], part.at[2]);
        this.s.set(part.size[0], part.size[1], part.size[2]);
        this.local.compose(this.p, this.noTurn, this.s);
        this.mesh.setMatrixAt(n, this.world.multiplyMatrices(this.base, this.local));
        const i = n * 3;
        if (wreck) {
          this.sig[i] = v.heat;
          this.sig[i + 1] = 0.08; // charred
          this.sig[i + 2] = v.burning ? 0.6 * fire : 0;
        } else {
          this.sig[i] = PART_HEAT[part.kind];
          this.sig[i + 1] = ALBEDO.vehicleBody;
          this.sig[i + 2] = 0;
        }
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.sigAttr.needsUpdate = true;
  }

  /** Per fixed step: damaged vehicles smoke, wrecks burn, then smolder. */
  emitEffects(vehicles: readonly Vehicle[], effects: Effects, dt: number): void {
    for (const v of vehicles) {
      if (!v.inUse) continue;
      if (v.burning) effects.fire(v.position, dt);
      else if (v.smoking || !v.alive) effects.smokePuff(v.position, dt, v.alive ? 1 : 0.3);
    }
  }
}
