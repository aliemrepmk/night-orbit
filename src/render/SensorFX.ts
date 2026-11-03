import { CONFIG, type SensorFxConfig } from '../config';

/**
 * Transient sensor effects, as pure state: a short static burst and a refocus blur after a
 * weapon (optic) switch. `ThermalPass` reads `staticAmount` and `blurPx` every frame.
 */
export class SensorFX {
  /** Seconds since the last switch (starts "long ago" so nothing shows at startup). */
  private sinceSwitch = Infinity;

  constructor(private readonly cfg: SensorFxConfig = CONFIG.sensorFx) {}

  /** Call when the optic changes. Re-triggering restarts the effect. */
  triggerSwitch(): void {
    this.sinceSwitch = 0;
  }

  update(dt: number): void {
    this.sinceSwitch += dt;
  }

  /** 0–1: full static right after the switch, gone after `staticDuration`. */
  get staticAmount(): number {
    const t = this.sinceSwitch / this.cfg.staticDuration;
    if (t >= 1) return 0;
    return 1 - t * t; // holds near full, then drops off
  }

  /** Blur radius in pixels: starts at `refocusBlurPx`, eases to 0 over `refocusDuration`. */
  get blurPx(): number {
    const t = this.sinceSwitch / this.cfg.refocusDuration;
    if (t >= 1) return 0;
    const u = 1 - t;
    return this.cfg.refocusBlurPx * u * u; // fast refocus at first, settles gently
  }
}
