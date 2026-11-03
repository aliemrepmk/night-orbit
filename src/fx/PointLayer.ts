import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three';
import { SENSOR_UNIFORMS } from '../render/ThermalMaterial';
import type { Particles } from './Particles';

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aSig;   // (heat, albedo, glow)
  attribute float aAlpha;
  uniform float uScale;  // pixels per meter at 1 m distance
  uniform float uMaxPx;  // largest allowed sprite, in device pixels
  varying vec3 vSig;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    // Never smaller than 2 px, so distant tracers and sparks stay visible.
    gl_PointSize = clamp(aSize * uScale / -mv.z, 2.0, uMaxPx);
    vSig = aSig;
    vAlpha = aAlpha;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uNightVision;
  uniform float uSkyLight;
  uniform float uMoonLight;
  varying vec3 vSig;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    if (r > 1.0) discard;
    float a = (1.0 - smoothstep(0.35, 1.0, r)) * vAlpha;
    // Same outputs as ThermalMaterial: heat in thermal; reflected light + glow in NV.
    float v = uNightVision < 0.5 ? vSig.x : vSig.z + vSig.y * (uSkyLight + 0.7 * uMoonLight);
    gl_FragColor = vec4(vec3(v), a);
  }
`;

/**
 * A batch of soft round point sprites in one draw call. `additive` adds their value on top of
 * the scene (flashes, sparks, tracers, fire); otherwise they blend over it (smoke).
 * Fill it each frame with `begin()` → `push()`… → `end()`.
 */
export class PointLayer {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly sig: Float32Array;
  private readonly alpha: Float32Array;
  private readonly geo = new BufferGeometry();
  private readonly mat: ShaderMaterial;
  private n = 0;

  /** `maxPx` caps sprite size on screen (tracers stay thin even right next to the camera). */
  constructor(
    readonly capacity: number,
    additive: boolean,
    maxPx = 4096,
  ) {
    this.pos = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.sig = new Float32Array(capacity * 3);
    this.alpha = new Float32Array(capacity);
    const attr = (name: string, arr: Float32Array, size: number) =>
      this.geo.setAttribute(name, new BufferAttribute(arr, size).setUsage(DynamicDrawUsage));
    attr('position', this.pos, 3);
    attr('aSize', this.size, 1);
    attr('aSig', this.sig, 3);
    attr('aAlpha', this.alpha, 1);
    this.geo.setDrawRange(0, 0);

    this.mat = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { ...SENSOR_UNIFORMS, uScale: { value: 1 }, uMaxPx: { value: maxPx } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false; // contents move every frame
  }

  /** Call when the viewport or zoom changes: `heightPx` in device pixels, vertical FOV. */
  setViewport(heightPx: number, fovDeg: number): void {
    this.mat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  begin(): void {
    this.n = 0;
  }

  push(
    x: number,
    y: number,
    z: number,
    size: number,
    heat: number,
    albedo: number,
    glow: number,
    alpha: number,
  ): void {
    if (this.n >= this.capacity) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.sig[i * 3] = heat;
    this.sig[i * 3 + 1] = albedo;
    this.sig[i * 3 + 2] = glow;
    this.alpha[i] = alpha;
  }

  /** Copies every living particle in. */
  pushParticles(p: Particles): void {
    for (let i = 0; i < p.capacity; i++) {
      if (!p.isAlive(i)) continue;
      this.push(
        p.pos[i * 3],
        p.pos[i * 3 + 1],
        p.pos[i * 3 + 2],
        p.sizeOf(i),
        p.heatOf(i),
        p.albedo[i],
        p.glowOf(i),
        p.alphaOf(i),
      );
    }
  }

  end(): void {
    this.geo.setDrawRange(0, this.n);
    for (const name of ['position', 'aSize', 'aSig', 'aAlpha']) {
      const a = this.geo.getAttribute(name) as BufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  get count(): number {
    return this.n;
  }
}
