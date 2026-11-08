import {
  CircleGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  RingGeometry,
  Vector3,
} from 'three';
import { CONFIG } from '../config';
import { range, type Rng } from '../core/rng';
import type { Ordnance } from '../gunship/weaponDefs';
import { ThermalMaterial } from '../render/ThermalMaterial';
import { CRATER_COOLING, FIRE, HEAT, coolingHeat } from './Heat';
import { GLOW } from './Light';
import { Particles } from './Particles';
import { PointLayer } from './PointLayer';

const UP = new Vector3(0, 1, 0);

interface Crater {
  age: number;
  active: boolean;
}

interface Shockwave {
  mesh: Mesh;
  mat: ThermalMaterial;
  age: number;
  maxRadius: number;
}

/**
 * Pooled, heat-based visual effects (PLAN.md §7.13): flash, debris, smoke, shockwave rings,
 * craters, fire and tracers. Bright = hot in thermal; flashes and fire also glow in NV.
 * Everything is driven by the weapon's `fx` data, so balancing never touches this file.
 */
export class Effects {
  readonly root = new Group();
  readonly hot: Particles;
  readonly smoke: Particles;
  private readonly hotLayer: PointLayer;
  private readonly smokeLayer: PointLayer;
  private readonly tracerLayer = new PointLayer(2048, true, CONFIG.gunnery.tracerMaxPx);

  private readonly craterMesh: InstancedMesh;
  private readonly craterSig: Float32Array;
  private readonly craters: Crater[] = [];
  private nextCrater = 0;

