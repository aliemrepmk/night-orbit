import { WEAPONS, WEAPON_ORDER, type WeaponDef, type WeaponId } from './weaponDefs';

export type WeaponStatus = 'ready' | 'cycling' | 'reloading' | 'overheated';

/**
 * One gun's state machine (PLAN.md §7.6):
 *
 *   READY ──trigger──► FIRING ──clip empty / overheat──► RELOADING ──timer──► READY
 *     ▲                  │
 *     └──interval done───┘
 *
 * Pure logic: no DOM, no three.js. Reloads and barrel cooling continue while the gun isn't
 * selected (the crew keeps working).
 */
export class WeaponState {
  /** Rounds left in the clip (`semi` / `single`). */
  rounds: number;
  /** Barrel heat 0–1 (`auto`). */
  heat = 0;
  /** Seconds until the next shot is allowed by the fire-rate gate. */
  private cycle = 0;
  /** Seconds left on the current reload / overheat cooldown (0 = none). */
  reloadLeft = 0;
  /** True for the one step in which a reload, cooldown or jam finished (M9: the ready beep). */
  justReady = false;

  constructor(readonly def: WeaponDef) {
    this.rounds = def.capacity;
  }

  /** The gun is jammed (M8+ Phase F): no fire for `seconds` (shown as loading). */
  jam(seconds: number): void {
    this.reloadLeft = Math.max(this.reloadLeft, seconds);
  }

  get status(): WeaponStatus {
    if (this.reloadLeft > 0) return this.def.fireMode === 'auto' ? 'overheated' : 'reloading';
    if (this.cycle > 0) return 'cycling';
    return 'ready';
  }

  /** 0–1 progress of the current reload / cooldown (1 when not reloading). */
  get reloadProgress(): number {
    return this.reloadLeft > 0 ? 1 - this.reloadLeft / this.def.reload : 1;
  }

  /**
   * Advances one fixed step. `selected` gates firing; `held` = trigger held; `clicks` = trigger
   * presses this step. Returns how many shots were fired this step.
   */
  update(dt: number, selected: boolean, held: boolean, clicks: number): number {
    const d = this.def;
    let shots = 0;
    this.justReady = false;

    if (this.reloadLeft > 0) {
      this.reloadLeft = Math.max(0, this.reloadLeft - dt);
      if (this.reloadLeft === 0) {
        this.justReady = true;
        this.rounds = d.capacity;
        this.heat = 0;
      }
    }

    if (d.fireMode === 'auto') {
      // The fire-rate gate accumulates exactly, so 10 shots/s holds at any tick rate.
      this.cycle -= dt;
      const firing = selected && held && this.reloadLeft === 0;
      if (firing) {
        while (this.cycle <= 0 && this.heat < 1) {
          shots++;
          this.cycle += d.interval;
          this.heat = Math.min(1, this.heat + d.heatPerShot);
        }
        if (this.heat >= 1 - 1e-9) {
          this.heat = 1;
          this.reloadLeft = d.reload; // forced cooldown
        }
      } else {
        if (this.cycle < 0) this.cycle = 0;
        if (this.reloadLeft === 0) this.heat = Math.max(0, this.heat - d.coolRate * dt);
      }
      return shots;
    }

    // semi / single: one shot per click when ready; extra clicks while cycling are ignored.
    this.cycle = Math.max(0, this.cycle - dt);
    if (selected && clicks > 0 && this.cycle === 0 && this.reloadLeft === 0 && this.rounds > 0) {
      shots = 1;
      this.rounds--;
      this.cycle = d.interval;
      if (this.rounds === 0) this.reloadLeft = d.reload;
    }
    return shots;
  }
}

/** All three guns. Only the selected one fires; the others keep reloading / cooling. */
export class Weapons {
  readonly guns: Readonly<Record<WeaponId, WeaponState>> = {
    '25': new WeaponState(WEAPONS['25']),
    '40': new WeaponState(WEAPONS['40']),
    '105': new WeaponState(WEAPONS['105']),
  };

  /** Returns the shots fired this step by the selected weapon. */
  update(dt: number, selected: WeaponId, held: boolean, clicks: number): number {
    let shots = 0;
    for (const id of WEAPON_ORDER) {
      const n = this.guns[id].update(dt, id === selected, held, clicks);
      if (id === selected) shots = n;
    }
    return shots;
  }

  /** Guns that became ready to fire this step (M9: the ready beep). */
  get readied(): WeaponId[] {
    return WEAPON_ORDER.filter((id) => this.guns[id].justReady);
  }
}
