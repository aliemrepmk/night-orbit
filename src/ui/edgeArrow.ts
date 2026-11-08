/** Where an off-screen marker sits on the screen edge, and which way it points. */
export interface EdgeArrow {
  /** CSS pixels from the top-left corner. */
  readonly x: number;
  readonly y: number;
  /** Degrees, screen convention: 0 = pointing right, 90 = pointing down. */
  readonly angle: number;
}

/**
 * The off-screen friendly arrow (M8, PLAN.md §7.16). `ndcX`/`ndcY` are the friendly's projected
 * position (−1…1 on screen), `behind` is true when it is behind the camera (the projection is
 * then mirrored). Returns null while it is on screen; otherwise a point on a rectangle `margin`
 * px inside the screen edge, along the line from the screen center toward the friendly.
 */
export function edgeArrow(
  ndcX: number,
  ndcY: number,
  behind: boolean,
  width: number,
  height: number,
  margin: number,
): EdgeArrow | null {
  if (!behind && Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1) return null;
  const s = behind ? -1 : 1;
  let dx = s * ndcX * (width / 2);
  let dy = -s * ndcY * (height / 2);
  if (dx === 0 && dy === 0) dy = height / 2; // exactly behind: point down (back toward the aircraft)
  const halfW = Math.max(1, width / 2 - margin);
  const halfH = Math.max(1, height / 2 - margin);
  const t = Math.min(
    dx !== 0 ? halfW / Math.abs(dx) : Infinity,
    dy !== 0 ? halfH / Math.abs(dy) : Infinity,
  );
  dx *= t;
  dy *= t;
  return { x: width / 2 + dx, y: height / 2 + dy, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}
