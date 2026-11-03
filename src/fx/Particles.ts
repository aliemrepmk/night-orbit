/** Everything needed to launch one particle. Sizes in meters; heat/albedo/glow 0–1. */
export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds until it disappears. */
  life: number;
  /** Size, heat and glow at birth and at death (linear in between). */
  size0: number;
  size1: number;
  heat0: number;
  heat1: number;
  glow0: number;
  glow1: number;
  albedo: number;
  /** Downward acceleration (m/s²; 9.8 for debris, negative for rising smoke). */
  gravity: number;
  /** Fraction of velocity lost per second (air drag). */
  drag: number;
  /** Opacity at birth; fades out over the last part of the life. */
  alpha: number;
}

/**
 * Pooled particle simulation in flat typed arrays (no allocations after startup, PLAN.md §11).
 * Pure: rendering lives in `ParticleView`. When full, new particles overwrite the oldest.
 */
export class Particles {
  readonly capacity: number;
  // Per-particle state.
  readonly pos: Float32Array;
  private readonly vel: Float32Array;
  readonly age: Float32Array;
  readonly life: Float32Array;
  private readonly size: Float32Array; // size0, size1
  private readonly heat: Float32Array; // heat0, heat1
  private readonly glow: Float32Array; // glow0, glow1
  readonly albedo: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly alpha0: Float32Array;
  private next = 0;

  /** Optional ground: debris stops when it hits it. */
  constructor(
    capacity: number,
    private readonly groundAt: ((x: number, z: number) => number) | null = null,
  ) {
    this.capacity = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity); // 0 = slot free
    this.size = new Float32Array(capacity * 2);
    this.heat = new Float32Array(capacity * 2);
    this.glow = new Float32Array(capacity * 2);
    this.albedo = new Float32Array(capacity);
    this.gravity = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.alpha0 = new Float32Array(capacity);
  }

  spawn(p: ParticleSpec): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx, p.vy, p.vz], i * 3);
    this.age[i] = 0;
    this.life[i] = Math.max(1e-3, p.life);
    this.size.set([p.size0, p.size1], i * 2);
    this.heat.set([p.heat0, p.heat1], i * 2);
    this.glow.set([p.glow0, p.glow1], i * 2);
    this.albedo[i] = p.albedo;
    this.gravity[i] = p.gravity;
    this.drag[i] = p.drag;
    this.alpha0[i] = p.alpha;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] === 0) continue;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        continue;
      }
      const k = i * 3;
      const damp = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= damp;
      this.vel[k + 1] = this.vel[k + 1] * damp - this.gravity[i] * dt;
      this.vel[k + 2] *= damp;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;

      if (this.groundAt) {
        const g = this.groundAt(this.pos[k], this.pos[k + 2]);
        if (this.pos[k + 1] < g) {
          this.pos[k + 1] = g;
          this.vel[k] = this.vel[k + 1] = this.vel[k + 2] = 0; // debris lands and stays
        }
      }
    }
  }

  isAlive(i: number): boolean {
    return this.life[i] > 0;
  }

  /** 0 at birth → 1 at death. */
  private t(i: number): number {
    return this.age[i] / this.life[i];
  }

  sizeOf(i: number): number {
    return lerp(this.size[i * 2], this.size[i * 2 + 1], this.t(i));
  }

  heatOf(i: number): number {
    return lerp(this.heat[i * 2], this.heat[i * 2 + 1], this.t(i));
  }

  glowOf(i: number): number {
    return lerp(this.glow[i * 2], this.glow[i * 2 + 1], this.t(i));
  }

  /** Full opacity for the first 60% of the life, then a smooth fade to 0. */
  alphaOf(i: number): number {
    const t = this.t(i);
    const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    return this.alpha0[i] * fade * fade;
  }

  get aliveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) n++;
    return n;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
