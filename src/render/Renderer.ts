import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Scene,
  WebGLRenderer,
  type PerspectiveCamera,
} from 'three';

/**
 * Owns the WebGL renderer and the scene.
 * M1 uses plain lit grayscale materials as a placeholder; M2 replaces this with the thermal look.
 */
export class Renderer {
  readonly webgl: WebGLRenderer;
  readonly scene = new Scene();

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene.background = new Color(0x0b0d0e);
    this.scene.fog = new Fog(0x0b0d0e, 1600, 4200);

    this.scene.add(new HemisphereLight(0xc8d0d4, 0x1a1c1c, 1.6));
    const moon = new DirectionalLight(0xffffff, 1.4);
    moon.position.set(-0.4, 1, 0.3);
    this.scene.add(moon);
  }

  setSize(width: number, height: number): void {
    this.webgl.setSize(width, height, false);
  }

  render(camera: PerspectiveCamera): void {
    this.webgl.render(this.scene, camera);
  }

  get drawCalls(): number {
    return this.webgl.info.render.calls;
  }

  get triangles(): number {
    return this.webgl.info.render.triangles;
  }
}
