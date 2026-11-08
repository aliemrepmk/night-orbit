import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
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
import { DebugOverlay } from '../debug/DebugOverlay';
import { formatPlacement, mapOverlay, nextTourStop } from '../debug/mapOverlay';
import { WaveSpawner } from '../units/spawning';
import { HelicopterRenderer } from '../units/HelicopterRenderer';
import { CHEAT_KEYS, nextTimeScale, phaseFromUrl } from '../debug/cheats';
import { MissionHost } from '../mission/MissionHost';
import { MISSION } from '../mission/missionDef';
import { largestFootprint, type Footprint } from '../mission/clinic';
import { toPathPoints } from '../world/mapTypes';
import { UnitManager } from '../units/UnitManager';
import { VehicleManager } from '../units/VehicleManager';
import { VehicleRenderer } from '../units/VehicleRenderer';
import { Collision } from '../world/Collision';
import { StreamCrossings } from '../world/crossings';
import { MAP } from '../world/MapData';
import type { ZoneId } from '../world/mapTypes';
import { Terrain } from '../world/Terrain';
import { mapHeightField } from '../world/terrainShape';
import { WorldBuilder } from '../world/WorldBuilder';
import { EventBus } from './EventBus';
import type { FailReason, GameEvents } from './events';
import { FixedStepper } from './FixedStepper';
import { Input } from './Input';
import { createRng } from './rng';

export type GameState = 'title' | 'playing' | 'paused' | 'failed' | 'complete';

/** Owns every system and runs them in a fixed order (see PLAN.md §6). */
export class Game {
  state: GameState = 'title';

  private readonly renderer: Renderer;
  // The handcrafted map (PLAN.md §7.12): terrain shaped by MapData, then everything on it.
  private readonly terrain = new Terrain(CONFIG.terrain, mapHeightField(MAP));
  // Ray hits can't be higher than the highest ground (+ margin); buildings are boxes on top.
  private readonly collision = new Collision(this.terrain, this.terrain.maxHeight + 2);
  private readonly world: WorldBuilder;
  /** Map-authoring overlay (F2) and placer (P): dev builds or `?debug=1` only. */
  private readonly overlay: DebugOverlay | null = null;
  /** Zone the F3 look-test tour has parked the orbit over (null = following Ridgeback). */
  private tourStop: ZoneId | null = null;
  private readonly bus = new EventBus<GameEvents>();
  private readonly weapons = new Weapons();
  private readonly projectiles = new Projectiles();
  private readonly effects: Effects;
  private readonly explosions: Explosions;
  private readonly units: UnitManager;
  private readonly spawner = new WaveSpawner(createRng(5050));
  /** The mission script and its radio (M7). */
  private readonly host: MissionHost;
  private readonly heliView = new HelicopterRenderer();
  /** Dev cheats (PLAN.md §7.18): time scale and god mode. */
  private timeScale = 1;
  /** Pixels the sensor has been slewed (calibration prompt). */
  private slewed = 0;
  /** Orbit focus the mission asked for last (null: following Ridgeback). */
  private focus: ZoneId | null = null;
  private readonly vehicles: VehicleManager;
  private readonly infantryView = new InfantryRenderer();
  private readonly vehicleView = new VehicleRenderer();
  private readonly audio = new AudioEngine();
  private readonly spreadRng = createRng(31337);
  private readonly air = new AirSupport(createRng(8080));
  /** Trigger state gathered per frame, consumed by the next fixed step. */
  private fireHeld = false;
  private fireClicks = 0;
  private readonly gunship = new Gunship();
  private readonly sensor: Sensor;
  private readonly sensorFx = new SensorFX();
  private sensorMode: SensorMode = 'white';
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly stepper = new FixedStepper(CONFIG.loop.step, CONFIG.loop.maxFrame);

