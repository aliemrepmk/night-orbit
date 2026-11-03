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

  thermal: {
    /** Heat that hides in the air: distant things fade toward this value. */
    hazeHeat: 0.1,
    /** Haze per meter of view distance (1 − e^(−d·density) is the haze amount). */
    hazeDensity: 0.00015,
    /** Heat of empty sky (rarely visible looking down). */
    skyHeat: 0.04,
    /** Amplitude of the world-space surface noise added to every object's heat. */
    surfaceNoise: 0.06,
    bloom: { strength: 0.55, radius: 0.35, threshold: 0.7 },
    /** Contrast window: heat `lo` maps to black and `hi` to white (before polarity). */
    levels: { lo: -0.05, hi: 1.05 },
    /** Gamma per weapon (slightly different look per optic). Below 1 lifts the dark ground. */
    gamma: { '25': 0.8, '40': 0.75, '105': 0.72 },
    /** Grain amplitude at the widest (105 mm) and narrowest (25 mm) field of view. */
    grainWide: 0.035,
    grainNarrow: 0.075,
    scanlines: 0.06,
    /** Brightness of the slow rolling interlace band, and how fast it rolls (screens/s). */
    rollBand: 0.025,
    rollSpeed: 0.07,
    vignette: 0.45,
    /** Barrel distortion strength (0 = none). */
    barrel: 0.04,
    /** Optional "night vision" tint as RGB multipliers; [1, 1, 1] = pure grayscale. */
    tint: [1, 1, 1] as readonly [number, number, number],
    /** Render-target MSAA samples (the canvas' own antialias doesn't apply to post-processing). */
    msaaSamples: 4,
  },

  sensorFx: {
    /** Static burst on weapon switch, in seconds. */
    staticDuration: 0.15,
    /** Refocus blur after a weapon switch, in seconds. */
    refocusDuration: 0.4,
    /** Blur radius at the start of the refocus, in pixels. */
    refocusBlurPx: 4,
  },
} as const;

export type OrbitConfig = { readonly [K in keyof typeof CONFIG.orbit]: number };
export type SensorConfig = { readonly [K in keyof typeof CONFIG.sensor]: number };
export type TerrainConfig = { readonly [K in keyof typeof CONFIG.terrain]: number };
export type SensorFxConfig = { readonly [K in keyof typeof CONFIG.sensorFx]: number };
