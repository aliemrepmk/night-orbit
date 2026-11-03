/**
 * Every tunable number lives here so balancing never requires touching system code.
 * Units: meters, seconds, degrees (unless a name says otherwise).
 */
export const CONFIG = {
  loop: {
    /** Fixed simulation step (60 Hz). */
    step: 1 / 60,
    /** Longest real-time gap processed in one frame (avoids a "spiral of death" after tab switches). */
    maxFrame: 0.25,
  },

  terrain: {
    /** Size of the generated ground mesh. Larger than the playable map so edges are never seen. */
    size: 3200,
    cellSize: 10,
    seed: 1337,
    /** Peak-to-trough scale of the rolling hills. */
    hillHeight: 28,
  },

  map: {
    /** The playable area (the mission takes place inside this square). */
    size: 1600,
  },

  orbit: {
    radius: 900,
    altitude: 700,
    /** Seconds for one full circle. */
    period: 120,
    /** Time constant for the orbit center gliding to a new focus point. */
    centerGlideTau: 4,
    bobAmplitude: 4,
    bobFrequency: 0.05,
  },

  sensor: {
    /** The aim point can't move further than this from the orbit center (gimbal limit). */
    gimbalRadius: 450,
    /** 1.0 = the ground under the cursor tracks the mouse one-to-one. */
    sensitivity: 1.0,
    /** Time constant of the zoom (FOV) transition. */
    zoomTau: 0.08,
    /** Hand-held style camera jitter, in degrees. */
    jitterDeg: 0.008,
    /** Forward slew is divided by sin(depression); never divide by less than this. */
    minDepressionSin: 0.2,
    near: 10,
    far: 6000,
  },
} as const;

export type OrbitConfig = { readonly [K in keyof typeof CONFIG.orbit]: number };
export type SensorConfig = { readonly [K in keyof typeof CONFIG.sensor]: number };
export type TerrainConfig = { readonly [K in keyof typeof CONFIG.terrain]: number };
