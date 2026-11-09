import { CONFIG } from '../config';

/**
 * The mixer's buses (PLAN.md §7.17, M9): `master → { sfx, radio, ambience }`. Guns, impacts,
 * strikes, air defense and UI beeps are `sfx`; squelch and radio beeps are `radio`; the engine
 * drone is `ambience`. Each has its own player volume (settings) under the master.
 */
export type Bus = 'sfx' | 'radio' | 'ambience';

export const BUSES: readonly Bus[] = ['sfx', 'radio', 'ambience'];

/** The player's volumes, 0–1 (a slice of the settings). */
export interface Volumes {
  readonly volume: number;
  readonly sfxVolume: number;
  readonly radioVolume: number;
  readonly engineVolume: number;
}

export type MixConfig = typeof CONFIG.mix;

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/**
 * The gain on each node (pure): the master node carries the mix headroom times the player's
 * master volume; each bus node carries its own trim times the player's bus volume.
 */
export function busGains(
  v: Volumes,
  cfg: MixConfig = CONFIG.mix,
): { master: number } & Record<Bus, number> {
  return {
    master: cfg.master * clamp01(v.volume),
    sfx: cfg.sfx * clamp01(v.sfxVolume),
    radio: cfg.radio * clamp01(v.radioVolume),
    ambience: cfg.ambience * clamp01(v.engineVolume),
  };
}

/** What a sound on `bus` finally plays at (master × bus), for tests and the settings readout. */
export function effectiveGain(v: Volumes, bus: Bus, cfg: MixConfig = CONFIG.mix): number {
  const g = busGains(v, cfg);
  return g.master * g[bus];
}
