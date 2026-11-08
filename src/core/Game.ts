import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { engineTune } from '../audio/engineDrone';
import { impactVolume } from '../audio/sounds';
import { Explosions } from '../combat/Explosions';
import { CONFIG } from '../config';
import { Effects } from '../fx/Effects';
import { AirSupport, footprint, footprintDistance } from '../gunship/AirSupport';
import { STRIKE_ORDER, STRIKES } from '../gunship/airSupportDefs';
import { flightTime, muzzlePosition, offsetAcrossView, sampleDisc } from '../gunship/ballistics';
import { Gunship } from '../gunship/Gunship';
import { Projectiles } from '../gunship/Projectiles';
import { Sensor } from '../gunship/Sensor';
import { Weapons } from '../gunship/Weapons';
import { TriggerGate } from '../gunship/triggerGate';
import { Renderer } from '../render/Renderer';
import { SensorFX } from '../render/SensorFX';
import {
  grainForFov,
  nextSensorMode,
  sensorModeLabel,
  type SensorMode,
} from '../render/thermalMath';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '../gunship/weaponDefs';
import { HUD } from '../ui/HUD';
import {
  failReasonText,
  kestrelLine,
  objectiveLine,
  subtitleLine,
  timerLine,
  type GunReadout,
} from '../ui/hudFormat';
import { InfantryRenderer } from '../units/InfantryRenderer';
import { createBattle, createWorld, type StaticWorld } from '../mission/battle';
import { rateMission, summaryRows, type MissionStats } from '../mission/stats';
import { edgeArrow } from '../ui/edgeArrow';
import type { FriendlyArrow } from '../ui/HUD';
import { ScreenFlow, type ScreenAction } from '../ui/screenFlow';
import { Screens, type ScreenButton } from '../ui/Screens';
import { browserStorage, loadSettings, saveSettings, type Settings } from '../ui/settings';
import { DebugOverlay } from '../debug/DebugOverlay';
import { formatPlacement, mapOverlay, nextTourStop } from '../debug/mapOverlay';
import { HelicopterRenderer } from '../units/HelicopterRenderer';
import { CHEAT_KEYS, nextTimeScale, phaseFromUrl } from '../debug/cheats';
import { MISSION } from '../mission/missionDef';
import { largestFootprint } from '../mission/clinic';
import type { MissionHost } from '../mission/MissionHost';
import type { UnitManager } from '../units/UnitManager';
import type { VehicleManager } from '../units/VehicleManager';
import type { EventBus } from './EventBus';
import { VehicleRenderer } from '../units/VehicleRenderer';
import { MAP } from '../world/MapData';
import type { ZoneId } from '../world/mapTypes';
import type { FailReason, GameEvents } from './events';
import { FixedStepper } from './FixedStepper';
import { Input } from './Input';
import { createRng } from './rng';

/**
 * Owns every system and runs them in a fixed order (see PLAN.md §6).
 *
 * Two lifetimes: the static world, renderer, screens and input live for the whole page; a
 * "run" (event bus, soldiers, vehicles, mission script, guns, stats) is rebuilt by `newRun()`
 * on every restart (M8), so a retry starts exactly like the first attempt.
 */
export class Game {
  /** The screen state machine (M8): title → briefing → playing ⇄ paused → failed | complete. */
  readonly flow = new ScreenFlow();

  private readonly renderer: Renderer;
  // The handcrafted map (PLAN.md §7.12): terrain, houses, collision, cover. Built once.
  private readonly w: StaticWorld = createWorld();
  private readonly terrain = this.w.terrain;
  private readonly collision = this.w.collision;
  private readonly world = this.w.world;
  /** Map-authoring overlay (F2) and placer (P): dev builds or `?debug=1` only. */
  private readonly overlay: DebugOverlay | null = null;
  private readonly effects: Effects;
  private readonly heliView = new HelicopterRenderer();
  private readonly infantryView = new InfantryRenderer();
  private readonly vehicleView = new VehicleRenderer();
  private readonly audio = new AudioEngine();
  private readonly gunship = new Gunship();
  private readonly sensor: Sensor;
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly screens: Screens;
  private readonly stepper = new FixedStepper(CONFIG.loop.step, CONFIG.loop.maxFrame);
  private settings: Settings = loadSettings(browserStorage);