  private viewportHeight = window.innerHeight;
  private missionClock = 0;
  private lastFrame = performance.now();
  private debug = new URLSearchParams(location.search).has('debug');
  private fps = 60;
  /** Kills by the player's guns so far (F1 stats and the mission-complete screen). */
  private kills = 0;
  /** Seconds the "DANGER CLOSE" warning stays on screen. */
  private dangerCloseLeft = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    private readonly screen: HTMLElement,
  ) {
    const ground = (x: number, z: number) => this.terrain.heightAt(x, z);
    // The world first: its houses are what soldiers take cover behind and can't see through.
    this.world = new WorldBuilder(MAP, this.terrain, this.collision);
    // Soldiers walk on the surface (over the bridge deck, not through the stream bed).
    const surface = (x: number, z: number) => this.world.surfaceAt(x, z);
    const crossings = new StreamCrossings(MAP.stream, MAP.bridges);
    // Ridgeback starts at the OP and walks only when the mission says so (`moveTeam`).
    const startRoute = toPathPoints(MAP.friendlyRoutes[MAP.routeOrder[0]]);
    this.units = new UnitManager(surface, this.bus, createRng(4040), startRoute, {
      loopRoute: false,
      // Houses and hills block sight and walking; the stream can only be crossed on the bridge.
      world: {
        lineOfSight: (a, b) => this.collision.lineOfSight(a, b),
        pushOut: (x, z, r, out) => this.collision.pushOut(x, z, r, out),
        detour: (fx, fz, tx, tz, out) => crossings.detour(fx, fz, tx, tz, out),
      },
      cover: this.world.cover,
    });
    this.units.squad.halt();
    this.vehicles = new VehicleManager(
      this.units,
      ground,
      this.bus,
      createRng(6060),
      CONFIG.vehicles,
      CONFIG.spawning.machineGunnerChance,
    );
    const footprints: Footprint[] = this.world.protectedBoxes.map((i) => {
      const b = this.collision.boxes[i];
      return {
        center: { x: b.center.x, z: b.center.z },
        half: { x: b.half.x, z: b.half.z },
        rotY: b.rotY,
      };
    });
    this.host = new MissionHost(MISSION, {
      map: MAP,
      bus: this.bus,
      units: this.units,
      vehicles: this.vehicles,
      spawner: this.spawner,
      groundAt: ground,
      protectedFootprints: footprints,
      rng: createRng(9090),
    });
    this.gunship.snapTo(this.units.teamPosition.x, this.units.teamPosition.z);
    this.sensor = new Sensor(this.gunship, this.terrain, window.innerWidth / window.innerHeight);

    this.renderer = new Renderer(canvas, this.sensor.camera);
    this.renderer.scene.add(this.world.root);
    this.renderer.scene.add(this.infantryView.root, this.vehicleView.mesh, this.heliView.mesh);

    this.effects = new Effects(ground, createRng(77));
    this.renderer.scene.add(this.effects.root);
    this.units.onMuzzleFlash = (p) => this.effects.muzzleFlash(p);
    this.explosions = new Explosions(this.effects, this.sensor, this.sensorFx, this.bus, (c, r) =>
      this.units.targetsNear(c, r),
    );

    this.bus.on('unitKilled', (e) => {
      if (e.by !== 'team') this.kills++;
    });
    this.bus.on('dangerClose', () => (this.dangerCloseLeft = CONFIG.hud.dangerCloseSeconds));
    this.bus.on('missionFailed', (e) => this.fail(e.reason));
    // Placeholder sounds react to events; nobody else needs to know about audio.
    this.bus.on('shotFired', (e) => this.audio.play(`fire${e.weapon}`));
    this.bus.on('impact', (e) =>
      this.audio.play(`impact${e.weapon}`, impactVolume(e.distanceToAim)),
    );
    this.bus.on('strikeCalled', () => this.sensorFx.triggerSwitch()); // a radio-call blip

    this.hud = new HUD(hudRoot);
    if (import.meta.env.DEV || this.debug) {
      this.overlay = new DebugOverlay(hudRoot, mapOverlay(MAP, this.world.cover.points), ground);
    }
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => {
      if (this.state !== 'failed' && this.state !== 'complete')
        this.setState(locked ? 'playing' : 'paused');
    };

    screen.addEventListener('click', () => {
      // Retry = reload for now (M8 adds a proper restart that resets every system).
      if (this.state === 'failed' || this.state === 'complete') {
        location.reload();
        return;
      }
      this.audio.unlock(); // browsers allow audio only after a user gesture
      this.input.requestLock();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setState('title');
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
    if (this.host.mission.phaseIndex > 0) this.lookAtTeam();
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

    if (this.state === 'playing') this.handleInput();

    const steps = this.stepper.advance(elapsed * this.timeScale);
    for (let i = 0; i < steps; i++) this.update(CONFIG.loop.step);

    this.sensor.syncCamera();
    this.syncEffects();
    this.renderer.render(this.thermalFrame(now / 1000));
    this.updateHud();
    this.overlay?.render(this.sensor.camera, window.innerWidth, window.innerHeight);
    this.input.endFrame();
  }

  /** One fixed simulation step (PLAN.md §6 update order). */
  private update(dt: number): void {
    if (this.state === 'paused') return;
    // After a failure the world keeps drifting behind the fail screen, but nobody fights.
    const playing = this.state === 'playing';
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
      this.air.update(dt, (x, z, o) =>
        this.explosions.detonate(new Vector3(x, this.terrain.heightAt(x, z), z), o, true),
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
    const { dx, dy } = this.input.consumeMouse();
    this.sensor.slew(dx, dy, this.viewportHeight);
    // Calibration prompts (mission phase 0) complete when the player does each thing.
    this.slewed += Math.abs(dx) + Math.abs(dy);
    if (this.slewed > CONFIG.hud.calibrationSlewPx) this.host.playerDid('slewed');

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
    if (this.air.mode !== null) {
      this.fireHeld = false;
      if (wheel !== 0) this.air.rotateAxis(Math.sign(wheel) * CONFIG.airSupport.axisStepRad);
      if (clicks > 0) {
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
    } else {
      this.fireHeld = this.input.isFireHeld;
      this.fireClicks += clicks;
      if (wheel !== 0) this.sensor.cycleWeapon(wheel > 0 ? 1 : -1);
    }

    if (this.input.wasPressed('Digit1')) this.sensor.selectWeapon('25');
    if (this.input.wasPressed('Digit2')) this.sensor.selectWeapon('40');
    if (this.input.wasPressed('Digit3')) this.sensor.selectWeapon('105');
    if (this.input.wasPressed('KeyQ')) this.sensor.cycleWeapon(1);
    if (this.sensor.weapon !== weaponBefore) {
      this.host.playerDid(`weapon${this.sensor.weapon}`);
      this.sensorFx.triggerSwitch();
      this.air.mode = null; // picking a gun takes the trigger back from air support
    }

    // F cycles WHT HOT → BLK HOT → NV; switching sensors flashes static like an optic switch.
    if (this.input.wasPressed('KeyF')) {
      this.sensorMode = nextSensorMode(this.sensorMode);
      this.sensorFx.triggerSwitch();
      this.host.playerDid('sensor');
    }
    if (this.input.wasPressed('F1')) this.debug = !this.debug;
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
    if (this.input.dragMode && this.input.wasPressed('Escape')) this.setState('paused');
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

  /** Mission complete: Ridgeback is out. Freeze the fight and show the result. */
  private complete(): void {
    if (this.state === 'complete' || this.state === 'failed') return;
    const stats = this.screen.querySelector<HTMLElement>('[data-complete-stats]');
    if (stats) {
      const t = Math.floor(this.missionClock);
      const time = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      stats.textContent = `KILLS ${this.kills}  ·  TIME ${time}  ·  RIDGEBACK ${Math.ceil(this.units.team.value)}%`;
    }
    this.setState('complete');
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
      subtitle: this.host.radio.current
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
            kills: this.kills,
            enemies: this.units.aliveEnemies,
            vehicles: this.vehicles.alive,
            mission: this.host.mission.debugLine,
            cheats: `${this.units.team.invulnerable ? 'GOD ' : ''}${this.timeScale !== 1 ? `x${this.timeScale}` : ''}`,
          }
        : null,
    });
  }

  private readonly projected = new Vector3();

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
    if (a.mode !== null && this.state === 'playing') {
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

  /** Mission failed (friendly fire or team overrun): freeze the fight and show why. */
  private fail(reason: FailReason): void {
    if (this.state === 'failed') return;
    const reasonEl = this.screen.querySelector<HTMLElement>('[data-fail-reason]');
    if (reasonEl) reasonEl.textContent = failReasonText(reason);
    this.setState('failed');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private setState(state: GameState): void {
    // Losing pointer lock on the title screen should not show "paused".
    if (state === 'paused' && this.state === 'title') return;
    this.state = state;
    this.hud.show(state !== 'title');
    this.screen.classList.toggle('hidden', state === 'playing');
    this.screen.dataset.state = state;
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
