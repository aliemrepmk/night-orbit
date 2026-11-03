import { ShaderMaterial, Vector3 } from 'three';
import { CONFIG } from '../config';
import type { Signature } from '../fx/Light';

/**
 * Where an object's signature (heat, NV albedo, NV glow) comes from:
 * - `uniform`: one signature for the whole mesh (`signature` option; change heat via `setHeat`)
 * - `vertex`: a per-vertex vec3 `signature` attribute (terrain painted with fields)
 * - `instance`: a per-instance vec3 `instanceSignature` attribute on an InstancedMesh
 *   (every soldier / tree can have its own heat and cool independently)
 */
export type SignatureSource = 'uniform' | 'vertex' | 'instance';

export interface ThermalMaterialOptions {
  signature?: Signature;
  source?: SignatureSource;
  /** Scales the world-space surface noise (0 = perfectly flat). */
  noise?: number;
}

/**
 * Uniforms shared by every material (the same objects are referenced by all of them), so one
 * write switches the whole world between thermal and NV. Other sensor shaders (particles)
 * include them too.
 */
export const SENSOR_UNIFORMS = (() => {
  const t = CONFIG.thermal;
  const nv = CONFIG.nightVision;
  return {
    uNightVision: { value: 0 },
    uHazeHeat: { value: t.hazeHeat },
    uHazeDensity: { value: t.hazeDensity },
    uMoonDir: { value: new Vector3(...nv.moonDir).normalize() },
    uMoonLight: { value: nv.moonLight },
    uSkyLight: { value: nv.skyLight },
    uHazeLight: { value: nv.hazeLight },
    uNvHazeDensity: { value: nv.hazeDensity },
  };
})();

const vertexShader = /* glsl */ `
  uniform vec3 uSignature;
  #ifdef SIGNATURE_VERTEX
    attribute vec3 signature;
  #endif
  #ifdef SIGNATURE_INSTANCE
    attribute vec3 instanceSignature;
  #endif

  varying vec3 vSignature; // (heat, albedo, glow)
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDepth;

  void main() {
    vec4 local = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorldPos = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);

    #if defined(SIGNATURE_VERTEX)
      vSignature = signature;
    #elif defined(SIGNATURE_INSTANCE)
      vSignature = instanceSignature;
    #else
      vSignature = uSignature;
    #endif

    vec4 view = viewMatrix * world;
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uNoise;
  uniform float uNvNoise;
  uniform float uNightVision;
  uniform float uHazeHeat;
  uniform float uHazeDensity;
  uniform vec3 uMoonDir;
  uniform float uMoonLight;
  uniform float uSkyLight;
  uniform float uHazeLight;
  uniform float uNvHazeDensity;

  varying vec3 vSignature;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDepth;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float valueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    vec3 nrm = normalize(vNormal);
    // Surface variation in world space (walls use height too, so they aren't streaked).
    vec2 p = vWorldPos.xz + vec2(vWorldPos.y * 0.7, -vWorldPos.y * 0.4);
    float n = 0.65 * valueNoise(p * 0.05) + 0.35 * valueNoise(p * 0.4);
    float v;

    if (uNightVision < 0.5) {
      // Thermal: heat. Tops catch a little more residual warmth than sides.
      float facing = 0.85 + 0.15 * clamp(nrm.y, 0.0, 1.0);
      v = vSignature.x * facing + (n - 0.5) * uNoise;
      v = mix(v, uHazeHeat, 1.0 - exp(-vDepth * uHazeDensity));
    } else {
      // NV: reflected sky + moon light, plus glow (same as thermalMath.nvSurfaceLight).
      float sky = uSkyLight * (0.8 + 0.2 * max(nrm.y, 0.0));
      float moon = uMoonLight * max(dot(nrm, uMoonDir), 0.0);
      v = vSignature.y * (sky + moon) * (1.0 + (n - 0.5) * uNvNoise) + vSignature.z;
      v = mix(v, uHazeLight, 1.0 - exp(-vDepth * uNvHazeDensity));
    }
    gl_FragColor = vec4(vec3(v), 1.0);
  }
`;

/**
 * The one shared sensor shader. It outputs a raw value, not a color: heat in thermal mode,
 * received light in NV mode. `ThermalPass` turns that into the final image. See PLAN.md §7.5.
 */
export class ThermalMaterial extends ShaderMaterial {
  constructor({
    signature = { heat: 0.2, albedo: 0.3, glow: 0 },
    source = 'uniform',
    noise = 1,
  }: ThermalMaterialOptions = {}) {
    super({
      vertexShader,
      fragmentShader,
      defines: {
        ...(source === 'vertex' ? { SIGNATURE_VERTEX: '' } : {}),
        ...(source === 'instance' ? { SIGNATURE_INSTANCE: '' } : {}),
      },
      uniforms: {
        ...SENSOR_UNIFORMS,
        uSignature: { value: new Vector3(signature.heat, signature.albedo, signature.glow) },
        uNoise: { value: CONFIG.thermal.surfaceNoise * noise },
        uNvNoise: { value: CONFIG.nightVision.surfaceNoise * noise },
      },
    });
  }

  /** Switches every ThermalMaterial between thermal (heat) and night vision (light). */
  static setNightVision(on: boolean): void {
    SENSOR_UNIFORMS.uNightVision.value = on ? 1 : 0;
  }

  get heat(): number {
    return (this.uniforms.uSignature.value as Vector3).x;
  }

  setHeat(heat: number): void {
    (this.uniforms.uSignature.value as Vector3).x = heat;
  }

  setSignature(heat: number, albedo: number, glow: number): void {
    (this.uniforms.uSignature.value as Vector3).set(heat, albedo, glow);
  }
}
