import { describe, expect, it } from 'vitest';
import { TriggerGate } from './triggerGate';

describe('TriggerGate (M8+ Phase A: the guns stay quiet while aiming a strike)', () => {
  it('gives the guns the trigger when no strike is being aimed', () => {
    const g = new TriggerGate();
    expect(g.frame(false, true, 1)).toEqual({ gunHeld: true, gunClicks: 1, strikeClicks: 0 });
    expect(g.frame(false, false, 0)).toEqual({ gunHeld: false, gunClicks: 0, strikeClicks: 0 });
  });

  it('while aiming, presses call the strike and never fire the guns (held or clicked)', () => {
    const g = new TriggerGate();
    expect(g.frame(true, true, 1)).toEqual({ gunHeld: false, gunClicks: 0, strikeClicks: 1 });
    expect(g.frame(true, true, 0)).toEqual({ gunHeld: false, gunClicks: 0, strikeClicks: 0 });
  });

  it('regression: the click that calls a strike does not keep firing the 25 mm while held', () => {
    const g = new TriggerGate();
    g.frame(true, true, 1); // the call: aiming ends on this click
    for (let i = 0; i < 30; i++) {
      // the button is still down for half a second after the strike was called
      expect(g.frame(false, true, 0).gunHeld).toBe(false);
    }
    g.frame(false, false, 0); // released
    expect(g.frame(false, true, 1)).toEqual({ gunHeld: true, gunClicks: 1, strikeClicks: 0 });
  });

  it('locks the guns when aiming ends with the button down (T or a weapon key)', () => {
    const g = new TriggerGate();
    g.frame(true, true, 0);
    expect(g.frame(false, true, 0).gunHeld).toBe(false);
    expect(g.frame(false, false, 0).gunHeld).toBe(false);
    expect(g.frame(false, true, 0).gunHeld).toBe(true);
  });

  it('a click while the strike is rearming does nothing to the guns', () => {
    const g = new TriggerGate();
    // The strike isn't ready, but the click still belongs to air support.
    const out = g.frame(true, false, 1);
    expect(out.gunClicks).toBe(0);
    expect(out.gunHeld).toBe(false);
  });

  it('a quick click already released after the lock frees the guns at once', () => {
    const g = new TriggerGate();
    g.frame(true, true, 1);
    expect(g.frame(false, false, 1)).toEqual({ gunHeld: false, gunClicks: 1, strikeClicks: 0 });
  });

  it('reset forgets the lock', () => {
    const g = new TriggerGate();
    g.frame(true, true, 0);
    g.reset();
    expect(g.frame(false, true, 0).gunHeld).toBe(true);
  });
});
