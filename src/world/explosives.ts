import { Vector3 } from 'three';
import { damageAt } from '../combat/Damage';
import { CONFIG } from '../config';
import { ORDNANCE } from '../gunship/airSupportDefs';
import type { Ordnance } from '../gunship/weaponDefs';

/** One explosive object from the map (a fuel tank): center and radius. */
export interface ExplosiveDef {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
}

export type ExplosiveState = 'intact' | 'primed' | 'burning' | 'burnt';

interface Tank {
  readonly def: ExplosiveDef;
  hp: number;
  state: ExplosiveState;
  /** Seconds until it goes up (primed) or stops burning (burning). */
  timer: number;
}

export type DepotConfig = { readonly [K in keyof typeof CONFIG.depot]: number };

/**
 * The fuel depot (M8+ Phase D): tanks take damage from impacts near them; one that runs out of
 * HP goes up a moment later in a fireball (`TANK_BLAST`) that can set its neighbors off too (the
 * blast is itself an impact), then burns for a while. Pure: the fireball is handed to a callback.
 */
export class Explosives {
  private readonly tanks: Tank[];

  constructor(
    defs: readonly ExplosiveDef[],
    private readonly cfg: DepotConfig = CONFIG.depot,
  ) {
    this.tanks = defs.map((def) => ({ def, hp: cfg.tankHp, state: 'intact', timer: 0 }));
  }

  /** An impact of ordnance `w` at (x, z): damages every intact tank in reach (to its wall). */
  hit(x: number, z: number, w: Ordnance): void {
    for (const t of this.tanks) {
      if (t.state !== 'intact') continue;
      const d = Math.max(0, Math.hypot(x - t.def.x, z - t.def.z) - t.def.radius);
      t.hp -= damageAt(w, d);
      if (t.hp <= 0) {
        t.state = 'primed';
        t.timer = this.cfg.fuse;
      }
    }
  }

  /** Advances fuses and fires; `detonate` is called once per tank as it goes up. */
  update(dt: number, detonate: (at: Vector3, tank: ExplosiveDef) => void): void {
    for (const t of this.tanks) {
      if (t.state === 'primed') {
        t.timer -= dt;
        if (t.timer <= 0) {
          t.state = 'burning';
          t.timer = this.cfg.burnSeconds;
          detonate(new Vector3(t.def.x, t.def.y, t.def.z), t.def);
        }
      } else if (t.state === 'burning') {
        t.timer -= dt;
        if (t.timer <= 0) t.state = 'burnt';
      }
    }
  }

  stateOf(id: string): ExplosiveState | undefined {
    return this.tanks.find((t) => t.def.id === id)?.state;
  }

  /** Tanks on fire now, with how strongly they burn (1 → 0 as the fire dies down). */
  *burning(): Generator<{ def: ExplosiveDef; intensity: number }> {
    for (const t of this.tanks) {
      if (t.state === 'burning') {
        yield { def: t.def, intensity: Math.min(1, (t.timer / this.cfg.burnSeconds) * 1.5) };
      }
    }
  }
}

/**
 * A fuel tank going up: a huge, hot fireball (bigger flash than the bomb, smaller blast).
 * It counts as an air-support-sized impact (`id: 'bomb'`), so kills are the player's.
 */
export const TANK_BLAST: Ordnance = {
  ...ORDNANCE.bomb,
  damage: 2500,
  innerRadius: 9,
  blastRadius: 28,
  dangerClose: 60,
  panicRadius: 80,
  fx: {
    ...ORDNANCE.bomb.fx,
    flashSize: 64,
    debris: 120,
    smoke: 34,
    smokeSize: 50,
    craterRadius: 0, // the tank's own footprint
    dust: 24,
    shakeDeg: 0.55,
  },
};
