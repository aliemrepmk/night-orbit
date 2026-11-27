import {
  Color,
  HalfFloatType,
  Scene,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
  type PerspectiveCamera,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CONFIG } from '../config';
import { GpuTimer } from './GpuTimer';
import { renderPixelRatio } from './pixelRatio';
import { ThermalMaterial } from './ThermalMaterial';
import { ThermalPass, type ThermalFrame } from './ThermalPass';

/**
 * Owns the WebGL renderer, the scene and the sensor post-processing chain:
 * scene (raw heat or NV light, half-float) → bloom → ThermalPass (sensor image) → screen.
 * There are no three.js lights or fog: every object uses ThermalMaterial, which outputs the
 * active sensor's value directly.
 */
export class Renderer {
  readonly webgl: WebGLRenderer;
  readonly scene = new Scene();
  private readonly composer: EffectComposer;
  private readonly thermal = new ThermalPass();
  private readonly gpuTimer: GpuTimer;
  private readonly background = new Color();

  constructor(canvas: HTMLCanvasElement, camera: PerspectiveCamera) {
    const t = CONFIG.thermal;
    const r = CONFIG.render;
    // The canvas itself only receives the final full-screen pass, so it needs no antialiasing.
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(renderPixelRatio(window.devicePixelRatio, 1));
    // Several passes render per frame; count them all for the F1 stats.
    this.webgl.info.autoReset = false;
    this.gpuTimer = new GpuTimer(this.webgl.getContext() as WebGL2RenderingContext);

    // Values are stored linearly; setScalar writes the raw value (no color-space conversion).
    this.scene.background = this.background;

    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: r.msaaSamples });
    this.composer = new EffectComposer(this.webgl, target);
    this.composer.addPass(new RenderPass(this.scene, camera));
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(1, 1), t.bloom.strength, t.bloom.radius, t.bloom.threshold),
    );
    this.composer.addPass(this.thermal);
  }

  private width = 1;
  private height = 1;

  /** The RENDER RESOLUTION setting (M10): re-sizes every pass at the new pixel ratio. */
  setRenderScale(scale: number): void {
    const ratio = renderPixelRatio(window.devicePixelRatio, scale);
    if (ratio === this.webgl.getPixelRatio()) return;
    this.webgl.setPixelRatio(ratio);
    this.setSize(this.width, this.height);
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    const ratio = this.webgl.getPixelRatio();
    this.webgl.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.thermal.setPixelRatio(ratio);
  }

  render(frame: ThermalFrame): void {
    this.webgl.info.reset();
    const nv = frame.mode === 'nv';
    ThermalMaterial.setNightVision(nv);
    this.background.setScalar(nv ? CONFIG.nightVision.skyBackground : CONFIG.thermal.skyHeat);
    this.thermal.setFrame(frame);
    this.gpuTimer.begin();
    this.composer.render();
    this.gpuTimer.end();
  }

  get drawCalls(): number {
    return this.webgl.info.render.calls;
  }

  get triangles(): number {
    return this.webgl.info.render.triangles;
  }

  /** Smoothed GPU time per frame in ms, or null if the browser doesn't expose GPU timers. */
  get gpuMs(): number | null {
    return this.gpuTimer.ms;
  }
}