  private readonly shockwaves: Shockwave[] = [];

  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly rng: Rng,
  ) {
    const fx = CONFIG.fx;
    this.hot = new Particles(fx.hotParticles, groundAt);
    this.smoke = new Particles(fx.smokeParticles);
    this.hotLayer = new PointLayer(fx.hotParticles, true);
    this.smokeLayer = new PointLayer(fx.smokeParticles, false);

    // Craters: flat scorched discs on the terrain, each cooling on its own.
    const disc = new CircleGeometry(1, 18).rotateX(-Math.PI / 2);
    this.craterSig = new Float32Array(fx.maxCraters * 3);
    disc.setAttribute('instanceSignature', new InstancedBufferAttribute(this.craterSig, 3));
    const craterMat = new ThermalMaterial({ source: 'instance', noise: 1.5 });
    craterMat.polygonOffset = true; // drawn on top of the ground without z-fighting
    craterMat.polygonOffsetFactor = -2;
    craterMat.polygonOffsetUnits = -2;
    this.craterMesh = new InstancedMesh(disc, craterMat, fx.maxCraters);
    this.craterMesh.count = 0;
    this.craterMesh.frustumCulled = false;
    for (let i = 0; i < fx.maxCraters; i++) this.craters.push({ age: 0, active: false });

    // Shockwave rings (105 mm): a few pooled meshes.
    const ring = new RingGeometry(0.82, 1, 48).rotateX(-Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const mat = new ThermalMaterial({ noise: 0.3 });
      const mesh = new Mesh(ring, mat);
      mesh.visible = false;
      this.shockwaves.push({ mesh, mat, age: Infinity, maxRadius: 1 });
      this.root.add(mesh);
    }

    // Smoke draws after the hot layer so it can veil flashes; tracers on top.
    this.hotLayer.points.renderOrder = 1;
    this.smokeLayer.points.renderOrder = 2;
    this.tracerLayer.points.renderOrder = 3;
    this.root.add(this.craterMesh, this.hotLayer.points, this.smokeLayer.points);
    this.root.add(this.tracerLayer.points);
  }

  /** Spawns one impact. `onGround` adds a crater (roof hits don't leave one). */
  explosion(p: Vector3, w: Ordnance, onGround: boolean): void {
    const fx = w.fx;
    const rng = this.rng;
    const wind = CONFIG.fx.wind;
    const lift = fx.flashSize * 0.25;

    // Flash: a big short-lived hot sprite plus a brighter core (scales up, then fades).
    this.hot.spawn({
      ...still(p.x, p.y + lift, p.z),
      life: 0.35,
      size0: fx.flashSize * 0.4,
      size1: fx.flashSize,
      heat0: HEAT.flash,
      heat1: 0.55,
      glow0: GLOW.flash,
      glow1: 0,
      albedo: 0,
      gravity: 0,
      drag: 0,
      alpha: 1,
    });
    this.hot.spawn({
      ...still(p.x, p.y + lift * 0.5, p.z),
      life: 0.12,
      size0: fx.flashSize * 0.5,
      size1: fx.flashSize * 0.7,
      heat0: 1,
      heat1: 1,
      glow0: 1,
      glow1: 0.6,
      albedo: 0,
      gravity: 0,
      drag: 0,
      alpha: 1,
    });

    // Debris: hot fragments thrown out in a hemisphere, cooling as they fly and land.
    const debrisSize = Math.max(0.3, fx.flashSize * 0.04);
    for (let i = 0; i < fx.debris; i++) {
      const a = range(rng, 0, Math.PI * 2);
      const up = range(rng, 0.25, 1);
      const sp = fx.debrisSpeed * range(rng, 0.35, 1);
      const flat = Math.sqrt(1 - up * up);
      this.hot.spawn({
        x: p.x,
        y: p.y + 0.3,
        z: p.z,
        vx: Math.cos(a) * flat * sp,
        vy: up * sp,
        vz: Math.sin(a) * flat * sp,
        life: range(rng, 1, 2.6),
        size0: debrisSize * range(rng, 0.8, 1.6),
        size1: debrisSize * 0.6,
        heat0: 1,
        heat1: 0.3,
        glow0: 0.9,
        glow1: 0,
        albedo: 0.1,
        gravity: 9.8,
        drag: 0.4,
        alpha: 1,
      });
    }

    // Smoke: warm, rising, expanding and drifting with the wind; cools and fades over 8–15 s.
    for (let i = 0; i < fx.smoke; i++) {
      const r = fx.smokeSize * 0.25;
      this.smoke.spawn({
        x: p.x + range(rng, -r, r),
        y: p.y + range(rng, 0, r),
        z: p.z + range(rng, -r, r),
        vx: wind[0] + range(rng, -0.5, 0.5),
        vy: range(rng, 1.2, 3),
        vz: wind[2] + range(rng, -0.5, 0.5),
        life: range(rng, 8, 15),
        size0: fx.smokeSize * 0.35,
        size1: fx.smokeSize * range(rng, 0.9, 1.4),
        heat0: 0.65, // warm plume that stays readable for seconds, then cools into the air
        heat1: 0.18,
        glow0: 0,
        glow1: 0,
        albedo: 0.28,
        gravity: -0.15,
        drag: 0.35,
        alpha: 0.65,
      });
    }

    if (fx.shockwave) this.shockwave(p, w.blastRadius * CONFIG.fx.shockwaveScale);
    if (onGround && fx.craterRadius > 0) this.crater(p, fx.craterRadius);
  }

  /** A rifle / machine-gun burst on the ground: a tiny, very short hot flash. */
  muzzleFlash(p: Vector3): void {
    this.hot.spawn({
      ...still(p.x, p.y + 0.4, p.z),
      life: 0.09,
      size0: 1.4,
      size1: 0.8,
      heat0: 1,
      heat1: 0.8,
      glow0: 0.9,
      glow1: 0.3,
      albedo: 0,
      gravity: 0,
      drag: 0,
      alpha: 1,
    });
  }

  /** A burning wreck: call every tick while it burns (spawns flickering hot fire + dark smoke). */
  fire(p: Vector3, dt: number, intensity = 1): void {
    const rng = this.rng;
    if (rng() < 14 * dt * intensity) {
      this.hot.spawn({
        x: p.x + range(rng, -1, 1),
        y: p.y + range(rng, 0.5, 1.5),
        z: p.z + range(rng, -1, 1),
        vx: 0,
        vy: range(rng, 1.5, 3),
        vz: 0,
        life: range(rng, 0.4, 0.8),
        size0: range(rng, 1.2, 2.2),
        size1: 0.4,
        heat0: FIRE.max,
        heat1: FIRE.min - 0.3,
        glow0: GLOW.fire,
        glow1: 0.2,
        albedo: 0,
        gravity: 0,
        drag: 0.5,
        alpha: 0.9,
      });
    }
    this.smokePuff(p, dt, intensity * 0.6);
  }

  /** Dark smoke from a damaged vehicle: call every tick. */
  smokePuff(p: Vector3, dt: number, intensity = 1): void {
    const rng = this.rng;
    const wind = CONFIG.fx.wind;
    if (rng() < 3 * dt * intensity) {
      this.smoke.spawn({
        x: p.x,
        y: p.y + 2,
        z: p.z,
        vx: wind[0],
        vy: range(rng, 1.5, 2.5),
        vz: wind[2],
        life: range(rng, 6, 10),
        size0: 2,
        size1: range(rng, 7, 11),
        heat0: 0.45,
        heat1: 0.14,
        glow0: 0,
        glow1: 0,
        albedo: 0.15,
        gravity: -0.1,
        drag: 0.3,
        alpha: 0.45,
      });
    }
  }

  private shockwave(p: Vector3, maxRadius: number): void {
    const sw = this.shockwaves.reduce((a, b) => (b.age > a.age ? b : a)); // oldest / free
    sw.age = 0;
    sw.maxRadius = maxRadius;
    sw.mesh.position.set(p.x, p.y + 0.6, p.z);
    sw.mesh.visible = true;
  }

  private crater(p: Vector3, radius: number): void {
    const i = this.nextCrater;
    this.nextCrater = (this.nextCrater + 1) % this.craters.length;
    this.craters[i].age = 0;
    this.craters[i].active = true;

    // Orient the disc to the terrain slope so it doesn't stick out of hillsides.
    const e = 1;
    const n = this.v
      .set(
        this.groundAt(p.x - e, p.z) - this.groundAt(p.x + e, p.z),
        2 * e,
        this.groundAt(p.x, p.z - e) - this.groundAt(p.x, p.z + e),
      )
      .normalize();
    this.q.setFromUnitVectors(UP, n);
    const pos = this.s.set(p.x, this.groundAt(p.x, p.z), p.z).addScaledVector(n, 0.12);
    this.m.compose(pos, this.q, new Vector3(radius, 1, radius));
    this.craterMesh.setMatrixAt(i, this.m);
    this.craterMesh.instanceMatrix.needsUpdate = true;
    this.craterMesh.count = Math.max(this.craterMesh.count, i + 1);
  }

  /** Removes every particle, crater and shockwave (a restart, M8). */
  clear(): void {
    this.hot.clear();
    this.smoke.clear();
    for (const c of this.craters) c.active = false;
    this.craterMesh.count = 0;
    this.nextCrater = 0;
    for (const sw of this.shockwaves) sw.mesh.visible = false;
  }

  /** Fixed-step update: particles, shockwaves, crater cooling. */
  update(dt: number): void {
    this.hot.update(dt);
    this.smoke.update(dt);

    const dur = CONFIG.fx.shockwaveDuration;
    for (const sw of this.shockwaves) {
      if (!sw.mesh.visible) continue;
      sw.age += dt;
      const t = sw.age / dur;
      if (t >= 1) {
        sw.mesh.visible = false;
        continue;
      }
      const r = sw.maxRadius * (0.15 + 0.85 * Math.sqrt(t));
      sw.mesh.scale.set(r, 1, r);
      // Fades by cooling into the ground's heat instead of going transparent.
      sw.mat.setSignature(0.75 + (HEAT.soilMin - 0.75) * t, 0.2, 0.6 * (1 - t));
    }

    for (let i = 0; i < this.craters.length; i++) {
      const c = this.craters[i];
      if (!c.active) continue;
      c.age += dt;
      this.craterSig[i * 3] = coolingHeat(CRATER_COOLING, c.age);
      this.craterSig[i * 3 + 1] = CONFIG.fx.craterAlbedo;
      this.craterSig[i * 3 + 2] = 0;
    }
    const attr = this.craterMesh.geometry.getAttribute('instanceSignature');
    attr.needsUpdate = true;
  }

  /**
   * Per rendered frame: refreshes the sprite buffers. `tracers` gives each visible tracer's head
   * position and flight direction (plus streak length and sprite size; the gunship's tracers by
   * default); `eye` is the sensor position (close tracer points are skipped).
   */
  sync(
    heightPx: number,
    fovDeg: number,
    eye: Vector3,
    tracers: (emit: (head: Vector3, dir: Vector3, length?: number, size?: number) => void) => void,
  ): void {
    for (const layer of [this.hotLayer, this.smokeLayer, this.tracerLayer]) {
      layer.setViewport(heightPx, fovDeg);
      layer.begin();
    }
    this.hotLayer.pushParticles(this.hot);
    this.smokeLayer.pushParticles(this.smoke);

    const { tracerLength, tracerSize, tracerMinRange } = CONFIG.gunnery;
    const minSq = tracerMinRange * tracerMinRange;
    const segments = 6;
    tracers((head, dir, length = tracerLength, size = tracerSize) => {
      for (let k = 0; k < segments; k++) {
        const f = k / (segments - 1);
        const x = head.x - dir.x * length * f;
        const y = head.y - dir.y * length * f;
        const z = head.z - dir.z * length * f;
        const dx = x - eye.x;
        const dy = y - eye.y;
        const dz = z - eye.z;
        if (dx * dx + dy * dy + dz * dz < minSq) continue;
        this.tracerLayer.push(x, y, z, size * (1 - 0.6 * f), 1, 0, 1 - 0.7 * f, 1 - 0.8 * f);
      }
    });
    for (const layer of [this.hotLayer, this.smokeLayer, this.tracerLayer]) layer.end();
  }

  get activeCraters(): number {
    return this.craters.filter((c) => c.active).length;
  }

  /** Heat of crater slot `i` (for tests / debug). */
  craterHeat(i: number): number {
    return this.craterSig[i * 3];
  }

  /** Tracer sprites drawn in the last `sync` (for tests / debug). */
  get tracerSprites(): number {
    return this.tracerLayer.count;
  }

  get particleCount(): number {
    return this.hot.aliveCount + this.smoke.aliveCount;
  }
}

function still(x: number, y: number, z: number) {
  return { x, y, z, vx: 0, vy: 0, vz: 0 };
}