  // ---- One run of the mission (rebuilt by `newRun`). ----
  private bus!: EventBus<GameEvents>;
  private units!: UnitManager;
  private vehicles!: VehicleManager;
  /** The mission script and its radio (M7). */
  private host!: MissionHost;
  private stats!: MissionStats;
  private weapons!: Weapons;
  private projectiles!: Projectiles;
  private explosions!: Explosions;
  private air!: AirSupport;
  private spreadRng!: ReturnType<typeof createRng>;
  private sensorFx!: SensorFX;
  /** Zone the F3 look-test tour has parked the orbit over (null = following Ridgeback). */
  private tourStop: ZoneId | null = null;
  /** Orbit focus the mission asked for last (null: following Ridgeback). */
  private focus: ZoneId | null = null;
  /** Who the trigger belongs to: the guns or the strike being aimed. */
  private readonly trigger = new TriggerGate();
  /** Trigger state gathered per frame, consumed by the next fixed step. */
  private fireHeld = false;
  private fireClicks = 0;
  private sensorMode: SensorMode = 'white';
  private missionClock = 0;
  /** Seconds the "DANGER CLOSE" warning stays on screen. */
  private dangerCloseLeft = 0;

  /** Dev cheats (PLAN.md §7.18): time scale (kept across restarts). */
  private timeScale = 1;
  /** The controls overlay (`H`). */
  private help = false;
  /** True once the first run has been deployed (the HUD stays hidden behind title/briefing). */
  private deployed = false;
  private viewportHeight = window.innerHeight;
  private lastFrame = performance.now();
  private debug = new URLSearchParams(location.search).has('debug');
  private fps = 60;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    screenRoot: HTMLElement,
  ) {
    const ground = (x: number, z: number) => this.terrain.heightAt(x, z);
    this.sensor = new Sensor(this.gunship, this.terrain, window.innerWidth / window.innerHeight);

    this.renderer = new Renderer(canvas, this.sensor.camera);
    this.renderer.scene.add(this.world.root);
    this.renderer.scene.add(this.infantryView.root, this.vehicleView.mesh, this.heliView.mesh);
    this.effects = new Effects(ground, createRng(77));
    this.renderer.scene.add(this.effects.root);

    this.hud = new HUD(hudRoot);
    if (import.meta.env.DEV || this.debug) {
      this.overlay = new DebugOverlay(hudRoot, mapOverlay(MAP, this.world.cover.points), ground);
    }
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.go(locked ? 'lockGained' : 'lockLost');
    this.input.onLockRefused = () =>
      this.screens.setLockHint('The browser needs a moment after Esc: click RESUME again.');

    this.screens = new Screens(screenRoot, MAP, this.settings);
    this.screens.onButton = (b) => this.button(b);
    this.screens.onSettings = (s) => this.applySettings(s, true);
    this.applySettings(this.settings, false);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.newRun();
    this.go('lockLost'); // shows the title screen
  }

  /**
   * Starts a fresh run on the same world: new bus, soldiers, vehicles, mission, guns and stats
   * (seeded the same way every time), effects cleared, and the orbit back over the OP.
   */
  private newRun(): void {
    this.effects.clear();
    const b = createBattle(this.w);
    this.bus = b.bus;
    this.units = b.units;
    this.vehicles = b.vehicles;
    this.host = b.host;
    this.stats = b.stats;
    this.weapons = new Weapons();
    this.projectiles = new Projectiles();
    this.air = new AirSupport(createRng(8080));
    this.spreadRng = createRng(31337);
    this.sensorFx = new SensorFX();
    this.explosions = new Explosions(this.effects, this.sensor, this.sensorFx, this.bus, (c, r) =>
      this.units.targetsNear(c, r),
    );
    this.units.onMuzzleFlash = (p) => this.effects.muzzleFlash(p);
    this.tourStop = null;
    this.focus = null;
    this.fireHeld = false;
    this.fireClicks = 0;
    this.trigger.reset();
    this.sensorMode = 'white';
    this.missionClock = 0;
    this.dangerCloseLeft = 0;
    this.help = false;

    this.bus.on('dangerClose', () => (this.dangerCloseLeft = CONFIG.hud.dangerCloseSeconds));
    this.bus.on('missionFailed', (e) => this.fail(e.reason));
    // Placeholder sounds react to events; nobody else needs to know about audio.
    this.bus.on('shotFired', (e) => this.audio.play(`fire${e.weapon}`));
    this.bus.on('impact', (e) =>
      this.audio.play(`impact${e.weapon}`, impactVolume(e.distanceToAim, e.weapon)),
    );
    this.bus.on('strikeCalled', () => this.sensorFx.triggerSwitch()); // a radio-call blip

    // `?phase=village` starts at a phase (dev builds or ?debug=1).
    const cheats = import.meta.env.DEV || this.debug;
    this.host.start(
      cheats
        ? phaseFromUrl(
            location.search,
            MISSION.phases.map((p) => p.id),
          )
        : undefined,
    );
    const t = this.units.teamPosition;
    this.gunship.reset(t.x, t.z);
    // Calibration starts looking away from Ridgeback: finding their strobes is the first task.
    const away = this.host.mission.phaseIndex === 0 ? CONFIG.mission.calibrationLookAway : [0, 0];
    this.sensor.reset(t.x + away[0], t.z + away[1]);
  }

  /** What a screen button does. */
  private button(b: ScreenButton): void {
    this.audio.unlock(); // browsers allow audio only after a user gesture
    switch (b) {
      case 'begin':
        this.go('begin');
        break;
      case 'deploy':
      case 'resume':
        this.screens.setLockHint('');
        this.input.requestLock(); // aiming starts play (`lockGained`)
        break;
      case 'restart':
      case 'retry':
      case 'again':
        this.newRun();
        this.go('restart');
        this.screens.setLockHint('');
        this.input.requestLock();
        break;
      case 'settings':
        this.go('openSettings');
        break;
      case 'back':
        this.go('closeSettings');
        break;
    }
  }

  private applySettings(s: Settings, save: boolean): void {
    this.settings = s;
    this.sensor.sensitivityScale = s.sensitivity;
    this.sensor.shakeScale = s.screenShake ? 1 : 0;
    this.audio.setVolume(s.volume);
    this.audio.setEngineVolume(s.engineVolume);
    if (save && !saveSettings(browserStorage, s)) {
      this.screens.setStorageHint(
        'This browser blocks saving: settings last until the page closes.',
      );
    }
  }

  start(): void {
    const frame = (now: number) => {
      this.frame(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(now: number): void {
    const elapsed = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (elapsed > 0) this.fps += (1 / elapsed - this.fps) * 0.05;

    if (this.flow.playing) this.handleInput();

    const steps = this.stepper.advance(elapsed * this.timeScale);
    for (let i = 0; i < steps; i++) this.update(CONFIG.loop.step);

    this.sensor.syncCamera();
    this.syncEffects();
    this.renderer.render(this.thermalFrame(now / 1000));
    this.updateHud();
    this.audio.tuneEngine(engineTune(this.gunship.angle, now / 1000));
    this.overlay?.render(this.sensor.camera, window.innerWidth, window.innerHeight);
    this.input.endFrame();
  }

  /** One fixed simulation step (PLAN.md §6 update order). */
  private update(dt: number): void {
    // Paused (or in settings from the pause menu): the world holds still.
    if (this.deployed && (this.flow.state === 'paused' || this.flow.state === 'settings')) return;
    // Behind the title and end screens the orbit keeps drifting, but nobody fights.
    const playing = this.flow.playing;
    this.gunship.update(dt);
    this.sensor.update(dt);

    // Weapons: clicks gathered this frame count once (on the first step); hold counts every step.
    const shots = this.weapons.update(
      dt,
      this.sensor.weapon,
      playing && this.fireHeld,
      playing ? this.fireClicks : 0,
    );
    this.fireClicks = 0;
    for (let i = 0; i < shots; i++) this.fire(this.sensor.weapon);

    this.projectiles.update(dt, (s) =>
      this.explosions.detonate(s.to, WEAPONS[s.weapon], s.hitKind === 'ground'),
    );
    // Air strikes land on the ground under their marked point (PLAN.md §7.19).
    if (playing) {
      this.air.update(
        dt,
        (x, z, o) =>
          this.explosions.detonate(new Vector3(x, this.terrain.heightAt(x, z), z), o, true),
        // A falling bomb whistles down (heard wherever it lands, like the blast itself).
        (x, z, seconds) =>
          this.audio.playWhistle(
            seconds / this.timeScale,
            impactVolume(Math.hypot(x - this.sensor.aim.x, z - this.sensor.aim.z), 'bomb'),
          ),
      );
    }
    if (playing) {
      this.host.update(dt, this.sensor.aim);
      this.units.update(dt);
      this.vehicles.update(dt);
      this.followTeam();
      if (this.host.mission.status === 'complete') this.complete();
    }
    this.vehicleView.emitEffects(this.vehicles.vehicles, this.effects, dt);
    if (this.host.helicopter.state === 'destroyed')
      this.effects.fire(this.host.helicopter.position, dt);
    this.effects.update(dt);
    this.sensorFx.update(dt);
    this.dangerCloseLeft = Math.max(0, this.dangerCloseLeft - dt);
    if (playing) this.missionClock += dt;
  }

  /**
   * The orbit re-centers on Ridgeback once the team has walked away from the orbit center, or
   * glides over the zone the mission script asks for (`setOrbitFocus`).
   */
  private followTeam(): void {
    if (this.tourStop) return; // the F3 tour holds the orbit over a zone
    if (this.host.focus !== this.focus) {
      this.focus = this.host.focus;
      if (this.focus) {
        const [x, z] = MAP.zones[this.focus].center;
        this.gunship.setFocus(x, z);
      }
    }
    if (this.focus) return;
    const team = this.units.teamPosition;
    const c = this.gunship.targetCenter;
    if (Math.hypot(team.x - c.x, team.z - c.z) > CONFIG.ridgeback.followDistance) {
      this.gunship.setFocus(team.x, team.z);
    }
  }

  // Scratch vectors (no per-shot allocations in the hot path).
  private readonly dir = new Vector3();
  private readonly spreadPoint = new Vector3();
  private readonly muzzle = new Vector3();

  /**
   * Fires one shell (PLAN.md §7.6): raycast the sensor's line of sight (roofs before ground),
   * scatter within the weapon's spread across the view, then fly for distance / speed seconds.
   */
  private fire(id: WeaponId): void {
    const w = WEAPONS[id];
    const eye = this.gunship.position;
    this.dir.subVectors(this.sensor.aim, eye).normalize();
    const aimed = this.collision.raycast(eye, this.dir);
    const aimPoint = aimed ? aimed.point : this.sensor.aim;

    const [dx, dy] = sampleDisc(this.spreadRng, w.spread);
    offsetAcrossView(eye, aimPoint, dx, dy, this.spreadPoint);
    this.dir.subVectors(this.spreadPoint, eye).normalize();
    const hit = this.collision.raycast(eye, this.dir) ?? aimed;
    if (!hit) return;

    const g = CONFIG.gunnery;
    muzzlePosition(eye, this.gunship.center, g.muzzleDrop, g.muzzleSide, this.muzzle);
    const duration = flightTime(this.muzzle.distanceTo(hit.point), w.shellSpeed);
    this.projectiles.fire(id, this.muzzle, hit.point, duration, hit.kind, hit.box);

    if (id === '105') this.sensor.addShake(CONFIG.sensor.recoilDeg); // the whole aircraft kicks
    this.bus.emit('shotFired', { weapon: id });
  }

  private readonly tracerHead = new Vector3();
  private readonly tracerDir = new Vector3();

  /** Per frame: soldiers, strobes and particle/tracer sprite buffers for the current view. */
  private syncEffects(): void {
    const heightPx = this.viewportHeight * this.renderer.webgl.getPixelRatio();
    this.infantryView.sync(this.units, heightPx, this.sensor.fovDeg);
    this.vehicleView.sync(this.vehicles.vehicles);
    this.heliView.sync(this.host.helicopter);
    const g = CONFIG.groundFire;
    this.effects.sync(heightPx, this.sensor.fovDeg, this.gunship.position, (emit) => {
      this.projectiles.forEachActive((s) => {
        if (!WEAPONS[s.weapon].tracer) return;
        this.projectiles.positionOf(s, this.tracerHead);
        this.tracerDir.subVectors(s.to, s.from).normalize();
        emit(this.tracerHead, this.tracerDir);
      });
      // Air-support jets: a long hot streak crossing the feed.
      for (const j of this.air.jets) {
        if (!this.air.jetPosition(j, this.terrain.heightAt(j.x, j.z), this.tracerHead)) continue;
        this.tracerDir.set(Math.sin(j.heading), 0, Math.cos(j.heading));
        emit(
          this.tracerHead,
          this.tracerDir,
          CONFIG.airSupport.jetStreakLength,
          CONFIG.airSupport.jetStreakSize,
        );
      }
      // Small-arms tracers between the soldiers on the ground.
      for (const tr of this.units.tracers) {
        if (!tr.active || tr.age < 0) continue;
        this.tracerHead.lerpVectors(tr.from, tr.to, tr.age / tr.duration);
        this.tracerDir.subVectors(tr.to, tr.from).normalize();
        if (tr.heavy) emit(this.tracerHead, this.tracerDir, g.heavyTracerLength, g.heavyTracerSize);
        else emit(this.tracerHead, this.tracerDir, g.tracerLength, g.tracerSize);
      }
    });
  }

  private handleInput(): void {
    const { dx, dy: rawDy } = this.input.consumeMouse();
    const dy = this.settings.invertY ? -rawDy : rawDy;
    this.sensor.slew(dx, dy, this.viewportHeight);

    const clicks = this.input.consumeFireClicks();
    const wheel = this.input.consumeWheel();
    const weaponBefore = this.sensor.weapon;

    // T: aim a strike (gun run → bomb → back to the guns). While aiming, the trigger calls the
    // strike on the marked ground point and the wheel turns the gun run's direction.
    if (this.input.wasPressed('KeyT')) {
      const before = this.air.mode;
      if (this.air.cycleMode() === 'gunrun' && before === null) {
        // Start with the run heading away from the aircraft (up the screen).
        const g = this.gunship.position;
        this.air.axis = Math.atan2(this.sensor.aim.x - g.x, this.sensor.aim.z - g.z);
      }
    }
    // The trigger belongs to the strike while aiming, and stays off the guns until released
    // after a strike is called (M8+ Phase A).
    const trigger = this.trigger.frame(this.air.mode !== null, this.input.isFireHeld, clicks);
    this.fireHeld = trigger.gunHeld;
    this.fireClicks += trigger.gunClicks;
    if (this.air.mode !== null) {
      if (wheel !== 0) this.air.rotateAxis(Math.sign(wheel) * CONFIG.airSupport.axisStepRad);
      if (trigger.strikeClicks > 0) {
        const { x, z } = this.sensor.aim;
        const axis = this.air.axis;
        const def = this.air.call(x, z);
        if (def) {
          const danger = this.units.friendlies.some(
            (f) =>
              f.alive &&
              footprintDistance(def, x, z, axis, f.position.x, f.position.z) < def.dangerClose,
          );
          this.bus.emit('strikeCalled', { strike: def.id, x, z, danger });
        }
      }
    } else if (wheel !== 0) {
      this.sensor.cycleWeapon(wheel > 0 ? 1 : -1);
    }

    if (this.input.wasPressed('Digit1')) this.sensor.selectWeapon('25');
    if (this.input.wasPressed('Digit2')) this.sensor.selectWeapon('40');
    if (this.input.wasPressed('Digit3')) this.sensor.selectWeapon('105');
    if (this.input.wasPressed('KeyQ')) this.sensor.cycleWeapon(1);
    // Calibration: "select the 40 mm" completes while the 40 mm is selected (the prompt clears
    // the flag, and the previous prompt left a different gun selected, so a key press is needed).
    this.host.playerDid(`weapon${this.sensor.weapon}`);
    if (this.sensor.weapon !== weaponBefore) {
      this.sensorFx.triggerSwitch();
      if (this.air.mode !== null) {
        this.air.mode = null; // picking a gun takes the trigger back from air support…
        this.fireHeld = false; // …but not this frame's press: wait for a release
        this.fireClicks = 0;
        this.trigger.frame(true, this.input.isFireHeld, 0);
      }
    }

    // F cycles WHT HOT → BLK HOT → NV; switching sensors flashes static like an optic switch.
    if (this.input.wasPressed('KeyF')) {
      this.sensorMode = nextSensorMode(this.sensorMode);
      this.sensorFx.triggerSwitch();
      this.host.playerDid('sensor');
    }
    if (this.input.wasPressed('F1')) this.debug = !this.debug;
    if (this.input.wasPressed('KeyH')) this.help = !this.help;
    if (this.overlay) {
      this.handleCheats();
      if (this.input.wasPressed('F2')) this.overlay.toggle();
      // F3: tour the orbit over each zone (for look tests), then back to following the team.
      if (this.input.wasPressed('F3')) {
        this.tourStop = nextTourStop(this.tourStop);
        if (this.tourStop) {
          const [x, z] = MAP.zones[this.tourStop].center;
          this.gunship.snapTo(x, z); // jump: the gimbal limit would clamp a far aim point
          this.sensor.aim.set(x, this.terrain.heightAt(x, z), z);
        }
      }
      // Placer: log the crosshair's ground point, ready to paste into MapData.
      if (this.input.wasPressed('KeyP')) {
        const a = this.sensor.aim;
        const text = formatPlacement(a.x, a.z);
        console.info('[placer]', text);
        navigator.clipboard?.writeText(text).catch(() => {});
        this.overlay.markPlaced(a.x, a.y, a.z, text);
        if (!this.overlay.visible) this.overlay.toggle();
      }
    }
    // With pointer lock the browser handles Esc (and we get a lock-change event); in drag mode we must.
    if (this.input.dragMode && this.input.wasPressed('Escape')) this.go('lockLost');
  }

  /** Dev cheats (PLAN.md §7.18); `overlay` exists exactly when cheats are allowed. */
  private handleCheats(): void {
    for (const [key, cheat] of Object.entries(CHEAT_KEYS)) {
      if (!this.input.wasPressed(key)) continue;
      switch (cheat) {
        case 'god':
          this.units.team.invulnerable = !this.units.team.invulnerable;
          this.host.helicopter.invulnerable = this.units.team.invulnerable;
          break;
        case 'skipPhase':
          this.host.skipPhase();
          this.lookAtTeam();
          break;
        case 'killAll':
          this.units.killAllEnemies();
          this.vehicles.destroyAll();
          break;
        case 'slower':
          this.timeScale = nextTimeScale(this.timeScale, -1);
          break;
        case 'faster':
          this.timeScale = nextTimeScale(this.timeScale, 1);
          break;
      }
    }
  }

  /** Jumps the orbit and the sensor to Ridgeback (phase skips, `?phase=`). */
  private lookAtTeam(): void {
    const t = this.units.teamPosition;
    this.gunship.snapTo(t.x, t.z); // jump: the gimbal limit would clamp a far aim point
    this.sensor.aim.set(t.x, this.terrain.heightAt(t.x, t.z), t.z);
  }

  /** Mission complete: Ridgeback is out. Freeze the fight and show the stats and rating. */
  private complete(): void {
    if (this.flow.ended) return;
    const s = this.stats.summary(this.units.team.taken, this.missionClock);
    this.screens.setComplete(rateMission(s), summaryRows(s));
    this.go('complete');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private updateHud(): void {
    const s = this.sensor;
    this.hud.update({
      altitude: this.gunship.position.y,
      heading: this.gunship.headingDeg,
      range: s.slantRange,
      azimuth: s.relativeAzimuthDeg,
      depression: s.depressionDeg,
      aimX: s.aim.x,
      aimZ: s.aim.z,
      fov: s.fovDeg,
      weapon: s.weapon,
      guns: this.gunReadouts(),
      sensorMode: sensorModeLabel(this.sensorMode),
      clock: this.missionClock,
      arrows: this.friendlyArrows(),
      help: this.help && this.flow.playing,
      kestrel: this.host.helicopter.alive
        ? kestrelLine(
            this.host.helicopter.hp,
            this.host.helicopter.maxHp,
            this.host.helicopter.underFire,
          )
        : '',
      team: this.units.team.value,
      teamMax: this.units.team.max,
      underFire: this.units.team.underFire,
      dangerClose: this.dangerCloseLeft > 0,
      air: this.airReadout(),
      objective: objectiveLine(this.host.mission.objective),
      subtitle:
        this.settings.subtitles && this.host.radio.current
          ? subtitleLine(this.host.radio.current.speaker, this.host.radio.current.text)
          : '',
      timers: this.host.mission.timers
        .filter((t) => t.left > 0)
        .map((t) => timerLine(t.label, t.left)),
      clinicMark: this.host.clinicMarkLeft > 0 ? this.clinicOutline() : null,
      debug: this.debug
        ? {
            fps: this.fps,
            gpuMs: this.renderer.gpuMs,
            calls: this.renderer.drawCalls,
            triangles: this.renderer.triangles,
            kills: this.stats.kills,
            enemies: this.units.aliveEnemies,
            vehicles: this.vehicles.alive,
            mission: this.host.mission.debugLine,
            cheats: `${this.units.team.invulnerable ? 'GOD ' : ''}${this.timeScale !== 1 ? `x${this.timeScale}` : ''}`,
          }
        : null,
    });
  }

  private readonly projected = new Vector3();
  private readonly viewSpace = new Vector3();

  /** Edge arrows toward Ridgeback and Kestrel 6 while they are off-screen (M8). */
  private friendlyArrows(): FriendlyArrow[] {
    const out: FriendlyArrow[] = [];
    if (!this.flow.playing) return out;
    const add = (p: Vector3, name: string) => {
      const cam = this.sensor.camera;
      const behind = this.viewSpace.copy(p).applyMatrix4(cam.matrixWorldInverse).z > 0;
      this.projected.copy(p).project(cam);
      const a = edgeArrow(
        this.projected.x,
        this.projected.y,
        behind,
        window.innerWidth,
        window.innerHeight,
        CONFIG.hud.arrowMargin,
      );
      if (!a) return;
      const d = Math.hypot(p.x - this.sensor.aim.x, p.z - this.sensor.aim.z);
      out.push({ ...a, label: `${name} ${Math.round(d)} M` });
    };
    this.teamPoint.copy(this.units.teamPosition);
    this.teamPoint.y = this.terrain.heightAt(this.teamPoint.x, this.teamPoint.z) + 1;
    add(this.teamPoint, 'RIDGEBACK');
    if (this.host.helicopter.alive) add(this.host.helicopter.position, 'KESTREL 6');
    return out;
  }

  private readonly teamPoint = new Vector3();

  /** The protected clinic's outline in screen pixels (the "do not engage" marker). */
  private clinicOutline(): [number, number][] {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const out: [number, number][] = [];
    // The clinic itself (the biggest protected box), not its generator.
    const b = largestFootprint(this.world.protectedBoxes.map((i) => this.collision.boxes[i]))!;
    const c = Math.cos(b.rotY);
    const s = Math.sin(b.rotY);
    const pad = 3;
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const lx = sx * (b.half.x + pad);
      const lz = sz * (b.half.z + pad);
      // Local box frame → world (rotation about +y).
      const x = b.center.x + c * lx + s * lz;
      const z = b.center.z - s * lx + c * lz;
      this.projected.set(x, b.center.y + b.half.y, z).project(this.sensor.camera);
      out.push([((this.projected.x + 1) / 2) * w, ((1 - this.projected.y) / 2) * h]);
    }
    return out;
  }

  /** Strike lines, inbound callouts and the footprint preview (projected to screen pixels). */
  private airReadout() {
    const a = this.air;
    let preview: { points: [number, number][]; danger: boolean } | null = null;
    if (a.mode !== null && this.flow.playing) {
      const def = STRIKES[a.mode];
      const aim = this.sensor.aim;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const points: [number, number][] = [];
      for (const p of footprint(def, aim.x, aim.z, a.axis)) {
        this.projected
          .set(p.x, this.terrain.heightAt(p.x, p.z) + 0.5, p.z)
          .project(this.sensor.camera);
        points.push([((this.projected.x + 1) / 2) * w, ((1 - this.projected.y) / 2) * h]);
      }
      const danger = this.units.friendlies.some(
        (f) =>
          f.alive &&
          footprintDistance(def, aim.x, aim.z, a.axis, f.position.x, f.position.z) <
            def.dangerClose,
      );
      preview = { points, danger };
    }
    return {
      strikes: STRIKE_ORDER.map((id) => ({
        label: STRIKES[id].label,
        cooldownLeft: a.cooldownLeft(id),
        selected: a.mode === id,
      })),
      inbound: a.inbound().map((s) => ({ callsign: s.strike.callsign, eta: s.eta })),
      preview,
    };
  }

  private gunReadouts(): Record<WeaponId, GunReadout> {
    const out = {} as Record<WeaponId, GunReadout>;
    for (const id of WEAPON_ORDER) {
      const g = this.weapons.guns[id];
      out[id] = {
        label: g.def.label,
        fireMode: g.def.fireMode,
        status: g.status,
        rounds: g.rounds,
        capacity: g.def.capacity,
        heat: g.heat,
        reloadLeft: g.reloadLeft,
      };
    }
    return out;
  }

  /** Per-frame inputs to the sensor post-processing. `time` is real time (grain keeps moving when paused). */
  private thermalFrame(time: number) {
    const t = CONFIG.thermal;
    const nv = this.sensorMode === 'nv';
    const narrow = WEAPONS[WEAPON_ORDER[0]].fovDeg;
    const wide = WEAPONS[WEAPON_ORDER[WEAPON_ORDER.length - 1]].fovDeg;
    const grain = grainForFov(this.sensor.fovDeg, narrow, wide, t.grainNarrow, t.grainWide);
    return {
      time,
      mode: this.sensorMode,
      gamma: nv ? CONFIG.nightVision.gamma : t.gamma[this.sensor.weapon],
      grain: nv ? grain * CONFIG.nightVision.grainScale : grain,
      staticAmount: this.sensorFx.staticAmount,
      blurPx: this.sensorFx.blurPx,
      whiteout: this.sensorFx.whiteout,
    };
  }

  /** Mission failed (friendly fire, overrun, clinic, Kestrel 6): freeze the fight and show why. */
  private fail(reason: FailReason): void {
    if (this.flow.ended) return;
    const s = this.stats.summary(this.units.team.taken, this.missionClock);
    this.screens.setFailed(failReasonText(reason), summaryRows(s));
    this.go('fail');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Feeds the screen state machine and shows whatever screen it lands on. */
  private go(action: ScreenAction): void {
    const state = this.flow.dispatch(action);
    if (state === 'playing') this.deployed = true;
    // The HUD shows from the first deploy on (behind pause, settings and the end screens).
    this.hud.show(this.deployed && state !== 'title' && state !== 'briefing', state !== 'playing');
    this.screens.show(state);
    // The engine drone: silent on the title and briefing, full in the air, muffled behind menus.
    this.audio.setEngineMode(
      state === 'playing' ? 'on' : this.deployed && state !== 'title' ? 'muffled' : 'off',
    );
    this.input.consumeMouse(); // drop movement made while not aiming
    this.input.consumeFireClicks(); // the click that starts / resumes the game isn't a shot
    this.fireClicks = 0;
    this.fireHeld = false;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.viewportHeight = h;
    this.renderer.setSize(w, h);
    this.sensor.setAspect(w / h);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }
}
