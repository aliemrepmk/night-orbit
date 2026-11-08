import {
  BoxGeometry,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { FIRE, HEAT } from '../fx/Heat';
import { ALBEDO } from '../fx/Light';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Helicopter } from './Helicopter';

interface Part {
  readonly at: readonly [number, number, number];
  readonly size: readonly [number, number, number];
  readonly heat: number;
  /** Spins with the main rotor (1) or the tail rotor (2). */
  readonly spin?: 1 | 2;
}

/** Box-composite helicopter (PLAN.md §7.10 style), nose toward +z. Engines and exhaust run very hot. */
const PARTS: readonly Part[] = [
  { at: [0, 1.6, 0.5], size: [2.6, 2.4, 9], heat: HEAT.vehicleBody },
  { at: [0, 2.2, -7.5], size: [0.8, 0.8, 8], heat: HEAT.vehicleBody },
  { at: [0, 3.1, 0], size: [1.8, 0.9, 3.2], heat: HEAT.engine },
  { at: [0, 3.0, -2.2], size: [1.2, 0.7, 1.2], heat: HEAT.exhaust * 1.2 },
  { at: [0, 3.8, 0], size: [15, 0.08, 0.5], heat: HEAT.wheels, spin: 1 },
  { at: [0, 3.8, 0], size: [0.5, 0.08, 15], heat: HEAT.wheels, spin: 1 },
  { at: [0.5, 2.6, -11.4], size: [0.06, 2.6, 0.3], heat: HEAT.wheels, spin: 2 },
];

/** Draws Kestrel 6 with one InstancedMesh (one draw call), hidden while it isn't flying. */
export class HelicopterRenderer {
  readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private readonly sigAttr: InstancedBufferAttribute;
  private readonly base = new Matrix4();
  private readonly local = new Matrix4();
  private readonly world = new Matrix4();
  private readonly q = new Quaternion();
  private readonly spinQ = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ');
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly side = new Vector3(1, 0, 0);

  constructor() {
    const geo = new BoxGeometry(1, 1, 1);
    this.sig = new Float32Array(PARTS.length * 3);
    this.sigAttr = new InstancedBufferAttribute(this.sig, 3);
    geo.setAttribute('instanceSignature', this.sigAttr);
    this.mesh = new InstancedMesh(
      geo,
      new ThermalMaterial({ source: 'instance', noise: 0.3 }),
      PARTS.length,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  sync(h: Helicopter): void {
    if (!h.visible) {
      this.mesh.count = 0;
      return;
    }
    // A slight nose-down pitch while flying, level on the ground; a wreck lies on its side.
    const flying = h.state === 'inbound' || h.state === 'departing';
    const wreck = h.state === 'destroyed';
    this.e.set(flying ? 0.12 : 0, h.heading, wreck ? 0.9 : 0);
    this.q.setFromEuler(this.e);
    this.base.compose(h.position, this.q, this.one);
    PARTS.forEach((part, i) => {
      this.p.set(part.at[0], part.at[1], part.at[2]);
      this.s.set(part.size[0], part.size[1], part.size[2]);
      if (wreck)
        this.spinQ.identity(); // rotors stopped
      else if (part.spin === 1) this.spinQ.setFromAxisAngle(this.up, h.rotor);
      else if (part.spin === 2) this.spinQ.setFromAxisAngle(this.side, h.rotor * 1.7);
      else this.spinQ.identity();
      this.local.compose(this.p, this.spinQ, this.s);
      this.mesh.setMatrixAt(i, this.world.multiplyMatrices(this.base, this.local));
      // A burning wreck glows everywhere; otherwise each part has its own heat.
      this.sig[i * 3] = wreck ? FIRE.max : part.heat;
      this.sig[i * 3 + 1] = wreck ? 0.08 : ALBEDO.vehicleBody;
      this.sig[i * 3 + 2] = wreck ? 0.5 : 0;
    });
    this.mesh.count = PARTS.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.sigAttr.needsUpdate = true;
  }
}
