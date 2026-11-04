import {
  CapsuleGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import { ALBEDO, GLOW } from '../fx/Light';
import { PointLayer } from '../fx/PointLayer';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Infantry } from './Infantry';
import { infantryPose, type Pose } from './infantryPose';
import { strobeOn } from './Squad';
import type { UnitManager } from './UnitManager';

/**
 * Draws every soldier of both sides with ONE InstancedMesh (PLAN.md §11), each with its own
 * signature so bodies cool independently, plus Ridgeback's blinking IR strobes as one point
 * layer. Both sides look the same in thermal: the strobes are what tells friend from foe.
 */
export class InfantryRenderer {
  readonly root = new Group();
  private readonly mesh: InstancedMesh;
  private readonly sig: Float32Array;
  private readonly sigAttr: InstancedBufferAttribute;
  private readonly strobes: PointLayer;

  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ'); // yaw first, then pitch along the facing
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly pose: Pose = { pitch: 0, yaw: 0, bob: 0 };

  constructor(private readonly capacity = CONFIG.infantry.maxUnits) {
    const geo = new CapsuleGeometry(0.45, 1.2, 3, 6);
    this.sig = new Float32Array(capacity * 3);
    this.sigAttr = new InstancedBufferAttribute(this.sig, 3);
    geo.setAttribute('instanceSignature', this.sigAttr);
    this.mesh = new InstancedMesh(
      geo,
      new ThermalMaterial({ source: 'instance', noise: 0.3 }),
      capacity,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false; // soldiers move every frame; one cheap draw call anyway
    this.strobes = new PointLayer(16, true);
    this.strobes.points.renderOrder = 1;
    this.root.add(this.mesh, this.strobes.points);
  }

  /** Per rendered frame: instance matrices + signatures, and the lit strobes. */
  sync(units: UnitManager, heightPx: number, fovDeg: number): void {
    let n = 0;
    for (const f of units.friendlies) n = this.write(f, n);
    for (const e of units.enemies) n = this.write(e, n);
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.sigAttr.needsUpdate = true;

    const rb = CONFIG.ridgeback;
    this.strobes.setViewport(heightPx, fovDeg);
    this.strobes.begin();
    for (let i = 0; i < units.friendlies.length; i++) {
      const f = units.friendlies[i];
      // Each member's strobe is slightly out of step with the others, like real ones.
      if (!f.alive || !strobeOn(units.time, rb.strobeHz, rb.strobeDuty, i * 0.29)) continue;
      const top = f.position.y + 1.2 * CONFIG.infantry.scale;
      this.strobes.push(
        f.position.x,
        top,
        f.position.z,
        rb.strobeSize,
        rb.strobeThermalHeat,
        0,
        GLOW.irStrobe,
        1,
      );
    }
    this.strobes.end();
  }

  private write(u: Infantry, n: number): number {
    if (n >= this.capacity || (!u.alive && u.sinceDeath === Infinity)) return n; // unused slot
    const pose = infantryPose(u, CONFIG.infantry, this.pose);
    this.e.set(pose.pitch, pose.yaw, 0);
    this.q.setFromEuler(this.e);
    this.p.set(u.position.x, u.position.y + pose.bob, u.position.z);
    this.s.setScalar(CONFIG.infantry.scale);
    this.mesh.setMatrixAt(n, this.m.compose(this.p, this.q, this.s));
    this.sig[n * 3] = u.heat;
    this.sig[n * 3 + 1] = ALBEDO.soldier;
    this.sig[n * 3 + 2] = 0;
    return n + 1;
  }
}
