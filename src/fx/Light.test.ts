import { describe, expect, it } from 'vitest';
import { HEAT } from './Heat';
import { ALBEDO, GLOW, groundAlbedo, signature } from './Light';

describe('night-vision light table', () => {
  it('keeps every albedo and glow within 0–1', () => {
    for (const [name, v] of [...Object.entries(ALBEDO), ...Object.entries(GLOW)]) {
      expect(v, name).toBeGreaterThanOrEqual(0);
      expect(v, name).toBeLessThanOrEqual(1);
    }
  });

  it('makes vegetation bright and bare soil, asphalt and water dark (near-IR reflectance)', () => {
    expect(ALBEDO.tree).toBeGreaterThan(ALBEDO.grass);
    expect(ALBEDO.grass).toBeGreaterThan(ALBEDO.soilBare);
    expect(ALBEDO.soilBare).toBeGreaterThan(ALBEDO.road);
    expect(ALBEDO.water).toBe(Math.min(...Object.values(ALBEDO)));
  });

  it('builds signatures with no glow by default', () => {
    expect(signature(0.5, 0.3)).toEqual({ heat: 0.5, albedo: 0.3, glow: 0 });
  });
});

describe('ground albedo', () => {
  it('turns warm bare soil dark and cool grass bright, so fields swap between sensors', () => {
    expect(groundAlbedo(HEAT.soilMax)).toBeCloseTo(ALBEDO.soilBare);
    expect(groundAlbedo(HEAT.soilMin)).toBeCloseTo(ALBEDO.grass);
    expect(groundAlbedo(0.1)).toBeGreaterThan(groundAlbedo(0.15));
  });

  it('clamps heats outside the soil range', () => {
    expect(groundAlbedo(-1)).toBeCloseTo(ALBEDO.grass);
    expect(groundAlbedo(2)).toBeCloseTo(ALBEDO.soilBare);
  });
});
