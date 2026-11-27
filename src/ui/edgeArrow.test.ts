import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { edgeArrow, type EdgeInsets } from './edgeArrow';

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

  describe('clear of the HUD text (M10 regression: labels sat on the top-right telemetry)', () => {
    const I: EdgeInsets = { top: 108, right: 36, bottom: 56, left: 36 };
    const K = {
      topRight: [200, 0] as const,
      bottomLeft: [440, 250] as const,
      bottomRight: [190, 84] as const,
    };

    it('runs below the top text row and above the bottom one', () => {
      const up = edgeArrow(0, 3, false, W, H, I, K)!;
      expect(up.y).toBeCloseTo(108);
      const down = edgeArrow(0, -3, false, W, H, I, K)!;
      expect(down.y).toBeCloseTo(H - 56);
    });

    it('slides a top-right arrow away from the corner, so its label fits on screen', () => {
      // A friendly up and a little right: before, the arrow sat in the top-right corner text.
      const a = edgeArrow(1.2, 3, false, W, H, I, K)!;
      expect(a.y).toBeCloseTo(108);
      expect(a.x).toBeLessThanOrEqual(W - 200 + 1e-6);
    });

    it('never lands in the bottom corner blocks (gun status, clock)', () => {
      for (let k = 0; k < 360; k += 3) {
        const t = (k * Math.PI) / 180;
        const a = edgeArrow(4 * Math.cos(t), 4 * Math.sin(t), false, W, H, I, K)!;
        const inBL = a.x < 440 - 1e-6 && a.y > H - 250 + 1e-6;
        const inBR = a.x > W - 190 + 1e-6 && a.y > H - 84 + 1e-6;
        expect(inBL || inBR, `angle ${k}`).toBe(false);
        expect(a.y).toBeGreaterThanOrEqual(108 - 1e-6);
      }
    });

    it('still points straight at the friendly after sliding', () => {
      const a = edgeArrow(-3, -1.5, false, W, H, I, K)!; // down-left, into the gun block
      const plain = edgeArrow(-3, -1.5, false, W, H, I)!;
      expect(a.angle).toBeCloseTo(plain.angle, 9);
      expect(a.x === plain.x && a.y === plain.y).toBe(false);
    });

    it('the shipped config clears the HUD blocks the same way', () => {
      expect(CONFIG.hud.arrowInsets.top).toBeGreaterThanOrEqual(100);
      expect(CONFIG.hud.arrowKeepOut.bottomLeft[1]).toBeGreaterThan(CONFIG.hud.arrowInsets.bottom);
    });
  });
});
