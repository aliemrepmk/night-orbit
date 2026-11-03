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
import { ThermalPass, type ThermalFrame } from './ThermalPass';

/**
 * Owns the WebGL renderer, the scene and the thermal post-processing chain:
 * scene (raw heat, half-float) → bloom → ThermalPass (sensor image) → screen.
 * There are no lights or fog: every object uses ThermalMaterial, which outputs heat directly.
 */
export class Renderer {
  readonly webgl: WebGLRenderer;
  readonly scene = new Scene();
  private readonly composer: EffectComposer;
  private readonly thermal = new ThermalPass();
  private readonly gpuTimer: GpuTimer;

  constructor(canvas: HTMLCanvasElement, camera: PerspectiveCamera) {
    const t = CONFIG.thermal;
    const r = CONFIG.render;
    // The canvas itself only receives the final full-screen pass, so it needs no antialiasing.
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, r.maxPixelRatio));
    // Several passes render per frame; count them all for the F1 stats.
    this.webgl.info.autoReset = false;
    this.gpuTimer = new GpuTimer(this.webgl.getContext() as WebGL2RenderingContext);

    // Heat is stored linearly; setScalar writes the raw value (no color-space conversion).
    this.scene.background = new Color().setScalar(t.skyHeat);

    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: r.msaaSamples });
    this.composer = new EffectComposer(this.webgl, target);
    this.composer.addPass(new RenderPass(this.scene, camera));
    this.composer.addPass(
      new UnrealBloomPass(new Vector2(1, 1), t.bloom.strength, t.bloom.radius, t.bloom.threshold),
    );
    this.composer.addPass(this.thermal);
  }

  setSize(width: number, height: number): void {
    const ratio = this.webgl.getPixelRatio();
    this.webgl.setSize(width, height, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(width, height);
    this.thermal.setPixelRatio(ratio);
  }

  render(frame: ThermalFrame): void {
    this.webgl.info.reset();
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
