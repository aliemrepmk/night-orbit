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
    crouchDrop: 0.75, // deep enough to kneel (the soldier figure, M8+ Phase C; was 0.45)
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
    /** Enemy fire on Kestrel 6: dps × accuracy × this = HP per second (≈10 soldiers down it in
     * ~8 s). Tuned in Chrome: at 12 an undefended LZ still let it escape (19% left). */
    vsAircraft: 18,
    /** Hit fraction at point-blank and at the shooter's maximum range (linear in between). */
    accuracyNear: 0.6,
    accuracyFar: 0.25,
    /** Each enemy stops to shoot at a random fraction of its range. */
    standoffMin: 0.6,
    standoffMax: 0.95,
    /**
     * Assaulters (M7 play test: "a lot more enemies on foot should get close to Ridgeback"):
     * this share of riflemen push in to 15–35% of their range (30–70 m), bounding from cover
     * to cover, and only take cover that close. Machine gunners always hang back.
     */
    assaultChance: 0.45,
    assaultStandoffMin: 0.15,
    assaultStandoffMax: 0.35,
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
    /**
     * Swerving around a wreck or a stopped vehicle (M7 play test): pass this far to the side of
     * it (m), never more than `swerveMax` off the centerline, sliding sideways at `swerveRate`
     * (m/s) and at most `swerveSpeed` (m/s) while alongside it.
     */
    swerveOffset: 5,
    swerveMax: 7,
    swerveRate: 2.5,
    swerveSpeed: 6,
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

  /** TEMPORARY test scene on the real map (M7's mission script replaces it): waves attacking a moving team. */
  spawning: {
    /** Most enemies alive at once (M4 "done when": 60 enemies attacking a moving team). */
    maxEnemies: 60,
    /** Groups spawned at the start, then one more every `waveInterval` seconds. */
    initialGroups: 3,
    waveInterval: 10,
    groupMin: 6,
    groupMax: 10,
    /** Groups appear this far from the team (at map paths / spawn points), scattered within `groupRadius`. */
    spawnMin: 180,
    spawnMax: 450,
    groupRadius: 18,
    /** Anti spawn-camping: members of a group appear one by one, never where the sensor is
     * looking, and a spawn point rests for `spawnCooldown` seconds after it is used. */
    trickleInterval: 0.7,
    avoidAimRadius: 160,
    spawnCooldown: 30,
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

  /** The mission script's host (PLAN.md §7.14, §8; M7). */
  mission: {
    /** Seconds the last enemies of a zone run for when a step times out (the safety valve). */
    routSeconds: 30,
    /** Spacing between the vehicles of a scripted convoy (m). */
    convoyGap: 22,
    /** Ridgeback stops this far beside the landed helicopter to climb in (m). */
    boardOffset: 6,
    /** The crosshair within this distance of the clinic counts as "on the clinic" (m). */
    clinicHoverRadius: 12,
    /** Calibration (M8+ fix): the crosshair within this distance of Ridgeback counts as "found them" (m). */
    locateRadius: 45,
    /** Calibration starts with the sensor looking this far from Ridgeback ([x, z] m), so you have to find them. */
    calibrationLookAway: [240, -170] as readonly [number, number],
    /** A calibration prompt repeats its hint every this many seconds until the player does it. */
    promptRemindSeconds: 18,
    /** "Off target": a 40/105 round that hits nobody with an enemy within this distance (m). */
    missNear: 40,
    /** Ridgeback calls for help once team health is below this fraction while under fire. */
    teamHurtFraction: 0.35,
    /** Kestrel 6 says it is badly hit below this fraction of its HP. */
    heloHurtFraction: 0.5,
  },

  /** Subtitled radio (PLAN.md §7.15). */
  radio: {
    /** A line stays on air for base + per-character seconds, at most `maxSeconds`. */
    baseSeconds: 1.6,
    secondsPerChar: 0.055,
    maxSeconds: 7,
    /** Silence between two lines. */
    gapSeconds: 0.35,
    /** Chatter / warnings waiting longer than this are dropped (stale). Warnings outlast the
     * longest story line, so a "check fire" is never lost behind a briefing. */
    chatterMaxWait: 2.5,
    warningMaxWait: 10,
  },

  /** Reactive radio chatter (PLAN.md §7.15); each pool's own cooldown is in `mission/lines.ts`. */
  chatter: {
    /** Kills within this window are one call; this many or more is a "multiple down" call. */
    multiKillWindow: 1.2,
    multiKillCount: 3,
    /** Seconds the crosshair rests on the clinic before the FCO warns. */
    clinicHoverSeconds: 0.6,
  },

  /** The protected clinic (PLAN.md §8 phase 2). */
  clinic: {
    /** An impact this close (or inside the weapon's full-damage radius) hits the clinic: mission failed. */
    hitMinRadius: 1.5,
    /** An impact whose blast reaches within this distance draws a "check fire" warning. */
    nearMissRadius: 15,
  },

  /** Kestrel 6, the extraction helicopter (PLAN.md §8 phase 4). */
  helicopter: {
    /** Hit points: one 105 mm or bomb kills it, a 40 mm direct hit takes half (armor in Damage.ts). */
    hp: 400,
    /** Below this height above the ground, enemy soldiers in range can hit it (m). */
    exposedHeight: 25,
    cruiseHeight: 70,
    speed: 45,
    /** Starts slowing and descending this far from the pad (m). */
    approachDistance: 140,
    /** Time constant of the final glide onto the pad (s). */
    landingTau: 2.2,
    /** Seconds on the ground with Ridgeback aboard before lift-off, and of the climb-out. */
    boardSeconds: 2,
    climbSeconds: 6,
    /** Seconds after lift-off until it is out of the picture. */
    departSeconds: 14,
  },

  hud: {
    /** How long "DANGER CLOSE" stays up after a close impact (seconds). */
    dangerCloseSeconds: 2.5,
    /** Off-screen friendly arrows (M8): distance from the screen edge (CSS px). */
    arrowMargin: 36,
  },

  /**
   * Mission rating (M8, PLAN.md §7.16): start at 100 and lose points for damage taken, danger-close
   * impacts and a slow finish; accuracy adds or removes up to `accuracyMax`.
   */
  rating: {
    /** Points lost per point of Ridgeback health taken from enemy fire, up to `damageMax`. */
    damagePerPoint: 0.15,
    damageMax: 40,
    perDangerClose: 4,
    dangerCloseMax: 20,
    /** Accuracy (impacts that hurt an enemy / gun impacts) at which the bonus is zero. */
    accuracyPar: 0.3,
    accuracyScale: 50,
    accuracyMax: 15,
    /** Seconds before the time penalty starts, points lost per minute after, and its cap. */
    parSeconds: 15 * 60,
    perMinuteOver: 2,
    timeMax: 10,
    /** Lowest score for each grade, best first; anything below the last is the final grade. */
    grades: [
      { grade: 'S', min: 95, label: 'FLAWLESS OVERWATCH' },
      { grade: 'A', min: 85, label: 'OUTSTANDING' },
      { grade: 'B', min: 70, label: 'SOLID WORK' },
      { grade: 'C', min: 55, label: 'THEY MADE IT' },
      { grade: 'D', min: 0, label: 'BARELY' },
    ],
  },

  /** Player settings (M8): defaults and ranges; saved in localStorage when it is available. */
  settings: {
    storageKey: 'night-orbit.settings.v1',
    sensitivity: { default: 1, min: 0.25, max: 3, step: 0.05 },
    volume: { default: 0.8, min: 0, max: 1, step: 0.05 },
    /** The engine drone's own level (M8+ Phase B), under the master volume. */
    engineVolume: { default: 0.7, min: 0, max: 1, step: 0.05 },
  },

  /**
   * The gunship's engine drone (M8+ Phase B): four turboprops, always on while flying.
   * Synthesized (no files): detuned saws per engine, a propeller beat, and airflow noise.
   */
  engineSound: {
    /** Fundamental of each engine (Hz) and their detune (cents), so they beat against each other. */
    baseHz: 54,
    detuneCents: [-9, -3, 4, 11] as readonly number[],
    /** Low-pass on the saws (Hz): a dull, through-the-airframe rumble. */
    cutoffHz: 420,
    /** The muffle filter over the whole drone while flying (Hz): wide open. */
    openCutoffHz: 6000,
    /** Propeller blade-pass throb: rate (Hz) and depth (0–1 of the level). */
    beatHz: 17,
    beatDepth: 0.35,
    /** A faint high gearbox whine, as a multiple of the base pitch, and its level. */
    whineHarmonic: 14,
    whineGain: 0.035,
    /** Airflow noise: band-pass center (Hz) and level. */
    airHz: 650,
    airGain: 0.22,
    /** Overall level before the player's volumes. */
    gain: 0.32,
    /** Pitch drifts by ± this fraction around the orbit (the props loading up in the turn), plus a slow wander. */
    pitchWobble: 0.012,
    wanderSeconds: 37,
    /** Stereo pan: the engines swing ± this as the aircraft circles (−1 = left, 1 = right). */
    pan: 0.18,
    /** Paused / end screens: the drone continues, muffled. Gain and low-pass cutoff (Hz). */
    muffledGain: 0.4,
    muffledCutoffHz: 160,
    /** Seconds to fade in (DEPLOY), to muffle, and to fade out (back to the title). */
    fadeSeconds: 2.5,
    muffleSeconds: 0.4,
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
