/** What one frame of trigger input does (see `TriggerGate`). */
export interface TriggerOutput {
  /** The guns' trigger is held (auto weapons keep firing). */
  readonly gunHeld: boolean;
  /** Trigger presses that fire the guns (semi / single weapons). */
  readonly gunClicks: number;
  /** Trigger presses that call the strike being aimed. */
  readonly strikeClicks: number;
}

const NONE: TriggerOutput = { gunHeld: false, gunClicks: 0, strikeClicks: 0 };

/**
 * Who the left mouse button belongs to (M8+ Phase A, play-test bug: "while selecting the place
 * for gun run and bomb, we can still shoot with the weapons").
 *
 * - While a strike is being aimed, every press goes to the strike; the guns never fire.
 * - Once the trigger has been used for a strike (or aiming ends while it is held), the guns stay
 *   locked until the button is released. Otherwise the click that calls a strike, which also
 *   ends aiming, would keep firing the 25 mm while the button is still down.
 */
export class TriggerGate {
  private locked = false;

  frame(aiming: boolean, held: boolean, clicks: number): TriggerOutput {
    if (aiming) {
      if (held || clicks > 0) this.locked = true;
      return clicks > 0 ? { ...NONE, strikeClicks: clicks } : NONE;
    }
    if (this.locked) {
      if (held) return NONE;
      // Released: the guns are free again. Presses already released this frame are fresh clicks.
      this.locked = false;
    }
    return { gunHeld: held, gunClicks: clicks, strikeClicks: 0 };
  }

  /** Forget any lock (a new run, or the game was paused). */
  reset(): void {
    this.locked = false;
  }
}
