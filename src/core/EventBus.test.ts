import { describe, expect, it } from 'vitest';
import { EventBus } from './EventBus';

type TestEvents = {
  shot: { weapon: string };
  impact: { x: number };
};

describe('EventBus', () => {
  it('delivers payloads to every subscriber of that event only', () => {
    const bus = new EventBus<TestEvents>();
    const shots: string[] = [];
    const impacts: number[] = [];
    bus.on('shot', (e) => shots.push(e.weapon));
    bus.on('shot', (e) => shots.push(e.weapon + '!'));
    bus.on('impact', (e) => impacts.push(e.x));
    bus.emit('shot', { weapon: '25' });
    expect(shots).toEqual(['25', '25!']);
    expect(impacts).toEqual([]);
  });

  it('unsubscribes, even from inside a handler during delivery', () => {
    const bus = new EventBus<TestEvents>();
    let calls = 0;
    const off = bus.on('impact', () => {
      calls++;
      off();
    });
    let other = 0;
    bus.on('impact', () => other++);
    bus.emit('impact', { x: 1 });
    bus.emit('impact', { x: 2 });
    expect(calls).toBe(1);
    expect(other).toBe(2);
  });

  it('ignores events nobody listens to, and clear() removes all handlers', () => {
    const bus = new EventBus<TestEvents>();
    expect(() => bus.emit('shot', { weapon: '40' })).not.toThrow();
    let n = 0;
    bus.on('shot', () => n++);
    bus.clear();
    bus.emit('shot', { weapon: '40' });
    expect(n).toBe(0);
  });
});
