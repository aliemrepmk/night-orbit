import { CONFIG } from '../config';
import type { Rng } from '../core/rng';
import { POOLS, type Pool, type PoolId } from './lines';
import type { Radio } from './Radio';

export type ChatterConfig = { readonly [K in keyof typeof CONFIG.chatter]: number };

/**
 * Reactive radio chatter (PLAN.md §7.15): game events become lines from `lines.ts`, each pool
 * with its own cooldown, picked at random but never the same line twice in a row. Kills are
 * gathered for a moment so a group wiped by one shell gets one "multiple down" call instead of
 * five "target down"s. Pure: `MissionHost` feeds it events and it speaks into the `Radio`.
 */
export class Chatter {
  private readonly ready = new Map<PoolId, number>();
  private readonly last = new Map<PoolId, number>();
  private time = 0;
  /** Kills in the current gathering window, and when the window closes. */
  private kills = 0;
  private killWindowEnd = -1;
  /** How long the crosshair has been on the clinic. */
  private hover = 0;

  constructor(
    private readonly radio: Radio,
    private readonly rng: Rng,
    private readonly cfg: ChatterConfig = CONFIG.chatter,
    private readonly pools: Readonly<Record<PoolId, Pool>> = POOLS,
  ) {}

  /** Speaks a line from `pool` if its cooldown allows; returns whether it spoke. */
  say(pool: PoolId): boolean {
    if ((this.ready.get(pool) ?? 0) > this.time) return false;
    const p = this.pools[pool];
    this.ready.set(pool, this.time + p.cooldown);
    this.radio.say(p.speaker, this.pick(pool, p), p.priority);
    return true;
  }

  /** The player's fire killed an enemy soldier. */
  infantryKilled(): void {
    if (this.kills === 0) this.killWindowEnd = this.time + this.cfg.multiKillWindow;
    this.kills++;
  }

  vehicleKilled(): void {
    this.say('vehicleKill');
  }

  /** Per fixed step. `onClinic`: the crosshair is on the protected clinic right now. */
  update(dt: number, onClinic: boolean): void {
    this.time += dt;
    if (this.kills > 0 && this.time >= this.killWindowEnd) {
      this.say(this.kills >= this.cfg.multiKillCount ? 'multiKill' : 'kill');
      this.kills = 0;
    }
    this.hover = onClinic ? this.hover + dt : 0;
    if (this.hover >= this.cfg.clinicHoverSeconds) {
      this.say('clinicHover');
      this.hover = 0;
    }
  }

  private pick(id: PoolId, p: Pool): string {
    const n = p.lines.length;
    let i = Math.floor(this.rng() * n);
    const prev = this.last.get(id);
    if (n > 1 && i === prev) i = (i + 1 + Math.floor(this.rng() * (n - 1))) % n;
    this.last.set(id, i);
    return p.lines[i];
  }
}
