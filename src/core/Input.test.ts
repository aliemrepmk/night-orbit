import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input } from './Input';

/** A stand-in `document` with the two properties Input reads. */
class FakeDocument extends EventTarget {
  hidden = false;
  pointerLockElement: unknown = null;
}

describe('Input focus loss (M10 regression: drag-to-aim kept playing in a hidden tab)', () => {
  let win: EventTarget;
  let doc: FakeDocument;

  beforeEach(() => {
    win = new EventTarget();
    doc = new FakeDocument();
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);
  });
  afterEach(() => vi.unstubAllGlobals());

  function input() {
    const i = new Input({} as HTMLElement);
    const lost = vi.fn();
    const hidden = vi.fn();
    i.onFocusLost = lost;
    i.onHidden = hidden;
    return { i, lost, hidden };
  }

  it('reports focus loss when the window blurs, and drops held keys and the trigger', () => {
    const { i, lost } = input();
    win.dispatchEvent(Object.assign(new Event('keydown'), { code: 'KeyW', repeat: false }));
    win.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0 }));
    win.dispatchEvent(new Event('blur'));
    expect(lost).toHaveBeenCalledTimes(1);
    expect(i.isHeld('KeyW')).toBe(false);
    expect(i.isFireHeld).toBe(false);
  });

  it('reports focus loss and hidden when the tab is hidden; only "shown" when it comes back', () => {
    const { lost, hidden } = input();
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(lost).toHaveBeenCalledTimes(1);
    expect(hidden).toHaveBeenLastCalledWith(true);
    doc.hidden = false;
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(lost).toHaveBeenCalledTimes(1);
    expect(hidden).toHaveBeenLastCalledWith(false);
  });
});
