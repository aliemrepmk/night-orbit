import { describe, expect, it } from 'vitest';
import { CONFIG } from './config';
import { WEAPONS, WEAPON_ORDER } from './gunship/weaponDefs';

// M0 smoke test plus sanity rules that protect us from bad balancing edits.
describe('config sanity', () => {
  it('runs the simulation at 60 Hz', () => {
    expect(CONFIG.loop.step).toBeCloseTo(1 / 60);
  });

  it('keeps the gimbal limit inside the orbit so the camera never looks straight down or backwards', () => {
    expect(CONFIG.sensor.gimbalRadius).toBeLessThan(CONFIG.orbit.radius);
  });

  it('generates terrain larger than the playable map plus the orbit, so map edges stay hidden', () => {
    expect(CONFIG.terrain.size / 2).toBeGreaterThanOrEqual(
      CONFIG.map.size / 2 + CONFIG.orbit.radius / 2,
    );
  });

  it('orders weapons from narrowest to widest field of view', () => {
    const fovs = WEAPON_ORDER.map((id) => WEAPONS[id].fovDeg);
    expect([...fovs].sort((a, b) => a - b)).toEqual(fovs);
  });
});
