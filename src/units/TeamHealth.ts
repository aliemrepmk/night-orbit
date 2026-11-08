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
  /** Dev cheat `G` (god mode): enemy fire no longer drains the team. */
  invulnerable = false;
  /** Damage factor (a wounded operator makes the team easier to hurt, M8+ Phase F). */
  damageScale = 1;
  /** Health lost to enemy fire so far (the mission's "damage taken", M8). */
  taken = 0;
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
    if (this.invulnerable) return;
    const before = this.value;
    this.value = Math.max(0, this.value - amount * this.damageScale);
    this.taken += before - this.value;
  }

  update(dt: number): void {
    this.quiet += dt;
    if (this.overrun || this.underFire) return;
    this.value = Math.min(this.cfg.health, this.value + this.cfg.regenPerSecond * dt);
  }
}
