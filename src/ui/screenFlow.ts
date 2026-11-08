/** Every full-screen state of the game (PLAN.md §6: Title → Briefing → Playing ⇄ Paused → Failed | Complete). */
export type Screen =
  'title' | 'briefing' | 'playing' | 'paused' | 'settings' | 'failed' | 'complete';

export type ScreenAction =
  /** Title: the player clicked to begin. */
  | 'begin'
  /** Pointer lock (or drag-mode aiming) started / stopped. */
  | 'lockGained'
  | 'lockLost'
  | 'openSettings'
  | 'closeSettings'
  /** A fresh run was set up (pause / fail / complete screens); it waits paused until aiming starts. */
  | 'restart'
  | 'fail'
  | 'complete';

/**
 * The screen state machine (M8), pure. Aiming is what starts play: the briefing's DEPLOY,
 * RESUME and RETRY all request pointer lock, and `lockGained` moves to `playing`. Losing the
 * lock (Esc) pauses. A restart lands on `paused` so a refused lock still leaves a RESUME button.
 */
export class ScreenFlow {
  state: Screen = 'title';
  /** Where `closeSettings` goes back to. */
  private settingsFrom: Screen = 'title';

  dispatch(action: ScreenAction): Screen {
    const s = this.state;
    switch (action) {
      case 'begin':
        if (s === 'title') this.state = 'briefing';
        break;
      case 'lockGained':
        if (s === 'briefing' || s === 'paused') this.state = 'playing';
        break;
      case 'lockLost':
        if (s === 'playing') this.state = 'paused';
        break;
      case 'openSettings':
        if (s === 'title' || s === 'paused') {
          this.settingsFrom = s;
          this.state = 'settings';
        }
        break;
      case 'closeSettings':
        if (s === 'settings') this.state = this.settingsFrom;
        break;
      case 'restart':
        if (s === 'paused' || s === 'failed' || s === 'complete') this.state = 'paused';
        break;
      case 'fail':
        if (s === 'playing' || s === 'paused') this.state = 'failed';
        break;
      case 'complete':
        if (s === 'playing') this.state = 'complete';
        break;
    }
    return this.state;
  }

  /** True while the mission clock runs and the player can act. */
  get playing(): boolean {
    return this.state === 'playing';
  }

  /** True once the mission has ended (the world keeps drifting behind the end screen). */
  get ended(): boolean {
    return this.state === 'failed' || this.state === 'complete';
  }
}
