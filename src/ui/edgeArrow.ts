/** Where an off-screen marker sits on the screen edge, and which way it points. */
export interface EdgeArrow {
  /** CSS pixels from the top-left corner. */
  readonly x: number;
  readonly y: number;
  /** Degrees, screen convention: 0 = pointing right, 90 = pointing down. */
  readonly angle: number;
}

/** How far inside each screen edge the arrows run (CSS px). */
export interface EdgeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** A HUD text block in a screen corner the arrows (and their labels) must stay out of: [w, h] px. */
export interface CornerKeepOut {
  readonly topLeft?: readonly [number, number];
  readonly topRight?: readonly [number, number];
  readonly bottomLeft?: readonly [number, number];
  readonly bottomRight?: readonly [number, number];
}

function insetsOf(m: number | EdgeInsets): EdgeInsets {
  return typeof m === 'number' ? { top: m, right: m, bottom: m, left: m } : m;
}

/**
 * The off-screen friendly arrow (M8, PLAN.md §7.16). `ndcX`/`ndcY` are the friendly's projected
 * position (−1…1 on screen), `behind` is true when it is behind the camera (the projection is
 * then mirrored). Returns null while it is on screen; otherwise a point on a rectangle `insets`
 * px inside the screen edges, along the line from the screen center toward the friendly.
 *
 * M10: the HUD's corner text (telemetry, gun status, clock) used to sit under arrows and labels.
 * The top inset now clears the top text row, and an arrow landing in a corner `keepOut` box slides
 * along its edge out of the box. It always points at the friendly (the angle is unchanged).
 */
export function edgeArrow(
  ndcX: number,
  ndcY: number,
  behind: boolean,
  width: number,
  height: number,
  insets: number | EdgeInsets,
  keepOut: CornerKeepOut = {},
): EdgeArrow | null {
  if (!behind && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) return null;
  const s = behind ? -1 : 1;
  const dx = s * ndcX * (width / 2);
  let dy = -s * ndcY * (height / 2);
  if (dx === 0 && dy === 0) dy = height / 2; // exactly behind: point down (back toward the aircraft)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  const m = insetsOf(insets);
  const cx = width / 2;
  const cy = height / 2;
  const left = Math.min(m.left, cx - 1);
  const right = Math.max(width - m.right, cx + 1);
  const top = Math.min(m.top, cy - 1);
  const bottom = Math.max(height - m.bottom, cy + 1);
  // Scale the direction until it meets the first side of the inset rectangle.
  const tx = dx > 0 ? (right - cx) / dx : dx < 0 ? (left - cx) / dx : Infinity;
  const ty = dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : Infinity;
  const onSide = tx < ty; // left or right side (else top or bottom)
  const t = Math.min(tx, ty);
  let x = cx + dx * t;
  let y = cy + dy * t;

  // Slide out of the corner boxes, along the side the arrow is on, toward the middle.
  const box = (k: keyof CornerKeepOut) => keepOut[k] ?? ([0, 0] as const);
  const [tlW, tlH] = box('topLeft');
  const [trW, trH] = box('topRight');
  const [blW, blH] = box('bottomLeft');
  const [brW, brH] = box('bottomRight');
  if (onSide) {
    const [topH, botH] = x < cx ? [tlH, blH] : [trH, brH];
    y = Math.min(Math.max(y, topH), Math.max(height - botH, topH));
  } else {
    const [leftW, rightW] = y < cy ? [tlW, trW] : [blW, brW];
    x = Math.min(Math.max(x, leftW), Math.max(width - rightW, leftW));
  }
  return { x, y, angle };
}
