import { CONFIG } from '../config';

export interface TeamHealthConfig {
  readonly health: number;
  readonly regenPerSecond: number;
  readonly quietTime: number;
}

/**
 * Ridgeback's shared health (PLAN.md §7.9, §9): 0–100, drained by enemy fire, regenerating
 * +1/s once no enemy has fired for 4 s. Individual friendlies never die from enemy fire;
 * this reaching 0 means the team is overrun.
 */
export class TeamHealth {
  value: number;
  /** Seconds since an enemy last fired at the team. */
  private quiet = Infinity;

  constructor(private readonly cfg: TeamHealthConfig = CONFIG.ridgeback) {
    this.value = cfg.health;
  }

  get max(): number {
    return this.cfg.health;
  }

  get overrun(): boolean {
    return this.value <= 0;
  }

  /** True while enemies are firing (or fired within the quiet time). */
  get underFire(): boolean {
    return this.quiet < this.cfg.quietTime;
  }

  damage(amount: number): void {
    if (amount <= 0) return;
    this.quiet = 0;
    this.value = Math.max(0, this.value - amount);
  }

  update(dt: number): void {
    this.quiet += dt;
    if (this.overrun || this.underFire) return;
    this.value = Math.min(this.cfg.health, this.value + this.cfg.regenPerSecond * dt);
  }
}
