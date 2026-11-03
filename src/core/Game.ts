import { Vector3 } from 'three';
import { AudioEngine } from '../audio/AudioEngine';
import { impactVolume } from '../audio/sounds';
import { Explosions } from '../combat/Explosions';
import { CONFIG } from '../config';
import { Effects } from '../fx/Effects';
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
import type { GunReadout } from '../ui/hudFormat';
import { Collision } from '../world/Collision';
import { PlaceholderWorld } from '../world/PlaceholderWorld';
import { Terrain } from '../world/Terrain';
import { EventBus } from './EventBus';
import type { GameEvents } from './events';
import { FixedStepper } from './FixedStepper';
import { Input } from './Input';
import { createRng } from './rng';

export type GameState = 'title' | 'playing' | 'paused';

/** Owns every system and runs them in a fixed order (see PLAN.md §6). */
export class Game {
  state: GameState = 'title';

  private readonly renderer: Renderer;
  private readonly terrain = new Terrain();
  // Ray hits can't be higher than the tallest hill (+ margin); buildings are boxes on top.
  private readonly collision = new Collision(this.terrain, CONFIG.terrain.hillHeight + 2);
  private readonly world: PlaceholderWorld;
  private readonly bus = new EventBus<GameEvents>();
  private readonly weapons = new Weapons();
  private readonly projectiles = new Projectiles();
  private readonly effects: Effects;
  private readonly explosions: Explosions;
  private readonly audio = new AudioEngine();
  private readonly spreadRng = createRng(31337);
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
  /** Kills so far (F1 stats; M7's mission stats take over later). */
  private kills = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    private readonly screen: HTMLElement,
  ) {
    this.gunship.snapTo(0, 0);
    this.sensor = new Sensor(this.gunship, this.terrain, window.innerWidth / window.innerHeight);

    this.renderer = new Renderer(canvas, this.sensor.camera);
    this.world = new PlaceholderWorld(this.terrain, this.collision);
    this.renderer.scene.add(this.world.root);

    this.effects = new Effects((x, z) => this.terrain.heightAt(x, z), createRng(77));
    this.renderer.scene.add(this.effects.root);
    this.explosions = new Explosions(
      this.effects,
      this.sensor,
      this.sensorFx,
      this.bus,
      () => this.world.targets,
    );

    this.bus.on('unitKilled', () => this.kills++);
    // Placeholder sounds react to events; nobody else needs to know about audio.
    this.bus.on('shotFired', (e) => this.audio.play(`fire${e.weapon}`));
    this.bus.on('impact', (e) =>
      this.audio.play(`impact${e.weapon}`, impactVolume(e.distanceToAim)),
    );

    this.hud = new HUD(hudRoot);
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.setState(locked ? 'playing' : 'paused');

    screen.addEventListener('click', () => {
      this.audio.unlock(); // browsers allow audio only after a user gesture
      this.input.requestLock();
    });
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setState('title');
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

    const steps = this.stepper.advance(elapsed);
    for (let i = 0; i < steps; i++) this.update(CONFIG.loop.step);

    this.sensor.syncCamera();
    this.syncEffects();
    this.renderer.render(this.thermalFrame(now / 1000));
    this.updateHud();
    this.input.endFrame();
  }

  /** One fixed simulation step (PLAN.md §6 update order). */
  private update(dt: number): void {
    if (this.state === 'paused') return;
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
    this.world.update(dt, this.effects);
    this.effects.update(dt);
    this.sensorFx.update(dt);
    if (playing) this.missionClock += dt;
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

  /** Per frame: particle/tracer sprite buffers for the current view. */
  private syncEffects(): void {
    const heightPx = this.viewportHeight * this.renderer.webgl.getPixelRatio();
    this.effects.sync(heightPx, this.sensor.fovDeg, this.gunship.position, (emit) =>
      this.projectiles.forEachActive((s) => {
        if (!WEAPONS[s.weapon].tracer) return;
        this.projectiles.positionOf(s, this.tracerHead);
        this.tracerDir.subVectors(s.to, s.from).normalize();
        emit(this.tracerHead, this.tracerDir);
      }),
    );
  }

  private handleInput(): void {
    const { dx, dy } = this.input.consumeMouse();
    this.sensor.slew(dx, dy, this.viewportHeight);

    this.fireHeld = this.input.isFireHeld;
    this.fireClicks += this.input.consumeFireClicks();

    const weaponBefore = this.sensor.weapon;

    if (this.input.wasPressed('Digit1')) this.sensor.selectWeapon('25');
    if (this.input.wasPressed('Digit2')) this.sensor.selectWeapon('40');
    if (this.input.wasPressed('Digit3')) this.sensor.selectWeapon('105');
    if (this.input.wasPressed('KeyQ')) this.sensor.cycleWeapon(1);
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.sensor.cycleWeapon(wheel > 0 ? 1 : -1);
    if (this.sensor.weapon !== weaponBefore) this.sensorFx.triggerSwitch();

    // F cycles WHT HOT → BLK HOT → NV; switching sensors flashes static like an optic switch.
    if (this.input.wasPressed('KeyF')) {
      this.sensorMode = nextSensorMode(this.sensorMode);
      this.sensorFx.triggerSwitch();
    }
    if (this.input.wasPressed('F1')) this.debug = !this.debug;
    // With pointer lock the browser handles Esc (and we get a lock-change event); in drag mode we must.
    if (this.input.dragMode && this.input.wasPressed('Escape')) this.setState('paused');
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
      debug: this.debug
        ? {
            fps: this.fps,
            gpuMs: this.renderer.gpuMs,
            calls: this.renderer.drawCalls,
            triangles: this.renderer.triangles,
            kills: this.kills,
          }
        : null,
    });
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
