import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../core/rng';
import { AirSupport, footprint, footprintDistance } from './AirSupport';
import { ORDNANCE, STRIKES } from './airSupportDefs';
import type { Ordnance } from './weaponDefs';

const DT = 1 / 60;

function run(air: AirSupport, seconds: number) {
  const hits: { t: number; x: number; z: number; o: Ordnance }[] = [];
  for (let k = 0; k < Math.round(seconds / DT); k++) {
    air.update(DT, (x, z, o) => hits.push({ t: air.time, x, z, o }));
  }
  return hits;
}

describe('AirSupport', () => {
  it('T cycles off → gun run → bomb → off', () => {
    const air = new AirSupport(createRng(1));
    expect(air.mode).toBeNull();
    expect(air.cycleMode()).toBe('gunrun');
    expect(air.cycleMode()).toBe('bomb');
    expect(air.cycleMode()).toBeNull();
  });

  it('does nothing when no strike is selected', () => {
    const air = new AirSupport(createRng(1));
    expect(air.call(0, 0)).toBeNull();
    expect(run(air, 30)).toHaveLength(0);
  });

  it('lands a gun run after its delay: impacts evenly along the strip, in order, over walkTime', () => {
    const def = STRIKES.gunrun;
    const air = new AirSupport(createRng(2));
    air.cycleMode();
    air.axis = Math.PI / 2; // flying east
    expect(air.call(100, -50)).toBe(def);
    expect(air.mode).toBeNull(); // back to the guns
    const hits = run(air, def.delay + def.walkTime + 1);
    expect(hits).toHaveLength(def.impacts);
    expect(hits[0].t).toBeCloseTo(def.delay, 1);
    expect(hits[hits.length - 1].t).toBeCloseTo(def.delay + def.walkTime, 1);
    for (let i = 0; i < hits.length; i++) {
      expect(hits[i].o).toBe(def.ordnance);
      // Along the axis (x): evenly spaced from the near end to the far end.
      const expected = 100 + (i / (def.impacts - 1) - 0.5) * def.stripLength;
      expect(hits[i].x).toBeCloseTo(expected, 5);
      // Sideways (z): within the strip width.
      expect(Math.abs(hits[i].z + 50)).toBeLessThanOrEqual(def.stripWidth / 2);
    }
  });

  it('lands a bomb once, exactly on the marked point, after its delay', () => {
    const def = STRIKES.bomb;
    const air = new AirSupport(createRng(3));
    air.cycleMode();
    air.cycleMode();
    air.call(-20, 40);
    expect(run(air, def.delay - 0.1)).toHaveLength(0);
    const hits = run(air, 0.2);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ x: -20, z: 40, o: def.ordnance });
  });

  it('enforces the cooldown per strike, with no limit on the number of calls', () => {
    const air = new AirSupport(createRng(4));
    air.mode = 'gunrun';
    air.call(0, 0);
    expect(air.ready('gunrun')).toBe(false);
    expect(air.ready('bomb')).toBe(true); // separate cooldowns
    air.mode = 'gunrun';
    expect(air.call(0, 0)).toBeNull(); // still cooling down
    expect(air.mode).toBe('gunrun'); // stays in aiming mode
    run(air, STRIKES.gunrun.cooldown - 1);
    expect(air.cooldownLeft('gunrun')).toBeCloseTo(1, 1);
    run(air, 1.1);
    for (let k = 0; k < 5; k++) {
      air.mode = 'gunrun';
      expect(air.call(0, 0)).not.toBeNull();
      run(air, STRIKES.gunrun.cooldown + 0.1);
    }
  });

  it('reports strikes inbound with their time to impact, then forgets them', () => {
    const air = new AirSupport(createRng(5));
    air.mode = 'bomb';
    air.call(0, 0);
    run(air, 5);
    const [first] = air.inbound();
    expect(first.strike.callsign).toBe('SABRE 2-2');
    expect(first.eta).toBeCloseTo(STRIKES.bomb.delay - 5, 1);
    run(air, STRIKES.bomb.delay);
    expect(air.inbound()).toHaveLength(0);
  });

  it('flies the jet over the target around the impacts and drops it afterwards', () => {
    const def = STRIKES.gunrun;
    const air = new AirSupport(createRng(6));
    air.mode = 'gunrun';
    air.axis = 0;
    air.call(0, 0);
    const p = new Vector3();
    expect(air.jetPosition(air.jets[0], 0, p)).toBeNull(); // still far off
    run(air, def.delay + def.passOffset);
    const at = air.jetPosition(air.jets[0], 10, p)!;
    expect(Math.hypot(at.x, at.z)).toBeLessThan(def.jetSpeed * 0.05);
    expect(at.y).toBeCloseTo(10 + def.jetAltitude, 0);
    run(air, 6);
    expect(air.jets).toHaveLength(0);
  });

  it('rotates the gun-run axis and keeps it within −π..π', () => {
    const air = new AirSupport(createRng(7));
    for (let k = 0; k < 30; k++) air.rotateAxis(0.5);
    expect(Math.abs(air.axis)).toBeLessThanOrEqual(Math.PI);
  });
});

