import { describe, expect, it } from 'vitest';
import { edgeArrow } from './edgeArrow';

const W = 1600;
const H = 900;
const M = 30;

describe('edgeArrow (off-screen friendly marker)', () => {
  it('shows nothing while the friendly is on screen', () => {
    expect(edgeArrow(0, 0, false, W, H, M)).toBeNull();
    expect(edgeArrow(0.99, -0.99, false, W, H, M)).toBeNull();
  });

  it('sits on the edge toward the friendly, `margin` px inside, pointing at it', () => {
    const right = edgeArrow(3, 0, false, W, H, M)!;
    expect(right.x).toBeCloseTo(W - M);
    expect(right.y).toBeCloseTo(H / 2);
    expect(right.angle).toBeCloseTo(0);
    const up = edgeArrow(0, 2, false, W, H, M)!; // +y in NDC is up the screen
    expect(up.x).toBeCloseTo(W / 2);
    expect(up.y).toBeCloseTo(M);
    expect(up.angle).toBeCloseTo(-90);
  });

  it('slides along the edge in proportion: a corner-ish direction hits the nearer edge', () => {
    const a = edgeArrow(2, 1, false, W, H, M)!; // pixels: (1600, -450) from center
    expect(a.x).toBeCloseTo(W - M);
    expect(a.y).toBeGreaterThan(M);
    expect(a.y).toBeLessThan(H / 2);
  });

  it('mirrors a friendly behind the camera (its projection is flipped)', () => {
    const a = edgeArrow(0.2, 0.1, true, W, H, M)!;
    expect(a).not.toBeNull();
    expect(a.x).toBeLessThan(W / 2); // projected right → really to the left
    expect(a.y).toBeGreaterThan(H / 2); // projected up → really below
  });

  it('always stays inside the screen', () => {
    for (let k = 0; k < 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      const a = edgeArrow(5 * Math.cos(t), 5 * Math.sin(t), k % 2 === 0, W, H, M)!;
      expect(a.x).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.x).toBeLessThanOrEqual(W - M + 1e-6);
      expect(a.y).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.y).toBeLessThanOrEqual(H - M + 1e-6);
    }
  });
});
