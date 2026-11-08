import { Vector3 } from 'three';
import { ARMOR, type Armor, type DamageSource } from '../combat/Damage';
import type { Target } from '../combat/Explosions';
import { CONFIG } from '../config';
import type { HelicopterStage } from '../mission/Mission';

export type HelicopterConfig = { readonly [K in keyof typeof CONFIG.helicopter]: number };

/**
 * - `inbound`: flying in at cruise height toward the pad
 * - `landing`: over the pad, slowing and descending
 * - `landed`: on the ground, rotors turning, waiting for Ridgeback
 * - `boarding`: the team is aboard; a short wait before lift-off
 * - `departing`: climbing away
 * - `destroyed`: shot down (by enemy fire or the player's): a burning wreck, mission failed
 * - `gone`: out of sight (or never called)
 */
export type HelicopterState =
  'gone' | 'inbound' | 'landing' | 'landed' | 'boarding' | 'departing' | 'destroyed';

/** Who brought it down: the player's ordnance, or enemy small-arms fire. */
export type HelicopterKiller = DamageSource | 'enemy' | null;

/**
 * Kestrel 6, the extraction helicopter (PLAN.md §8 phase 4): a scripted flight, but a real
 * friendly target. It flies in from the map edge, lands at the LZ pad, waits for `board()`, then
 * lifts off and leaves the way it came. While it is low (landing, on the ground, climbing out)
 * enemy soldiers in range shoot at it (`takeFire`), and the gunship's own blasts hurt it like
 * any target (`takeDamage`, by 3D distance, so it is safe from ground impacts while high up).
 * Losing it fails the mission. Very hot in thermal. Pure: `HelicopterRenderer` draws it.
 */
export class Helicopter implements Target {
  readonly kind = 'aircraft' as const;
  readonly side = 'friendly' as const;
  state: HelicopterState = 'gone';
  readonly position = new Vector3();
  hp: number;
  /** Dev cheat `G` (god mode) covers Kestrel 6 too. */
  invulnerable = false;
  killedBy: HelicopterKiller = null;
  /** Seconds since enemy fire last hit it (Infinity: never). */
  sinceFire = Infinity;
  /** Facing: forward is (sin h, cos h). */
  heading = 0;
  /** Rotor angle (radians), for the renderer. */
  rotor = 0;
  private readonly pad = new Vector3();
  private readonly from = new Vector3();
  private wait = 0;
  private departTime = 0;

  constructor(
    private readonly groundAt: (x: number, z: number) => number,
    private readonly cfg: HelicopterConfig = CONFIG.helicopter,
  ) {
    this.hp = cfg.hp;
  }

  get maxHp(): number {
    return this.cfg.hp;
  }

  /** In the air or on the ground, and not destroyed (blasts and the grid only see it then). */
  get alive(): boolean {
    return this.state !== 'gone' && this.state !== 'destroyed';
  }

  get armor(): Armor {
    return ARMOR.helicopter;
  }

  /** Low enough for soldiers on the ground to hit it (landing, landed, boarding, climbing out). */
  get exposed(): boolean {
    if (!this.alive || this.state === 'inbound') return false;
    return (
      this.position.y - this.groundAt(this.position.x, this.position.z) < this.cfg.exposedHeight
    );
  }

  /** Under enemy fire right now (for the HUD and Kestrel's radio calls). */
  get underFire(): boolean {
    return this.sinceFire < 1;
  }

  /** A blast from the gunship or an air strike. */
  takeDamage(amount: number, source: DamageSource, _from: Vector3): void {
    this.hurt(amount, source);
  }

  /** Enemy small-arms fire (`amount` already scaled by range and accuracy). */
  takeFire(amount: number): void {
    if (!this.alive) return;
    this.sinceFire = 0;
    this.hurt(amount, 'enemy');
  }

