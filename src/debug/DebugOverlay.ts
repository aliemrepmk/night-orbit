import { type Camera, Vector3 } from 'three';
import type { OverlayKind, OverlayShape } from './mapOverlay';

const SVG = 'http://www.w3.org/2000/svg';
const KINDS: readonly OverlayKind[] = [
  'zone',
  'road',
  'route',
  'path',
  'vehicle',
  'spawn',
  'cover',
];

interface Prepared {
  readonly shape: OverlayShape;
  /** Flattened world positions (x, y, z per point; y = ground). */
  readonly world: Float32Array;
}

/**
 * The map-authoring overlay (F2 in dev builds, PLAN.md §7.18): projects the map's zones, routes,
 * paths, spawns and cover onto the sensor view as an SVG layer, plus the last point the placer
 * logged. Drawn only while visible.
 */
export class DebugOverlay {
  visible = false;
  private readonly svg: SVGSVGElement;
  private readonly paths = new Map<OverlayKind, SVGPathElement>();
  private readonly labels: SVGTextElement[] = [];
  private readonly prepared: Prepared[];
  private readonly placedMark: SVGPathElement;
  private readonly placedText: SVGTextElement;
  private placed: { x: number; y: number; z: number; text: string } | null = null;
  private readonly v = new Vector3();

  constructor(
    parent: HTMLElement,
    shapes: readonly OverlayShape[],
    groundAt: (x: number, z: number) => number,
  ) {
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.classList.add('debug-overlay', 'hidden');
    for (const kind of KINDS) {
      const p = document.createElementNS(SVG, 'path');
      p.classList.add(`ov-${kind}`);
      this.svg.appendChild(p);
      this.paths.set(kind, p);
    }
    this.prepared = shapes.map((shape) => {
      const world = new Float32Array(shape.points.length * 3);
      shape.points.forEach(([x, z], i) => world.set([x, groundAt(x, z) + 0.5, z], i * 3));
      if (shape.label) {
        const t = document.createElementNS(SVG, 'text');
        t.classList.add(`ov-label`, `ov-${shape.kind}`);
        t.textContent = shape.label;
        this.svg.appendChild(t);
        this.labels.push(t);
      }
      return { shape, world };
    });
    this.placedMark = document.createElementNS(SVG, 'path');
    this.placedMark.classList.add('ov-placed');
    this.placedText = document.createElementNS(SVG, 'text');
    this.placedText.classList.add('ov-label', 'ov-placed');
    this.svg.append(this.placedMark, this.placedText);
    parent.appendChild(this.svg);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.svg.classList.toggle('hidden', !this.visible);
  }

  /** Marks the point the placer just logged (shown until the next one). */
  markPlaced(x: number, y: number, z: number, text: string): void {
    this.placed = { x, y, z, text };
  }

  /** Per rendered frame while visible: project every shape with the sensor camera. */
  render(camera: Camera, width: number, height: number): void {
    if (!this.visible) return;
    const d = new Map<OverlayKind, string[]>(KINDS.map((k) => [k, []]));
    let label = 0;
    for (const { shape, world } of this.prepared) {
      const parts = d.get(shape.kind)!;
      let pen = false;
      let first: [number, number] | null = null;
      let mid: [number, number] | null = null;
      const n = world.length / 3;
      for (let i = 0; i < n; i++) {
        const s = this.project(
          camera,
          world[i * 3],
          world[i * 3 + 1],
          world[i * 3 + 2],
          width,
          height,
        );
        if (!s) {
          pen = false;
          continue;
        }
        if (shape.dots) {
          parts.push(`M${s[0] - 2},${s[1] - 2}h4v4h-4z`);
          continue;
        }
        parts.push(`${pen ? 'L' : 'M'}${s[0]},${s[1]}`);
        pen = true;
        if (i === 0) first = s;
        if (i === Math.floor(n / 2)) mid = s;
      }
      if (shape.closed && first && pen) parts.push(`L${first[0]},${first[1]}`);
      if (shape.label) {
        const t = this.labels[label++];
        const at = shape.kind === 'zone' ? first : (mid ?? first);
        if (at) {
          t.setAttribute('x', String(at[0] + 4));
          t.setAttribute('y', String(at[1] - 4));
          t.style.display = '';
        } else {
          t.style.display = 'none';
        }
      }
    }
    for (const kind of KINDS) this.paths.get(kind)!.setAttribute('d', d.get(kind)!.join(''));

    const p =
      this.placed &&
      this.project(camera, this.placed.x, this.placed.y, this.placed.z, width, height);
    if (p && this.placed) {
      this.placedMark.setAttribute('d', `M${p[0] - 8},${p[1]}h16M${p[0]},${p[1] - 8}v16`);
      this.placedText.setAttribute('x', String(p[0] + 10));
      this.placedText.setAttribute('y', String(p[1] - 10));
      this.placedText.textContent = this.placed.text;
    } else {
      this.placedMark.setAttribute('d', '');
      this.placedText.textContent = '';
    }
  }

  private project(camera: Camera, x: number, y: number, z: number, w: number, h: number) {
    this.v.set(x, y, z).project(camera);
    if (this.v.z > 1 || this.v.z < -1) return null; // behind the camera
    return [Math.round(((this.v.x + 1) / 2) * w), Math.round(((1 - this.v.y) / 2) * h)] as [
      number,
      number,
    ];
  }
}
