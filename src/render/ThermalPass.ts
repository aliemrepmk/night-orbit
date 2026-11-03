import { Vector2, Vector3 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CONFIG } from '../config';
import type { SensorMode } from './thermalMath';

/** Per-frame inputs to the sensor image. */
export interface ThermalFrame {
  time: number;
  mode: SensorMode;
  /** Display gamma (per weapon in thermal, fixed in NV). */
  gamma: number;
  grain: number;
  staticAmount: number;
  blurPx: number;
  /** 0–1 sensor saturation from a nearby blast (added to the raw value before the curve). */
  whiteout: number;
}

/**
 * Turns the rendered value (heat in thermal, light in NV, + bloom) into the sensor feed:
 * barrel distortion → refocus blur → display curve (thermal: contrast curve then polarity;
 * NV: gain + gamma) → grain → scanlines + rolling band → vignette → static burst → tint
 * (gray for thermal, green phosphor for NV).
 * The curves mirror `thermalMath.ts` (`displayValue`, `nvCurve`); keep them in sync.
 */
const ThermalShader = {
  name: 'ThermalShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new Vector2(1, 1) },
    uPixelRatio: { value: 1 },
    uTime: { value: 0 },
    uPolarity: { value: 0 },
    uNightVision: { value: 0 },
    uNvGain: { value: 1 },
    uLevels: { value: new Vector2(0, 1) },
    uGamma: { value: 1 },
    uGrain: { value: 0 },
    uScanlines: { value: 0 },
    uRollBand: { value: 0 },
    uRollSpeed: { value: 0 },
    uVignette: { value: 0 },
    uBarrel: { value: 0 },
    uTint: { value: new Vector3(1, 1, 1) },
    uStatic: { value: 0 },
    uBlurPx: { value: 0 },
    uWhiteout: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uPixelRatio;
    uniform float uTime;
    uniform float uPolarity;
    uniform float uNightVision;
    uniform float uNvGain;
    uniform vec2 uLevels;
    uniform float uGamma;
    uniform float uGrain;
    uniform float uScanlines;
    uniform float uRollBand;
    uniform float uRollSpeed;
    uniform float uVignette;
    uniform float uBarrel;
    uniform vec3 uTint;
    uniform float uStatic;
    uniform float uBlurPx;
    uniform float uWhiteout;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float heatAt(vec2 uv) { return texture2D(tDiffuse, uv).r; }

    void main() {
      // Barrel distortion, normalized so the corners stay exactly at the corners.
      vec2 c = vUv - 0.5;
      vec2 uv = 0.5 + c * (1.0 + uBarrel * dot(c, c) * 4.0) / (1.0 + uBarrel * 2.0);

      // Refocus blur (3x3 tent filter) after an optic switch.
      float h;
      if (uBlurPx > 0.01) {
        vec2 o = uBlurPx * uPixelRatio / uResolution;
        h = 0.25 * heatAt(uv)
          + 0.125 * (heatAt(uv + vec2(o.x, 0.0)) + heatAt(uv - vec2(o.x, 0.0))
                   + heatAt(uv + vec2(0.0, o.y)) + heatAt(uv - vec2(0.0, o.y)))
          + 0.0625 * (heatAt(uv + o) + heatAt(uv - o)
                    + heatAt(uv + vec2(o.x, -o.y)) + heatAt(uv + vec2(-o.x, o.y)));
      } else {
        h = heatAt(uv);
      }

      // Blast whiteout saturates the sensor (goes black in black-hot, like the real thing).
      h += uWhiteout;

      float v;
      if (uNightVision < 0.5) {
        // Contrast curve, then polarity (same as thermalMath.displayValue).
        v = pow(clamp((h - uLevels.x) / (uLevels.y - uLevels.x), 0.0, 1.0), uGamma);
        v = mix(v, 1.0 - v, uPolarity);
      } else {
        // Image intensifier: gain, then gamma (same as thermalMath.nvCurve).
        v = pow(clamp(h * uNvGain, 0.0, 1.0), uGamma);
      }

      // Animated sensor grain (new pattern every frame).
      vec2 px = gl_FragCoord.xy / uPixelRatio;
      v += (hash(floor(px) + fract(uTime * 7.31) * vec2(431.0, 177.0)) - 0.5) * 2.0 * uGrain;

      // Scanlines (2 CSS px period) and a faint band rolling down the screen.
      v *= 1.0 - uScanlines * (0.5 + 0.5 * cos(px.y * 3.14159265));
      float band = fract(vUv.y + uTime * uRollSpeed) - 0.5;
      v += uRollBand * exp(-band * band * 150.0);

      // Vignette.
      float d = length(vUv - 0.5) * 1.41421356;
      v *= 1.0 - uVignette * smoothstep(0.45, 1.0, d);

      // Static burst: coarse snow plus horizontal tear lines.
      if (uStatic > 0.0) {
        float frame = floor(uTime * 60.0);
        float snow = hash(floor(px / 2.0) + frame * vec2(61.3, 17.9));
        float tear = step(0.9, hash(vec2(floor(px.y / 3.0), frame)));
        v = mix(v, snow, uStatic * 0.85) + tear * uStatic * 0.3;
      }

      // Outside the distorted image: black border in every mode.
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) v = 0.0;

      gl_FragColor = vec4(clamp(v, 0.0, 1.0) * uTint, 1.0);
    }
  `,
};

export class ThermalPass extends ShaderPass {
  constructor() {
    super(ThermalShader);
    const t = CONFIG.thermal;
    const u = this.uniforms;
    (u.uLevels.value as Vector2).set(t.levels.lo, t.levels.hi);
    u.uScanlines.value = t.scanlines;
    u.uRollBand.value = t.rollBand;
    u.uRollSpeed.value = t.rollSpeed;
    u.uBarrel.value = t.barrel;
    u.uNvGain.value = CONFIG.nightVision.gain;
  }

  /** `width`/`height` in device pixels. */
  override setSize(width: number, height: number): void {
    (this.uniforms.uResolution.value as Vector2).set(width, height);
  }

  setPixelRatio(ratio: number): void {
    this.uniforms.uPixelRatio.value = ratio;
  }

  setFrame(f: ThermalFrame): void {
    const u = this.uniforms;
    u.uTime.value = f.time;
    const nv = f.mode === 'nv';
    u.uNightVision.value = nv ? 1 : 0;
    u.uPolarity.value = f.mode === 'black' ? 1 : 0;
    u.uVignette.value = nv ? CONFIG.nightVision.vignette : CONFIG.thermal.vignette;
    (u.uTint.value as Vector3).set(...(nv ? CONFIG.nightVision.phosphor : CONFIG.thermal.tint));
    u.uGamma.value = f.gamma;
    u.uGrain.value = f.grain;
    u.uStatic.value = f.staticAmount;
    u.uBlurPx.value = f.blurPx;
    u.uWhiteout.value = f.whiteout;
  }
}
