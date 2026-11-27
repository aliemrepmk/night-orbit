import { CONFIG } from '../config';
import type { MapData, Vec2, ZoneId } from '../world/mapTypes';

/** An axis-aligned box in map units (x east, y = map z south). */
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The briefing's map sketch (M8, PLAN.md §7.16), as SVG-ready data: map x → svg x, map z → svg y. */
export interface BriefingMap {
  /** What must be visible: every zone and the whole route, plus a margin. */
  readonly bounds: Box;
  readonly viewBox: string;
  readonly roads: readonly { d: string; paved: boolean }[];
  readonly stream: string;
  /** Ridgeback's whole walk, OP → LZ. */
  readonly route: string;
  readonly zones: readonly { id: ZoneId; label: string; x: number; y: number; r: number }[];
  /** The protected clinic (a cross is drawn on it). */
  readonly clinic: { x: number; y: number } | null;
  /** Terrain detail (M8+ Phase A): field outlines, building footprints, tree lines, hedges and walls. */
  readonly fields: readonly string[];
  readonly buildings: readonly string[];
  readonly trees: readonly string[];
  readonly walls: readonly string[];
  /** Forest outlines (M8+ Phase D). */
  readonly forests: readonly string[];
  /** M10+: the lettered grid over the sketch, and the start point / phase line / LZ tags. */
  readonly grid: MapGrid;
  readonly marks: readonly { text: string; x: number; y: number }[];
}

/**
 * The briefing grid (M10+): `cols` lettered columns (A, B, …) × `rows` numbered rows of square
 * cells, centered on the sketch's bounds and just big enough to cover them. Grid references in
 * the briefing text ("LZ QUARRY · H5") come from the same grid, so text and map always agree.
 */
export interface MapGrid {
  readonly box: Box;
  readonly cols: number;
  readonly rows: number;
  /** Cell size in map meters. */
  readonly cell: number;
}