describe('footprint / footprintDistance', () => {
  it('outlines the gun-run strip along the axis', () => {
    const pts = footprint(STRIKES.gunrun, 0, 0, Math.PI / 2);
    expect(pts).toHaveLength(4);
    for (const p of pts) {
      expect(Math.abs(p.x)).toBeCloseTo(STRIKES.gunrun.stripLength / 2);
      expect(Math.abs(p.z)).toBeCloseTo(STRIKES.gunrun.stripWidth / 2);
    }
  });

  it('outlines the bomb blast as a circle', () => {
    for (const p of footprint(STRIKES.bomb, 5, 5, 0, 16)) {
      expect(Math.hypot(p.x - 5, p.z - 5)).toBeCloseTo(STRIKES.bomb.ordnance.blastRadius);
    }
  });

  it('measures distance to the strip (0 inside) and to the bomb point', () => {
    const g = STRIKES.gunrun; // 60 × 8, flying east
    const e = Math.PI / 2;
    expect(footprintDistance(g, 0, 0, e, 10, 2)).toBe(0);
    expect(footprintDistance(g, 0, 0, e, 0, 24)).toBeCloseTo(20);
    expect(footprintDistance(g, 0, 0, e, 40, 0)).toBeCloseTo(10);
    expect(footprintDistance(STRIKES.bomb, 0, 0, 0, 30, 40)).toBeCloseTo(50);
  });

  it('flags a friendly inside the danger-close distance of the footprint', () => {
    const g = STRIKES.gunrun;
    const near = footprintDistance(g, 0, 0, 0, g.stripWidth / 2 + 10, 0);
    const far = footprintDistance(g, 0, 0, 0, g.stripWidth / 2 + 40, 0);
    expect(near).toBeLessThan(g.dangerClose);
    expect(far).toBeGreaterThan(g.dangerClose);
  });
});

describe('strike data', () => {
  it('every strike makes sense (delay, cooldown, radii) and is in the ordnance table', () => {
    for (const s of Object.values(STRIKES)) {
      expect(s.delay).toBeGreaterThan(0);
      expect(s.cooldown).toBeGreaterThan(s.delay);
      expect(s.ordnance.innerRadius).toBeLessThan(s.ordnance.blastRadius);
      expect(s.ordnance.dangerClose).toBeGreaterThan(s.ordnance.blastRadius);
      expect(s.dangerClose).toBeGreaterThanOrEqual(s.ordnance.dangerClose);
      expect(ORDNANCE[s.id]).toBe(s.ordnance);
    }
    // The bomb is slower to arrive and bigger than anything the gunship has.
    expect(STRIKES.bomb.delay).toBeGreaterThan(STRIKES.gunrun.delay);
    expect(STRIKES.bomb.ordnance.blastRadius).toBeGreaterThan(ORDNANCE['105'].blastRadius);
  });
});
