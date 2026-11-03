import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { Gunship } from './Gunship';
import { Sensor, type HeightSource } from './Sensor';

const DT = 1 / 60;
const VIEW_H = 1000;
const NO_JITTER = { ...CONFIG.sensor, jitterDeg: 0 };

const flat: HeightSource = { heightAt: () => 0 };
const hilly: HeightSource = { heightAt: (x, z) => 20 * Math.sin(x / 90) * Math.cos(z / 70) };

function setup(angle = 0, ground: HeightSource = flat) {
  const gunship = new Gunship();
  gunship.angle = angle;
  gunship.update(0);
  const sensor = new Sensor(gunship, ground, 16 / 9, NO_JITTER);
  return { gunship, sensor };
}

/** Screen position in pixels (relative to the center) of a world point, using the current camera. */
function toScreenPx(sensor: Sensor, p: Vector3): { x: number; y: number } {
  const ndc = p.clone().project(sensor.camera);
  return { x: (ndc.x * VIEW_H * sensor.camera.aspect) / 2, y: (-ndc.y * VIEW_H) / 2 };
}

const ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];

describe('Sensor aiming', () => {
  it.each(ANGLES)('the camera looks exactly at the aim point (orbit angle %f)', (angle) => {
    const { sensor } = setup(angle, hilly);
    const dir = new Vector3();
    sensor.camera.getWorldDirection(dir);
    const toAim = sensor.aim.clone().sub(sensor.camera.position).normalize();
    expect(dir.dot(toAim)).toBeCloseTo(1, 9);
  });

  it.each(ANGLES)(
    'mouse right moves the ground point one-to-one to the screen right (angle %f)',
    (angle) => {
      const { sensor } = setup(angle);
      const before = sensor.aim.clone();
      sensor.slew(100, 0, VIEW_H);
      // Using the camera from BEFORE the slew, the new aim should appear 100 px right of center.
      const s = toScreenPx(sensor, sensor.aim);
      expect(s.x).toBeCloseTo(100, -1); // within ±5 px
      expect(Math.abs(s.y)).toBeLessThan(5);
      expect(sensor.aim.distanceTo(before)).toBeGreaterThan(0);
    },
  );

  it.each(ANGLES)('mouse up moves the view away from the aircraft (angle %f)', (angle) => {
    const { gunship, sensor } = setup(angle);
    const horiz = (p: Vector3) => Math.hypot(p.x - gunship.position.x, p.z - gunship.position.z);
    const before = horiz(sensor.aim);
    sensor.slew(0, -100, VIEW_H);
    expect(horiz(sensor.aim)).toBeGreaterThan(before);
    const s = toScreenPx(sensor, sensor.aim);
    // Perspective makes this approximate; within 15 %.
    expect(-s.y).toBeGreaterThan(85);
    expect(-s.y).toBeLessThan(115);
    expect(Math.abs(s.x)).toBeLessThan(5);
  });

  it('slews less ground per pixel when zoomed in', () => {
    const wide = setup().sensor;
    const before = wide.aim.clone();
    wide.slew(100, 0, VIEW_H);
    const wideMove = wide.aim.distanceTo(before);

    const narrow = setup().sensor;
    narrow.selectWeapon('25');
    for (let i = 0; i < 120; i++) narrow.update(DT);
    narrow.syncCamera();
    const before2 = narrow.aim.clone();
    narrow.slew(100, 0, VIEW_H);
    expect(narrow.aim.distanceTo(before2)).toBeLessThan(wideMove / 4);
  });

  it('never moves the aim beyond the gimbal limit', () => {
    const { gunship, sensor } = setup();
    for (let i = 0; i < 50; i++) sensor.slew(5000, -3000, VIEW_H);
    const d = Math.hypot(sensor.aim.x - gunship.center.x, sensor.aim.z - gunship.center.z);
    expect(d).toBeLessThanOrEqual(CONFIG.sensor.gimbalRadius + 1e-6);
  });

  it('keeps the aim point on the ground surface', () => {
    const { sensor } = setup(0, hilly);
    sensor.slew(137, -59, VIEW_H);
    expect(sensor.aim.y).toBeCloseTo(hilly.heightAt(sensor.aim.x, sensor.aim.z), 9);
  });

  it('is ground-stabilized: the aim stays put while the aircraft orbits', () => {
    const { gunship, sensor } = setup(0, hilly);
    sensor.slew(80, 40, VIEW_H);
    const locked = sensor.aim.clone();
    for (let i = 0; i < 60 * 45; i++) {
      gunship.update(DT);
      sensor.update(DT);
    }
    sensor.syncCamera();
    expect(sensor.aim.distanceTo(locked)).toBeLessThan(1e-9);
    const dir = new Vector3();
    sensor.camera.getWorldDirection(dir);
    expect(dir.dot(sensor.aim.clone().sub(sensor.camera.position).normalize())).toBeCloseTo(1, 9);
  });

  it('zooms smoothly to the selected weapon FOV', () => {
    const { sensor } = setup();
    expect(sensor.selectWeapon('25')).toBe(true);
    expect(sensor.selectWeapon('25')).toBe(false);
    sensor.update(DT);
    expect(sensor.fovDeg).toBeLessThan(28);
    expect(sensor.fovDeg).toBeGreaterThan(5);
    for (let i = 0; i < 60; i++) sensor.update(DT);
    expect(sensor.fovDeg).toBeCloseTo(5, 2);
    sensor.syncCamera();
    expect(sensor.camera.fov).toBeCloseTo(5, 2);
  });

  it('looks out the left side of a left-hand orbit', () => {
    const { sensor } = setup(0.7);
    expect(sensor.relativeAzimuthDeg).toBeCloseTo(-90, 0);
    expect(sensor.depressionDeg).toBeCloseTo((Math.atan2(700, 900) * 180) / Math.PI, 0);
  });
});
