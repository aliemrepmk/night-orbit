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
  private readonly bags = new Map<PoolId, number[]>();
  /** Seconds the radio has been silent while nothing was happening (banter after a while). */
  private calmFor = 0;
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

  /**
   * Per fixed step. `onClinic`: the crosshair is on the protected clinic right now. `calm`: the
   * team isn't under fire; after `banterAfter` s of calm radio silence the crew chats a little.
   */
  update(dt: number, onClinic: boolean, calm = false): void {
    this.time += dt;
    const silent = !this.radio.current && this.radio.waiting === 0;
    this.calmFor = calm && silent ? this.calmFor + dt : 0;
    if (this.calmFor >= this.cfg.banterAfter) {
      this.calmFor = 0;
      this.say('banter');
    }
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

  /**
   * A shuffle bag per pool (M8+ Phase F): every line is used once before any repeats, in a fresh
   * random order each round, and a round never starts with the line that ended the last one.
   */
  private pick(id: PoolId, p: Pool): string {
    const n = p.lines.length;
    let bag = this.bags.get(id);
    if (!bag || bag.length === 0) {
      bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      const prev = this.last.get(id);
      if (n > 1 && bag[bag.length - 1] === prev)
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      this.bags.set(id, bag);
    }
    const i = bag.pop()!;
    this.last.set(id, i);
    return p.lines[i];
  }

  /** A pool line with `{place}` filled in (landmark callouts, M8+ Phase F). */
  sayPlace(pool: PoolId, place: string): boolean {
    if ((this.ready.get(pool) ?? 0) > this.time) return false;
    const p = this.pools[pool];
    this.ready.set(pool, this.time + p.cooldown);
    this.radio.say(p.speaker, this.pick(pool, p).replace('{place}', place), p.priority);
    return true;
  }
}
