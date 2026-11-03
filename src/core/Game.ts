import { CONFIG } from '../config';
import { Gunship } from '../gunship/Gunship';
import { Sensor } from '../gunship/Sensor';
import { Renderer } from '../render/Renderer';
import { HUD } from '../ui/HUD';
import { PlaceholderWorld } from '../world/PlaceholderWorld';
import { Terrain } from '../world/Terrain';
import { FixedStepper } from './FixedStepper';
import { Input } from './Input';

export type GameState = 'title' | 'playing' | 'paused';

/** Owns every system and runs them in a fixed order (see PLAN.md §6). */
export class Game {
  state: GameState = 'title';

  private readonly renderer: Renderer;
  private readonly terrain = new Terrain();
  private readonly world: PlaceholderWorld;
  private readonly gunship = new Gunship();
  private readonly sensor: Sensor;
  private readonly input: Input;
  private readonly hud: HUD;
  private readonly stepper = new FixedStepper(CONFIG.loop.step, CONFIG.loop.maxFrame);

  private viewportHeight = window.innerHeight;
  private missionClock = 0;
  private lastFrame = performance.now();
  private debug = new URLSearchParams(location.search).has('debug');
  private fps = 60;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    hudRoot: HTMLElement,
    private readonly screen: HTMLElement,
  ) {
    this.renderer = new Renderer(canvas);
    this.world = new PlaceholderWorld(this.terrain);
    this.renderer.scene.add(this.world.root);

    this.gunship.snapTo(0, 0);
    this.sensor = new Sensor(this.gunship, this.terrain, window.innerWidth / window.innerHeight);

    this.hud = new HUD(hudRoot);
    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => this.setState(locked ? 'playing' : 'paused');

    screen.addEventListener('click', () => this.input.requestLock());
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
    this.renderer.render(this.sensor.camera);
    this.updateHud();
    this.input.endFrame();
  }

  /** One fixed simulation step. */
  private update(dt: number): void {
    if (this.state === 'paused') return;
    this.gunship.update(dt);
    this.sensor.update(dt);
    this.world.update(dt);
    if (this.state === 'playing') this.missionClock += dt;
  }

  private handleInput(): void {
    const { dx, dy } = this.input.consumeMouse();
    this.sensor.slew(dx, dy, this.viewportHeight);

    if (this.input.wasPressed('Digit1')) this.sensor.selectWeapon('25');
    if (this.input.wasPressed('Digit2')) this.sensor.selectWeapon('40');
    if (this.input.wasPressed('Digit3')) this.sensor.selectWeapon('105');
    if (this.input.wasPressed('KeyQ')) this.sensor.cycleWeapon(1);
    const wheel = this.input.consumeWheel();
    if (wheel !== 0) this.sensor.cycleWeapon(wheel > 0 ? 1 : -1);
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
      clock: this.missionClock,
      debug: this.debug
        ? { fps: this.fps, calls: this.renderer.drawCalls, triangles: this.renderer.triangles }
        : null,
    });
  }

  private setState(state: GameState): void {
    // Losing pointer lock on the title screen should not show "paused".
    if (state === 'paused' && this.state === 'title') return;
    this.state = state;
    this.hud.show(state !== 'title');
    this.screen.classList.toggle('hidden', state === 'playing');
    this.screen.dataset.state = state;
    this.input.consumeMouse(); // drop movement made while not aiming
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
