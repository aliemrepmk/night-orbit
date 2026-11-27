import { CONFIG } from '../config';

/**
 * The pixel ratio the game renders at (M10, PLAN.md §11): the screen's device pixel ratio,
 * capped (`CONFIG.render.maxPixelRatio`, see STATUS.md §5 decision 13), times the player's
 * RENDER RESOLUTION setting. Never below `minPixelRatio`, so 50 % on a non-Retina screen still
 * leaves a readable image. Bad inputs (0, NaN) fall back to 1× screen, full scale.
 */
export function renderPixelRatio(
  devicePixelRatio: number,
  scale: number,
  r: { maxPixelRatio: number; minPixelRatio: number } = CONFIG.render,
): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const k = Number.isFinite(scale) && scale > 0 ? Math.min(scale, 1) : 1;
  return Math.max(r.minPixelRatio, Math.min(dpr, r.maxPixelRatio) * k);
}
