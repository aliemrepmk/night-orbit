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
    /** Time constant of camera shake decay after an impact or a 105 mm shot. */
    shakeTau: 0.25,
    /** Camera kick when the 105 mm fires (the whole aircraft recoils), in degrees. */
    recoilDeg: 0.06,
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
  },

  /** The night-vision (image-intensifier) sensor: sees reflected starlight, not heat. */
  nightVision: {
    /** Direction *toward* the moon (normalized in the shader). */
    moonDir: [-0.4, 0.8, 0.3] as readonly [number, number, number],
    /** Light from the moon on a surface facing it, and from the whole sky (stars, airglow). */
    moonLight: 0.3,
    skyLight: 0.45,
    /** Brightness of the night sky itself (glows in NV), and of the haze distant things fade to. */
    skyBackground: 0.3,
    hazeLight: 0.28,
    /** NV scatters more than thermal, so haze builds up faster with distance. */
    hazeDensity: 0.00025,
    /** Relative surface brightness variation (multiplies light by 1 ± noise/2). */
    surfaceNoise: 0.3,
    /** Display curve: light × gain, clamped, then gamma. */
    gain: 1.5,
    gamma: 0.9,
    /** Image-intensifier scintillation: thermal grain × this. */
    grainScale: 1.8,
    vignette: 0.6,
    /** Green phosphor color (RGB multipliers on the final brightness). */
    phosphor: [0.5, 1.0, 0.42] as readonly [number, number, number],
  },

  render: {
    /**
     * Cap on device pixels per CSS pixel. Full Retina (2×) with the thermal chain cost ~23 ms of
     * GPU per frame on a MacBook (over the 16.7 ms budget → laggy aim); 1.5× costs ~7 ms and still
     * supersamples a little. The grainy thermal look hides the difference.
     */
    maxPixelRatio: 1.5,
    /**
     * Render-target MSAA samples. Off: on a half-float target it was the single biggest cost
     * (~10 ms/frame at 2×), and grain + bloom hide aliasing. The canvas' own antialias flag
     * doesn't apply to post-processing either way.
     */
    msaaSamples: 0,
  },

  sensorFx: {
    /** Static burst on weapon switch, in seconds. */
    staticDuration: 0.15,
    /** Refocus blur after a weapon switch, in seconds. */
    refocusDuration: 0.4,
    /** Blur radius at the start of the refocus, in pixels. */
    refocusBlurPx: 4,
    /** How long an impact whiteout takes to fade, in seconds. */
    whiteoutDuration: 0.35,
  },

  gunnery: {
    /** Where shells leave the aircraft: meters below it and toward the orbit center (left side). */
    muzzleDrop: 6,
    muzzleSide: 12,
    /** Tracer streak length behind each shell, in meters, and its sprite size. */
    tracerLength: 30,
    tracerSize: 0.9,
    /**
     * Tracers aren't drawn within this distance of the sensor (it's focused on the ground ~1 km
     * away), and never larger than `tracerMaxPx` device pixels. Without this, the first meters
     * of each tracer filled the screen as huge white blobs.
     */
    tracerMinRange: 150,
    tracerMaxPx: 7,
  },

  /** Soldiers of both sides (unit stats per type live in `units/unitDefs.ts`). */
  infantry: {
    /** Drawn 1.3× life size so soldiers read at 105 mm (M1 sign-off). */
    scale: 1.3,
    /** Height of the body's center above the ground while standing, and when lying dead. */
    lift: 1.43,
    downLift: 0.3,
    /** Seconds a killed soldier flies before lying flat (PLAN.md §7.7: ~0.6 s arc). */
    flingTime: 0.6,
    /** Fastest fling speed (m/s) right at the impact; farther = gentler (30 / distance). */
    flingMaxSpeed: 14,
    /** Most soldiers alive or dead at once (PLAN.md §11: ≤ 120 live infantry); old bodies recycle. */
    maxUnits: 128,
    /** Soldiers closer than this push apart (separation steering). */
    separation: 2.5,
    separationStrength: 1.6,
    /** How fast a soldier turns toward where it walks (radians per second). */
    turnRate: 5,
    /** Enemy decisions run this often, staggered (PLAN.md §7.11: 4 Hz). */
    thinkInterval: 0.25,
    /** Walk animation: vertical bob (m), forward lean (rad), and strides per meter walked. */
    bobHeight: 0.09,
    leanRad: 0.12,
    /** Running away leans further; crouching in cover drops the body and bends it forward. */
    fleeLeanRad: 0.35,
    crouchDrop: 0.45,
    crouchLeanRad: 0.3,
    stridesPerMeter: 0.7,
  },

  /** Enemy decisions: cover, line of sight and morale (PLAN.md §7.11). */
  ai: {
    /** Line-of-sight checks run from this far above a soldier's body center (eye level). */
    eyeHeight: 0.5,
    /** Soldiers keep this far from walls (they slide along houses instead of through them). */
    bodyRadius: 0.6,
    /** Seconds a soldier keeps sliding along a wall after bumping into it. */
    wallSlideTime: 0.6,
    /** Look for cover within this radius, once within range × `coverEngageFactor` of the target. */
    coverSearchRadius: 40,
    coverEngageFactor: 1.25,
    /** A cover point must be within range × this of the target (and not farther than the soldier). */
    coverReach: 0.9,
    /** Cover at least this much closer to the target is taken even without a view from it (bounding forward). */
    coverBound: 15,
    /** Close enough to count as in cover (m), and how far from walls corners are placed. */
    coverArrive: 0.8,
    coverMargin: 1.4,
    /** Ridgeback's chance to hit a crouched enemy, relative to one in the open. */
    coverHitFactor: 0.5,
    /** Morale: this many allies killed within `moraleRadius` (or being wounded) shakes a soldier, who then breaks with `fleeChance`. */
    lossesToBreak: 3,
    moraleRadius: 25,
    fleeChance: 0.3,
    /** Fleeing soldiers run this much faster than they walk. */
    fleeSpeedFactor: 1.6,
    /** Panic after a big blast (weapon `panicRadius`): run away for 3–5 s (PLAN.md §7.11). */
    panicMin: 3,
    panicMax: 5,
    /** A broken soldier runs back toward where it came from for this long, then rallies. */
    routMin: 8,
    routMax: 12,
  },

  /** Enemy small-arms fire at Ridgeback (PLAN.md §7.8: no real bullets, damage to team health). */
  enemyFire: {
    /** Hit fraction at point-blank and at the shooter's maximum range (linear in between). */
    accuracyNear: 0.6,
    accuracyFar: 0.25,
    /** Each enemy stops to shoot at a random fraction of its range. */
    standoffMin: 0.6,
    standoffMax: 0.95,
    /** Seconds between visible bursts (tracers + muzzle flash) from one shooter. */
    burstMin: 0.6,
    burstMax: 1.8,
  },

  /** The Ridgeback recon team (PLAN.md §7.9). */
  ridgeback: {
    /** Shared team health, its regeneration, and the quiet time before it regenerates (§9). */
    health: 100,
    regenPerSecond: 1,
    quietTime: 4,
    /** Squad walking speed along its route, and how long it holds at each waypoint. */
    speed: 2.2,
    holdTime: 18,
    /** Distance between members in the diamond formation. */
    spacing: 5,
    /** Friendlies shoot the nearest enemy within this range while holding, every few seconds. */
    fireRange: 190,
    fireIntervalMin: 1.5,
    fireIntervalMax: 3.5,
    hitChance: 0.3,
    /** IR strobe: blink rate, fraction of each blink that is lit, sprite size (m). */
    strobeHz: 2,
    strobeDuty: 0.3,
    strobeSize: 3,
    /**
     * Strobe heat in thermal. Real IR strobes only show in NV (glow); they're kept faintly
     * visible in thermal too because they're the player's main friend-or-foe cue (§7.9).
     * Set to 0 for NV-only strobes.
     */
    strobeThermalHeat: 0.5,
    /** The orbit re-centers on the team once it walks this far from the orbit center. */
    followDistance: 70,
  },

  /** Enemy vehicles (PLAN.md §7.10; per-type stats live in `units/vehicleDefs.ts`). */
  vehicles: {
    /** PLAN.md §11: at most 12 live vehicles + wrecks; old wrecks and empty trucks recycle. */
    maxVehicles: 12,
    /** Driving: speeding up and braking (m/s²), turning (rad/s), slowing within this of corners. */
    accel: 2.5,
    brake: 7,
    turnRate: 1.2,
    cornerSlowRadius: 18,
    /** A vehicle or wreck this close ahead (and within `blockWidth` sideways) blocks the road. */
    blockDistance: 13,
    blockWidth: 3.5,
    /** Seconds stuck behind something before unloading / opening fire right there. */
    blockedWait: 2,
    /** One soldier climbs out of a truck every this many seconds. */
    unloadInterval: 0.6,
    /** Chance that each soldier still inside a destroyed vehicle bails out (and runs). */
    bailChance: 0.5,
    /** Mounted guns pick a target this often, and show a burst every 0.4–1.0 s. */
    thinkInterval: 0.5,
    burstMin: 0.4,
    burstMax: 1.0,
    /** Wrecks younger than this (s) are never recycled for new vehicles. */
    wreckMinAge: 60,
  },

  /** Air support (PLAN.md §7.19; strike stats live in `gunship/airSupportDefs.ts`). */
  airSupport: {
    /** One wheel notch turns the gun-run direction by this much (15°). */
    axisStepRad: Math.PI / 12,
    /** The jet drawn as a long hot streak: length (m) and sprite size. */
    jetStreakLength: 40,
    jetStreakSize: 3.5,
  },

  /** Enemy and friendly tracers on the ground (short, purely visual). */
  groundFire: {
    tracerSpeed: 380,
    tracerLength: 5,
    tracerSize: 0.55,
    /** Mounted guns (technicals, APCs) fire bigger, longer tracers. */
    heavyTracerLength: 9,
    heavyTracerSize: 1.1,
    /** At most this many ground tracers in flight (pooled). */
    maxTracers: 160,
  },

  /** TEMPORARY M4 test scene (M7's mission script replaces it): waves attacking a moving team. */
  testScene: {
    /** Most enemies alive at once (M4 "done when": 60 enemies attacking a moving team). */
    maxEnemies: 60,
    /** Groups spawned at the start, then one more every `waveInterval` seconds. */
    initialGroups: 3,
    waveInterval: 10,
    groupMin: 6,
    groupMax: 10,
    /** Groups appear this far from the team, scattered within `groupRadius`. */
    spawnMin: 260,
    spawnMax: 360,
    groupRadius: 14,
    /** PLAN.md §9: one in six enemies is a machine gunner. */
    machineGunnerChance: 1 / 6,
    /** Convoys: the first one after this many seconds, then one every `convoyInterval`. */
    convoyFirst: 20,
    convoyInterval: 45,
    /** Spacing between vehicles in a convoy (m), and the chance of a technical / an APC joining the truck. */
    convoyGap: 22,
    technicalChance: 0.6,
    apcChance: 0.3,
  },

  hud: {
    /** How long "DANGER CLOSE" stays up after a close impact (seconds). */
    dangerCloseSeconds: 2.5,
  },

  fx: {
    /** Constant wind for the mission: smoke drifts with it (m/s). */
    wind: [1.6, 0, -0.9] as readonly [number, number, number],
    /** Particle pool sizes (PLAN.md §11 budget: ≤ 4,000 points). */
    hotParticles: 2600,
    smokeParticles: 900,
    /** Ground craters kept at once; the oldest is recycled (PLAN.md §11: ≤ 60). */
    maxCraters: 60,
    craterAlbedo: 0.06,
    shockwaveDuration: 0.45,
    /** Shockwave ring grows to blastRadius × this. */
    shockwaveScale: 1.6,
    /** Camera shake fades to zero this many blast radii away from the aim point. */
    shakeReach: 6,
    /** Whiteout scales with how much of the view the blast fills (× this). */
    whiteoutReach: 6,
  },
} as const;

export type OrbitConfig = { readonly [K in keyof typeof CONFIG.orbit]: number };
export type SensorConfig = { readonly [K in keyof typeof CONFIG.sensor]: number };
export type TerrainConfig = { readonly [K in keyof typeof CONFIG.terrain]: number };
export type SensorFxConfig = { readonly [K in keyof typeof CONFIG.sensorFx]: number };
