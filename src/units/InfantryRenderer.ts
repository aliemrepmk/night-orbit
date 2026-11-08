import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import { ALBEDO, GLOW } from '../fx/Light';
import { PointLayer } from '../fx/PointLayer';
import { ThermalMaterial } from '../render/ThermalMaterial';
import type { Infantry } from './Infantry';
import { infantryPose, type Pose } from './infantryPose';
import { BODY, partHeat, rigSoldier, type PartId, type PlacedPart } from './soldierRig';
import { strobeOn } from './Squad';
import type { UnitManager } from './UnitManager';

/** Each part's geometry at life size (m), centered on the part (limbs along y, the rifle along z). */
function partGeometry(id: PartId): BufferGeometry {
  const B = BODY;
  switch (id) {
    case 'torso':
      return new BoxGeometry(B.torso.w, B.torso.h, B.torso.d);
    case 'head':
      return new SphereGeometry(B.head.r, 7, 5);
    case 'thigh':
      return new BoxGeometry(0.17, B.thigh, 0.18);
    case 'shin':
      return new BoxGeometry(0.14, B.shin, 0.15);
    case 'upperArm':
      return new BoxGeometry(0.12, B.upperArm, 0.12);
    case 'forearm':
      return new BoxGeometry(0.1, B.forearm, 0.1);
    case 'rifle':
      return new BoxGeometry(0.07, 0.11, B.rifleLength);
    case 'helmet':
      return new SphereGeometry(0.15, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    case 'nvg':
      return new BoxGeometry(0.09, 0.07, 0.09);
    case 'carrier':
      return new BoxGeometry(B.torso.w + 0.06, 0.44, B.torso.d + 0.08);
    case 'cap':
      return new CylinderGeometry(0.13, 0.13, 0.07, 8);
  }
}

/** Instances each part needs: limbs come in pairs; kit only for whoever wears it. */
function partCapacity(id: PartId, soldiers: number): number {
  switch (id) {
    case 'thigh':
    case 'shin':
    case 'upperArm':
    case 'forearm':
      return soldiers * 2;
    case 'helmet':
    case 'nvg':
    case 'carrier':
      return 16; // Ridgeback (4), with room to spare
    default:
      return soldiers;
  }
}

const PARTS: readonly PartId[] = [
  'torso',
  'head',
  'thigh',
  'shin',
  'upperArm',
  'forearm',
  'rifle',
  'helmet',
  'nvg',
  'carrier',
  'cap',
];

interface PartMesh {
  readonly mesh: InstancedMesh;
  readonly sig: Float32Array;
  readonly sigAttr: InstancedBufferAttribute;
  readonly capacity: number;
  count: number;
}

/**
 * Draws every soldier of both sides as a jointed low-poly figure (M8+ Phase C): one
 * InstancedMesh per body part (11 draw calls for up to 128 soldiers, PLAN.md §11), posed by
 * `soldierRig`. Each part has its own thermal signature (skin hottest, clothing and kit cooler,
 * a barrel that warms when fired). Ridgeback wears helmets with NVGs and plate carriers; the
 * militia soft caps. Plus Ridgeback's blinking IR strobes as one point layer.
 */
export class InfantryRenderer {
  readonly root = new Group();
  private readonly parts = new Map<PartId, PartMesh>();
  private readonly strobes: PointLayer;
  private readonly placed: PlacedPart[] = [];

  private readonly rootM = new Matrix4();
  private readonly partM = new Matrix4();
  private readonly q = new Quaternion();
  private readonly e = new Euler(0, 0, 0, 'YXZ'); // yaw first, then pitch along the facing
  private readonly pe = new Euler(0, 0, 0, 'XYZ');
  private readonly p = new Vector3();
  private readonly s = new Vector3();
  private readonly one = new Vector3(1, 1, 1);
  private readonly pose: Pose = { pitch: 0, yaw: 0, bob: 0 };

  constructor(private readonly capacity = CONFIG.infantry.maxUnits) {
    const material = new ThermalMaterial({ source: 'instance', noise: 0.3 });
    for (const id of PARTS) {
      const cap = partCapacity(id, capacity);
      const geo = partGeometry(id);
      const sig = new Float32Array(cap * 3);
      const sigAttr = new InstancedBufferAttribute(sig, 3);
      geo.setAttribute('instanceSignature', sigAttr);
      const mesh = new InstancedMesh(geo, material, cap);
      mesh.count = 0;
      mesh.frustumCulled = false; // soldiers move every frame; one cheap draw call per part
      this.parts.set(id, { mesh, sig, sigAttr, capacity: cap, count: 0 });
      this.root.add(mesh);
    }
    this.strobes = new PointLayer(16, true);
    this.strobes.points.renderOrder = 1;
    this.root.add(this.strobes.points);
  }

  /** Per rendered frame: every part's instance matrix + signature, and the lit strobes. */
  sync(units: UnitManager, heightPx: number, fovDeg: number): void {
    for (const p of this.parts.values()) p.count = 0;
    let n = 0;
    if (!units.boarded) {
      for (const f of units.friendlies) if (this.write(f, true, n)) n++;
    }
    for (const e of units.enemies) if (this.write(e, false, n)) n++;
    for (const p of this.parts.values()) {
      p.mesh.count = p.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      p.sigAttr.needsUpdate = true;
    }

    const rb = CONFIG.ridgeback;
    const scale = CONFIG.infantry.scale;
    this.strobes.setViewport(heightPx, fovDeg);
    this.strobes.begin();
    for (let i = 0; i < units.friendlies.length; i++) {
      const f = units.friendlies[i];
      // Each member's strobe is slightly out of step with the others, like real ones.
      if (units.boarded || !f.alive || !strobeOn(units.time, rb.strobeHz, rb.strobeDuty, i * 0.29))
        continue;
      // On top of the helmet.
      const top = f.position.y + (BODY.head.y + 0.2) * scale;
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

  /** Drawn soldiers so far this frame (tests / debug). */
  get drawnParts(): number {
    let n = 0;
    for (const p of this.parts.values()) n += p.count;
    return n;
  }

  private write(u: Infantry, friendly: boolean, n: number): boolean {
    if (n >= this.capacity || (!u.alive && u.sinceDeath === Infinity)) return false; // unused slot
    const pose = infantryPose(u, CONFIG.infantry, this.pose);
    this.e.set(pose.pitch, pose.yaw, 0);
    this.q.setFromEuler(this.e);
    this.p.set(u.position.x, u.position.y + pose.bob, u.position.z);
    this.s.setScalar(CONFIG.infantry.scale);
    this.rootM.compose(this.p, this.q, this.s);

    const count = rigSoldier(
      {
        state: u.state,
        walkPhase: u.walkPhase,
        crouched: u.crouched,
        sinceShot: u.sinceShot,
        friendly,
        id: u.id,
        lean: u.state === 'flung' || u.state === 'dead' ? 0 : pose.pitch,
      },
      this.placed,
    );
    const body = u.heat;
    for (let k = 0; k < count; k++) {
      const pp = this.placed[k];
      const pm = this.parts.get(pp.part)!;
      if (pm.count >= pm.capacity) continue;
      this.pe.set(pp.pitch, 0, pp.roll);
      this.q.setFromEuler(this.pe);
      this.p.set(pp.x, pp.y, pp.z);
      this.partM.compose(this.p, this.q, this.one).premultiply(this.rootM);
      const i = pm.count++;
      pm.mesh.setMatrixAt(i, this.partM);
      pm.sig[i * 3] = partHeat(pp.part, body, u.sinceShot);
      pm.sig[i * 3 + 1] = ALBEDO.soldier;
      pm.sig[i * 3 + 2] = 0;
    }
    return true;
  }
}
