import { describe, expect, it } from 'vitest';
import { ScreenFlow, type ScreenAction } from './screenFlow';

function run(...actions: ScreenAction[]): ScreenFlow {
  const f = new ScreenFlow();
  for (const a of actions) f.dispatch(a);
  return f;
}

describe('ScreenFlow', () => {
  it('title → briefing → playing once aiming starts', () => {
    const f = new ScreenFlow();
    expect(f.state).toBe('title');
    expect(f.dispatch('begin')).toBe('briefing');
    expect(f.dispatch('lockGained')).toBe('playing');
    expect(f.playing).toBe(true);
  });

  it('losing the lock pauses; regaining it resumes', () => {
    expect(run('begin', 'lockGained', 'lockLost').state).toBe('paused');
    expect(run('begin', 'lockGained', 'lockLost', 'lockGained').state).toBe('playing');
  });

  it('ignores lock changes on the title, settings and end screens', () => {
    expect(run('lockGained').state).toBe('title');
    expect(run('lockLost').state).toBe('title');
    expect(run('begin', 'lockGained', 'fail', 'lockLost', 'lockGained').state).toBe('failed');
    expect(run('begin', 'lockGained', 'lockLost', 'openSettings', 'lockGained').state).toBe(
      'settings',
    );
  });

  it('settings returns to where it was opened (title or pause)', () => {
    expect(run('openSettings', 'closeSettings').state).toBe('title');
    expect(run('begin', 'lockGained', 'lockLost', 'openSettings', 'closeSettings').state).toBe(
      'paused',
    );
    expect(run('begin', 'openSettings').state).toBe('briefing'); // not from the briefing
  });

  it('a restart from pause, fail or complete waits paused until aiming starts again', () => {
    for (const end of ['fail', 'complete'] as const) {
      const f = run('begin', 'lockGained', end);
      expect(f.ended).toBe(true);
      expect(f.dispatch('restart')).toBe('paused');
      expect(f.dispatch('lockGained')).toBe('playing');
    }
    expect(run('begin', 'lockGained', 'lockLost', 'restart').state).toBe('paused');
    expect(run('restart').state).toBe('title'); // nothing to restart yet
  });

  it('completes only while playing, and an ended mission cannot end again', () => {
    expect(run('begin', 'complete').state).toBe('briefing');
    expect(run('begin', 'lockGained', 'fail', 'complete').state).toBe('failed');
    expect(run('begin', 'lockGained', 'complete', 'fail').state).toBe('complete');
  });
});
