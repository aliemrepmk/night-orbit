import { describe, expect, it } from 'vitest';
import { MAP } from '../world/MapData';
import { compass, describePlace, landmarks } from './landmarks';

const marks = landmarks(MAP);
const team = { x: 0, z: 0 };

describe('landmark callouts (M8+ Phase F)', () => {
  it('knows the named places of the valley', () => {
    const names = marks.map((m) => m.name);
    for (const n of [
      'the barn',
      'the clinic',
      'the bridge',
      'the fuel depot',
      'the sawmill',
      'the quarry',
    ])
      expect(names).toContain(n);
  });

  it('gives compass points with north up (−z) and east right (+x)', () => {
    expect(compass(0, 0, 0, -100)).toBe('north');
    expect(compass(0, 0, 100, 0)).toBe('east');
    expect(compass(0, 0, 0, 100)).toBe('south');
    expect(compass(0, 0, -100, -100)).toBe('north-west');
  });

  it('says "at" when on top of a landmark, "north of" near one, else from Ridgeback', () => {
    const barn = MAP.buildings.find((b) => b.id === 'barn')!;
    expect(describePlace(marks, barn.pos[0] + 5, barn.pos[1], team)).toBe('at the barn');
    expect(describePlace(marks, barn.pos[0], barn.pos[1] - 120, team)).toBe('north of the barn');
    expect(describePlace(marks, 0, 790, { x: 0, z: 0 })).toBe('to the south of Ridgeback');
  });
});