export function mapGrid(
  bounds: Box,
  cols: number = CONFIG.ui.gridCols,
  rows: number = CONFIG.ui.gridRows,
): MapGrid {
  const box = fitViewBox(bounds, cols / rows);
  return { box, cols, rows, cell: box.w / cols };
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O (read as 1 and 0)

/** The grid square of map point (x, z), e.g. `E4` (clamped onto the grid). */
export function gridRef(g: MapGrid, x: number, z: number): string {
  const c = Math.min(g.cols - 1, Math.max(0, Math.floor((x - g.box.x) / g.cell)));
  const r = Math.min(g.rows - 1, Math.max(0, Math.floor((z - g.box.y) / g.cell)));
  return `${LETTERS[c]}${r + 1}`;
}

/** Column letter `i` of the grid (0 = A; no I or O). */
export function gridLetter(i: number): string {
  return LETTERS[i];
}

/** The tags on the briefing map: start point, phase lines, landing zone (M10+, PLAN.md §8). */
export const PHASE_MARKS: Readonly<Partial<Record<ZoneId, string>>> = {
  op: 'SP',
  fields: 'PL1',
  village: 'PL2',
  crossroads: 'PL3',
  lz: 'LZ',
};

export const ZONE_LABELS: Readonly<Record<ZoneId, string>> = {
  op: 'OP',
  fields: 'FIELDS',
  village: 'VILLAGE',
  crossroads: 'CROSSROADS',
  lz: 'LZ QUARRY',
  forest: 'BLACK PINE', // not "LZ SAWMILL": the briefing doesn't give the twist away
};

const PAD = 70;

function path(points: readonly Vec2[]): string {
  return points.map(([x, z], i) => `${i ? 'L' : 'M'}${Math.round(x)} ${Math.round(z)}`).join(' ');
}

function polygon(points: readonly Vec2[]): string {
  return `${path(points)} Z`;
}

/** A building's rotated footprint as a closed path (rotation about +y, as in the 3D world). */
function footprint(pos: Vec2, rot: number, size: Vec2): string {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const hx = size[0] / 2;
  const hz = size[1] / 2;
  const corners: Vec2[] = [
    [-hx, -hz],
    [hx, -hz],
    [hx, hz],
    [-hx, hz],
  ].map(([lx, lz]) => [pos[0] + c * lx + s * lz, pos[1] - s * lx + c * lz]);
  return polygon(corners);
}

function viewBoxText(b: Box): string {
  return `${Math.round(b.x)} ${Math.round(b.y)} ${Math.round(b.w)} ${Math.round(b.h)}`;
}

/**
 * Grows `b` around its center so it has the frame's `aspect` (width / height): the sketch then
 * fills its frame instead of leaving empty bands, showing more of the valley around it.
 */
export function fitViewBox(b: Box, aspect: number): Box {
  if (!(aspect > 0) || !Number.isFinite(aspect)) return b;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  // Too narrow for the frame: widen it; too wide: make it taller.
  const ww = b.w / b.h < aspect ? b.h * aspect : b.w;
  const hh = b.w / b.h < aspect ? b.h : b.w / aspect;
  return { x: cx - ww / 2, y: cy - hh / 2, w: ww, h: hh };
}

/** `fitViewBox` as an SVG `viewBox` attribute. */
export function fitViewBoxText(b: Box, aspect: number): string {
  return viewBoxText(fitViewBox(b, aspect));
}

/** Builds the sketch from the map data: the frame fits every zone and the route, plus a margin. */
export function briefingMap(map: MapData): BriefingMap {
  const route: Vec2[] = [];
  for (const id of map.routeOrder) {
    for (const p of map.friendlyRoutes[id]) {
      const last = route[route.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) route.push(p);
    }
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const grow = (x: number, z: number, r = 0) => {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minZ = Math.min(minZ, z - r);
    maxZ = Math.max(maxZ, z + r);
  };
  const ids = Object.keys(map.zones) as ZoneId[];
  for (const id of ids)
    grow(map.zones[id].center[0], map.zones[id].center[1], map.zones[id].radius);
  for (const [x, z] of route) grow(x, z);
  const bounds: Box = {
    x: minX - PAD,
    y: minZ - PAD,
    w: maxX - minX + 2 * PAD,
    h: maxZ - minZ + 2 * PAD,
  };

  const clinic = map.buildings.find((b) => b.protected && b.kind === 'clinic');
  return {
    bounds,
    viewBox: viewBoxText(bounds),
    roads: map.roads.map((r) => ({ d: path(r.points), paved: r.kind === 'paved' })),
    stream: path(map.stream.points),
    route: path(route),
    zones: ids.map((id) => ({
      id,
      label: ZONE_LABELS[id],
      x: map.zones[id].center[0],
      y: map.zones[id].center[1],
      r: map.zones[id].radius,
    })),
    clinic: clinic ? { x: clinic.pos[0], y: clinic.pos[1] } : null,
    fields: map.fields.map((f) => polygon(f.polygon)),
    buildings: map.buildings.map((b) => footprint(b.pos, b.rot, b.size)),
    trees: map.treeLines.map((t) => path(t.points)),
    walls: map.walls.map((w) => path(w.points)),
    forests: map.forests.map((f) => polygon(f.polygon)),
    grid: mapGrid(bounds),
    marks: ids
      .filter((id) => PHASE_MARKS[id])
      .map((id) => ({
        text: PHASE_MARKS[id]!,
        x: map.zones[id].center[0],
        y: map.zones[id].center[1],
      })),
  };
}

/** The sketch as an SVG string (monochrome; styled by `.brief-map` in hud.css). */
export function briefingSvg(m: BriefingMap): string {
  const many = (cls: string, ds: readonly string[]) =>
    ds.length ? `<path class="${cls}" d="${ds.join(' ')}"/>` : '';
  const zones = m.zones
    .map(
      (z) =>
        `<circle class="zone" cx="${z.x}" cy="${z.y}" r="${z.r}"/>` +
        `<text x="${z.x}" y="${z.y - z.r - 14}">${z.label}</text>`,
    )
    .join('');
  const roads = m.roads
    .map((r) => `<path class="road${r.paved ? ' paved' : ''}" d="${r.d}"/>`)
    .join('');
  const clinic = m.clinic
    ? `<path class="clinic" d="M${m.clinic.x - 14} ${m.clinic.y} h28 M${m.clinic.x} ${m.clinic.y - 14} v28"/>`
    : '';
  return (
    `<svg class="brief-map" viewBox="${m.viewBox}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of the Varesh Valley">` +
    many('field', m.fields) +
    many('forest', m.forests) +
    many('trees', m.trees) +
    many('walls', m.walls) +
    `<path class="stream" d="${m.stream}"/>${roads}` +
    many('building', m.buildings) +
    `${zones}<path class="route" d="${m.route}"/>${clinic}${gridSvg(m.grid)}${marksSvg(m.marks)}</svg>`
  );
}

/** The grid's lines and edge labels (M10+), drawn over the sketch. */
function gridSvg(g: MapGrid): string {
  const { x, y, w, h } = g.box;
  const r = (v: number) => Math.round(v);
  const lines: string[] = [];
  for (let i = 0; i <= g.cols; i++) lines.push(`M${r(x + i * g.cell)} ${r(y)} v${r(h)}`);
  for (let j = 0; j <= g.rows; j++) lines.push(`M${r(x)} ${r(y + j * g.cell)} h${r(w)}`);
  const labels: string[] = [];
  for (let i = 0; i < g.cols; i++)
    labels.push(
      `<text class="grid-label" x="${r(x + (i + 0.5) * g.cell)}" y="${r(y + g.cell * 0.22)}">${gridLetter(i)}</text>`,
    );
  for (let j = 0; j < g.rows; j++)
    labels.push(
      `<text class="grid-label" x="${r(x + g.cell * 0.12)}" y="${r(y + (j + 0.55) * g.cell)}">${j + 1}</text>`,
    );
  return `<path class="grid" d="${lines.join(' ')}"/>${labels.join('')}`;
}

/** Start point / phase line / LZ tags, just below each zone's center (M10+). */
function marksSvg(marks: readonly { text: string; x: number; y: number }[]): string {
  return marks
    .map((k) => {
      const w = 22 + k.text.length * 22;
      const x = Math.round(k.x - w / 2);
      const y = Math.round(k.y + 18);
      return (
        `<g class="mark"><rect x="${x}" y="${y}" width="${w}" height="40"/>` +
        `<text x="${Math.round(k.x)}" y="${y + 30}">${k.text}</text></g>`
      );
    })
    .join('');
}
