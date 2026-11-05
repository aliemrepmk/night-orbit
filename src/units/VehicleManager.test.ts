import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import { createRng } from '../core/rng';
import { UnitManager, type UnitsConfig } from './UnitManager';
import type { VehicleConfig } from './Vehicle';
import { VehicleManager } from './VehicleManager';
import { VEHICLES } from './vehicleDefs';

const DT = 1 / 60;
const flat = () => 0;
/** Ridgeback holds still at the origin and doesn't shoot back. */
const STILL: UnitsConfig = {
  ...CONFIG,
  ridgeback: { ...CONFIG.ridgeback, speed: 0, fireRange: 0 },
};
// A road from 600 m east straight toward the team, ending 250 m from it.
const ROAD = new Path([
  { x: 600, z: 0 },
  { x: 250, z: 0 },
]);

function rig(cfg: VehicleConfig = CONFIG.vehicles) {
  const bus = new EventBus<GameEvents>();
  const units = new UnitManager(
    flat,
    bus,
    createRng(1),
    [
      { x: 0, z: 0 },
      { x: 0, z: -2000 },
    ],
    {
      cfg: STILL,
    },
  );
  const vm = new VehicleManager(units, flat, bus, createRng(2), cfg);
  const kills: string[] = [];
  bus.on('unitKilled', (e) => kills.push(`${e.kind}:${e.by}`));
  const step = (s: number) => {
    for (let k = 0; k < Math.round(s / DT); k++) {
      units.update(DT);
      vm.update(DT);
    }
  };
  return { bus, units, vm, kills, step };
}

describe('VehicleManager', () => {
  it('a truck drives to the end of its road, unloads 6–8 soldiers one by one, then parks', () => {
    const { units, vm, step } = rig();
    const truck = vm.spawn(VEHICLES.truck, ROAD)!;
    const cargo = truck.cargo;
    expect(cargo).toBeGreaterThanOrEqual(6);
    expect(cargo).toBeLessThanOrEqual(8);
    for (let k = 0; k < 60 * 60 && !truck.arrived; k++) step(DT);
    expect(truck.arrived).toBe(true);
    step(1);
    expect(truck.state).toBe('unloading');
    expect(units.enemies.length).toBeLessThan(cargo); // still climbing out
    step(10);
    expect(truck.state).toBe('parked');
    expect(units.enemies).toHaveLength(cargo);
    for (const e of units.enemies) {
      expect(e.position.distanceTo(truck.position)).toBeLessThan(40); // they got out right here
      expect(e.home.x).toBe(600); // a broken soldier runs back up the road
    }
  });

  it('a wreck blocks the road: the truck behind stops short of it and unloads early', () => {
    const { vm, step } = rig();
    const lead = vm.spawn(VEHICLES.truck, ROAD, 30)!;
    const next = vm.spawn(VEHICLES.truck, ROAD, 0)!;
    step(8);
    lead.takeDamage(1e4, '105', lead.position);
    step(10);
    expect(lead.state).toBe('destroyed');
    expect(next.arrived).toBe(false);
    expect(next.state === 'unloading' || next.state === 'parked').toBe(true);
    const gap = next.position.distanceTo(lead.position);
    expect(gap).toBeGreaterThan(5); // didn't drive into it
    expect(gap).toBeLessThanOrEqual(CONFIG.vehicles.blockDistance + 1);
  });

  it('vehicles in a convoy keep their distance instead of driving through each other', () => {
    const { vm, step } = rig();
    const a = vm.spawn(VEHICLES.truck, ROAD, 20)!;
    const b = vm.spawn(VEHICLES.technical, ROAD, 0)!;
    let minGap = Infinity;
    for (let k = 0; k < 60; k++) {
      step(1);
      minGap = Math.min(minGap, a.position.distanceTo(b.position));
    }
    expect(minGap).toBeGreaterThan(5);
  });

  it('a technical stops at its spot and its gun hurts the team badly (heavy tracers)', () => {
    const { units, vm, step } = rig();
    const tech = vm.spawn(VEHICLES.technical, ROAD)!;
    step(40);
    expect(tech.state).toBe('stopped');
    const before = units.team.value;
    step(3);
    const lost = before - units.team.value;
    // ~250 m of 300 m range: dps 3 × accuracy ≈ 0.31 → ~0.9/s.
    expect(lost).toBeGreaterThan(2);
    expect(units.tracers.some((t) => t.active && t.heavy)).toBe(true);
  });

  it('a technical out of range does not hurt the team', () => {
    const { units, vm, step } = rig();
    const far = new Path([
      { x: 900, z: 0 },
      { x: 500, z: 0 },
    ]);
    vm.spawn(VEHICLES.technical, far);
    step(60);
    expect(units.team.value).toBe(CONFIG.ridgeback.health);
  });

  it('an APC fires on the move; a technical only once stopped', () => {
    const near = new Path([
      { x: 290, z: 0 },
      { x: 200, z: 0 },
    ]);
    const a = rig();
    const apc = a.vm.spawn(VEHICLES.apc, near)!;
    a.step(2);
    expect(apc.state).toBe('driving');
    expect(a.units.team.value).toBeLessThan(CONFIG.ridgeback.health);
    const b = rig();
    const tech = b.vm.spawn(VEHICLES.technical, near)!;
    b.step(1);
    expect(tech.state).toBe('driving');
    expect(b.units.team.value).toBe(CONFIG.ridgeback.health);
  });

  it('soldiers inside a destroyed truck either bail out and run, or die with it', () => {
    const { units, vm, kills, step } = rig();
    const truck = vm.spawn(VEHICLES.truck, ROAD)!;
    const cargo = truck.cargo;
    step(3);
    truck.takeDamage(1e4, '105', truck.position);
    step(DT);
    const bailed = units.enemies.filter((e) => e.alive);
    const died = kills.filter((k) => k === 'infantry:105').length;
    expect(bailed.length + died).toBe(cargo);
    expect(bailed.every((e) => e.state === 'fleeing')).toBe(true);
    expect(truck.cargo).toBe(0);
    step(5);
    expect(truck.burning).toBe(true);
  });

  it('recycles empty parked trucks and old wrecks, never a vehicle still in the fight', () => {
    const { vm, step } = rig({ ...CONFIG.vehicles, maxVehicles: 2 });
    const a = vm.spawn(VEHICLES.truck, ROAD)!;
    const b = vm.spawn(VEHICLES.technical, ROAD, 40)!;
    expect(vm.spawn(VEHICLES.truck, ROAD)).toBeNull(); // both busy
    b.takeDamage(1e4, '105', new Vector3());
    expect(vm.spawn(VEHICLES.truck, ROAD)).toBeNull(); // the wreck is too fresh
    step(60);
    expect(a.state).toBe('parked');
    expect(vm.spawn(VEHICLES.apc, ROAD)).toBe(a); // the empty truck goes first
    expect(a.def.type).toBe('apc');
  });
});
