import { describe, expect, it } from 'vitest';
import { ORDNANCE } from '../gunship/airSupportDefs';
import { WEAPONS } from '../gunship/weaponDefs';
import { Explosives, TANK_BLAST, type ExplosiveDef } from './explosives';
import { MAP } from './MapData';

const cfg = { tankHp: 250, fuse: 0.3, burnSeconds: 90 };
const tank = (id: string, x: number): ExplosiveDef => ({ id, x, y: 3, z: 0, radius: 4 });

function run(e: Explosives, seconds: number, onBlast: (id: string) => void = () => {}) {
  for (let t = 0; t < seconds; t += 0.05) e.update(0.05, (_, def) => onBlast(def.id));
}

describe('fuel depot (M8+ Phase D)', () => {
  it('a 105 mm hit sets a tank off after a short fuse, once', () => {
    const e = new Explosives([tank('a', 0)], cfg);
    e.hit(2, 0, WEAPONS['105']);
    expect(e.stateOf('a')).toBe('primed');
    const blasts: string[] = [];
    run(e, 0.2, (id) => blasts.push(id));
    expect(blasts).toEqual([]);
    run(e, 0.3, (id) => blasts.push(id));
    expect(blasts).toEqual(['a']);
    run(e, 5, (id) => blasts.push(id));
    expect(blasts).toEqual(['a']);
    expect(e.stateOf('a')).toBe('burning');
  });

  it('the 25 mm needs several hits; a miss far away does nothing', () => {
    const e = new Explosives([tank('a', 0)], cfg);
    e.hit(60, 0, WEAPONS['105']);
    expect(e.stateOf('a')).toBe('intact');
    e.hit(4.5, 0, WEAPONS['25']);
    e.hit(4.5, 0, WEAPONS['25']);
    expect(e.stateOf('a')).toBe('intact');
    for (let i = 0; i < 4; i++) e.hit(4.5, 0, WEAPONS['25']);
    expect(e.stateOf('a')).toBe('primed');
  });

  it('a tank going up sets off its neighbors (the blast is an impact too)', () => {
    const e = new Explosives([tank('a', 0), tank('b', 20), tank('c', 300)], cfg);
    e.hit(0, 0, WEAPONS['105']);
    run(e, 0.5, () => e.hit(0, 0, TANK_BLAST));
    expect(e.stateOf('b')).not.toBe('intact'); // primed or already burning
    expect(e.stateOf('c')).toBe('intact');
  });

  it('burns for a while, dying down, then is burnt out', () => {
    const e = new Explosives([tank('a', 0)], cfg);
    e.hit(0, 0, ORDNANCE.bomb);
    run(e, 1);
    const early = [...e.burning()][0].intensity;
    run(e, 70);
    const late = [...e.burning()][0].intensity;
    expect(late).toBeLessThan(early);
    run(e, 30);
    expect([...e.burning()]).toHaveLength(0);
    expect(e.stateOf('a')).toBe('burnt');
  });

  it('the map has a three-tank depot near the crossroads', () => {
    const tanks = MAP.buildings.filter((b) => b.explosive);
    expect(tanks).toHaveLength(3);
    for (const t of tanks) {
      const [cx, cz] = MAP.zones.crossroads.center;
      expect(Math.hypot(t.pos[0] - cx, t.pos[1] - cz)).toBeLessThan(MAP.zones.crossroads.radius);
    }
    // A tank fireball is huge but smaller than the bomb's blast.
    expect(TANK_BLAST.blastRadius).toBeLessThan(ORDNANCE.bomb.blastRadius);
    expect(TANK_BLAST.fx.flashSize).toBeGreaterThan(ORDNANCE.bomb.fx.flashSize);
  });
});
