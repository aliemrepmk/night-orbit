import { CONFIG } from '../config';

export type EngineSoundConfig = typeof CONFIG.engineSound;

/** How the drone plays: off (title, briefing), full (flying), muffled (pause, settings, end screens). */
export type EngineMode = 'off' | 'on' | 'muffled';

/** Where the drone's level and muffle filter go for each mode (the audio engine ramps to them). */
export interface EngineMix {
  readonly gain: number;
  readonly cutoffHz: number;
  /** Seconds the ramp takes. */
  readonly rampSeconds: number;
}

/** Per-frame tuning from the flight: pitch multiplier and stereo pan. */
export interface EngineTune {
  readonly pitch: number;
  readonly pan: number;
}

/** The mix target for a mode (pure). Fading in or out is slow; muffling is quick. */
export function engineMix(
  mode: EngineMode,
  cfg: EngineSoundConfig = CONFIG.engineSound,
): EngineMix {
  switch (mode) {
    case 'off':
      return { gain: 0, cutoffHz: cfg.muffledCutoffHz, rampSeconds: cfg.fadeSeconds };
    case 'on':
      return { gain: cfg.gain, cutoffHz: cfg.openCutoffHz, rampSeconds: cfg.fadeSeconds };
    case 'muffled':
      return {
        gain: cfg.gain * cfg.muffledGain,
        cutoffHz: cfg.muffledCutoffHz,
        rampSeconds: cfg.muffleSeconds,
      };
  }
}

/**
 * The drone follows the orbit so it never sounds like a loop: the pitch rises and falls a
 * little twice per circle (the props loading in the turn) plus a slow wander, and the engines
 * swing gently across the stereo field as the aircraft circles. `orbitAngle` in radians, `time`
 * in seconds.
 */
export function engineTune(
  orbitAngle: number,
  time: number,
  cfg: EngineSoundConfig = CONFIG.engineSound,
): EngineTune {
  const wander = Math.sin((2 * Math.PI * time) / cfg.wanderSeconds);
  const pitch = 1 + cfg.pitchWobble * (0.7 * Math.sin(2 * orbitAngle) + 0.3 * wander);
  return { pitch, pan: cfg.pan * Math.sin(orbitAngle) };
}

/** Each engine's frequency (Hz) for a pitch multiplier: the base, detuned per engine. */
export function engineFrequencies(
  pitch: number,
  cfg: EngineSoundConfig = CONFIG.engineSound,
): number[] {
  return cfg.detuneCents.map((c) => cfg.baseHz * pitch * 2 ** (c / 1200));
}
