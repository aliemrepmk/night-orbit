import { ShaderMaterial } from 'three';
import { CONFIG } from '../config';

/**
 * Where an object's heat comes from:
 * - `uniform`: one heat for the whole mesh (`heat` option, change via `setHeat`)
 * - `vertex`: a per-vertex `heat` attribute (terrain painted with fields)
 * - `instance`: a per-instance `instanceHeat` attribute on an InstancedMesh
 *   (every soldier / tree can have its own heat and cool independently)
 */
export type HeatSource = 'uniform' | 'vertex' | 'instance';

export interface ThermalMaterialOptions {
  heat?: number;
  source?: HeatSource;
  /** Scales the world-space surface noise (0 = perfectly flat heat). */
  noise?: number;
}

const vertexShader = /* glsl */ `
  uniform float uHeat;
  #ifdef HEAT_VERTEX
    attribute float heat;
  #endif
  #ifdef HEAT_INSTANCE
    attribute float instanceHeat;
  #endif

  varying float vHeat;
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

    #if defined(HEAT_VERTEX)
      vHeat = heat;
    #elif defined(HEAT_INSTANCE)
      vHeat = instanceHeat;
    #else
      vHeat = uHeat;
    #endif

    vec4 view = viewMatrix * world;
    vDepth = -view.z;
    gl_Position = projectionMatrix * view;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uNoise;
  uniform float uHazeHeat;
  uniform float uHazeDensity;

  varying float vHeat;
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
    // Surface variation in world space (walls use height too, so they aren't streaked).
    vec2 p = vWorldPos.xz + vec2(vWorldPos.y * 0.7, -vWorldPos.y * 0.4);
    float n = 0.65 * valueNoise(p * 0.05) + 0.35 * valueNoise(p * 0.4);
    // Tops catch a little more residual warmth than sides.
    float facing = 0.85 + 0.15 * clamp(normalize(vNormal).y, 0.0, 1.0);
    float h = vHeat * facing + (n - 0.5) * uNoise;
    // Atmospheric haze: far things fade toward the air's heat.
    float haze = 1.0 - exp(-vDepth * uHazeDensity);
    h = mix(h, uHazeHeat, haze);
    gl_FragColor = vec4(vec3(h), 1.0);
  }
`;

/**
 * The one shared thermal shader: outputs raw heat (not a color). `ThermalPass` turns heat into
 * the final sensor image. See PLAN.md §7.5.
 */
export class ThermalMaterial extends ShaderMaterial {
  constructor({ heat = 0.2, source = 'uniform', noise = 1 }: ThermalMaterialOptions = {}) {
    const t = CONFIG.thermal;
    super({
      vertexShader,
      fragmentShader,
      defines: {
        ...(source === 'vertex' ? { HEAT_VERTEX: '' } : {}),
        ...(source === 'instance' ? { HEAT_INSTANCE: '' } : {}),
      },
      uniforms: {
        uHeat: { value: heat },
        uNoise: { value: t.surfaceNoise * noise },
        uHazeHeat: { value: t.hazeHeat },
        uHazeDensity: { value: t.hazeDensity },
      },
    });
  }

  get heat(): number {
    return this.uniforms.uHeat.value as number;
  }

  setHeat(heat: number): void {
    this.uniforms.uHeat.value = heat;
  }
}