  private hurt(amount: number, by: HelicopterKiller): void {
    if (!this.alive || this.invulnerable || amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp > 0) return;
    this.state = 'destroyed';
    this.killedBy = by;
  }

  /** Starts the flight from (fx, fz) to the pad at (px, pz). */
  call(fx: number, fz: number, px: number, pz: number): void {
    this.from.set(fx, 0, fz);
    this.pad.set(px, this.groundAt(px, pz), pz);
    this.position.set(fx, this.groundAt(fx, fz) + this.cfg.cruiseHeight, fz);
    this.heading = Math.atan2(px - fx, pz - fz);
    this.state = 'inbound';
    this.departTime = 0;
    this.hp = this.cfg.hp;
    this.killedBy = null;
    this.sinceFire = Infinity;
  }

  /** Where it sits once landed (the team walks here). */
  get padPosition(): Vector3 {
    return this.pad;
  }

  /** The flight as the mission script sees it (`helicopter('landed')` etc.). */
  get stage(): HelicopterStage {
    switch (this.state) {
      case 'gone':
        return this.departTime > 0 ? 'departed' : 'none';
      case 'inbound':
      case 'landing':
        return 'inbound';
      case 'landed':
        return 'landed';
      case 'boarding':
        return 'boarded';
      case 'departing':
        return 'departed';
      case 'destroyed':
        return 'none';
    }
  }

  /** Ridgeback is aboard: lift off after a moment. */
  board(): void {
    if (this.state !== 'landed') return;
    this.state = 'boarding';
    this.wait = this.cfg.boardSeconds;
  }

  get visible(): boolean {
    return this.state !== 'gone';
  }

  update(dt: number): void {
    if (this.state === 'gone') return;
    this.sinceFire += dt;
    const c = this.cfg;
    if (this.state === 'destroyed') {
      // The wreck falls to the ground and stays there.
      const ground = this.groundAt(this.position.x, this.position.z);
      this.position.y = Math.max(ground, this.position.y - 25 * dt);
      return;
    }
    this.rotor += dt * (this.state === 'landed' || this.state === 'boarding' ? 18 : 24);
    const p = this.position;
    switch (this.state) {
      case 'inbound': {
        const dx = this.pad.x - p.x;
        const dz = this.pad.z - p.z;
        const d = Math.hypot(dx, dz);
        const step = c.speed * dt;
        if (d <= c.approachDistance) {
          this.state = 'landing';
          return;
        }
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        p.y = this.groundAt(p.x, p.z) + c.cruiseHeight;
        return;
      }
      case 'landing': {
        // Glide the last stretch at a speed that falls with distance; descend in step with it.
        const dx = this.pad.x - p.x;
        const dz = this.pad.z - p.z;
        const d = Math.hypot(dx, dz);
        const k = Math.min(1, dt / c.landingTau);
        p.x += dx * k;
        p.z += dz * k;
        const targetY = this.pad.y + c.cruiseHeight * Math.min(1, d / c.approachDistance);
        p.y += (targetY - p.y) * k;
        if (d < 0.5 && p.y - this.pad.y < 0.6) {
          p.copy(this.pad);
          this.state = 'landed';
        }
        return;
      }
      case 'landed':
        return;
      case 'boarding':
        this.wait -= dt;
        if (this.wait <= 0) {
          this.state = 'departing';
          this.departTime = 0.0001;
          this.heading = Math.atan2(this.from.x - p.x, this.from.z - p.z);
        }
        return;
      case 'departing': {
        this.departTime += dt;
        const climb = Math.min(1, this.departTime / c.climbSeconds);
        p.y = this.pad.y + c.cruiseHeight * climb;
        const fx = Math.sin(this.heading);
        const fz = Math.cos(this.heading);
        const v = c.speed * climb;
        p.x += fx * v * dt;
        p.z += fz * v * dt;
        if (this.departTime >= c.departSeconds) this.state = 'gone';
        return;
      }
    }
  }
}
