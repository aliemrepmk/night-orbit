import { CONFIG } from '../config';
import type { Priority, Speaker } from './missionTypes';

export interface RadioLine {
  readonly speaker: Speaker;
  readonly text: string;
  readonly priority: Priority;
}

export type RadioConfig = { readonly [K in keyof typeof CONFIG.radio]: number };

interface Queued extends RadioLine {
  /** Seconds it has waited in the queue. */
  waited: number;
  /** Order of arrival (FIFO within a priority). */
  seq: number;
}

/**
 * The radio (PLAN.md §7.15): one line on air at a time, shown as a subtitle for a time that
 * grows with its length. Waiting lines are a priority queue: story (3) before warnings (2)
 * before reactive chatter (1), first come first served within a priority. A story line or a
 * warning cuts off chatter that is on air. Chatter and warnings go stale: a chatter line that
 * waited longer than `chatterMaxWait` (a warning, `warningMaxWait`) is dropped, so the radio
 * never reports a kill from half a minute ago. Pure: `onLine` is where the HUD and squelch hook in.
 */
export class Radio {
  current: RadioLine | null = null;
  /** Seconds the current line has left on air. */
  left = 0;
  private readonly queue: Queued[] = [];
  private seq = 0;
  /** Seconds of silence left before the next line may start. */
  private silence = 0;
  /** Called when a line goes on air. */
  onLine: (line: RadioLine) => void = () => {};

  constructor(private readonly cfg: RadioConfig = CONFIG.radio) {}

  /** How long a line stays on air (seconds). */
  duration(text: string): number {
    const c = this.cfg;
    return Math.min(c.maxSeconds, c.baseSeconds + text.length * c.secondsPerChar);
  }

  get waiting(): number {
    return this.queue.length;
  }

  say(speaker: Speaker, text: string, priority: Priority): void {
    const line: Queued = { speaker, text, priority, waited: 0, seq: this.seq++ };
    this.queue.push(line);
    if (this.current && this.current.priority === 1 && priority > 1) {
      // Story and warnings cut off chatter.
      this.current = null;
      this.left = 0;
      this.silence = 0;
    }
    if (!this.current && this.silence <= 0) this.next();
  }

  update(dt: number): void {
    for (const q of this.queue) q.waited += dt;
    this.dropStale();
    if (this.current) {
      this.left -= dt;
      if (this.left > 0) return;
      this.current = null;
      // A short gap of silence between lines, so two subtitles never blur into one.
      this.silence = this.cfg.gapSeconds;
      return;
    }
    this.silence -= dt;
    if (this.silence <= 0) this.next();
  }

  /** Drops every line still waiting (a new phase: old beats are no longer news). The line on air finishes. */
  dropWaiting(): void {
    this.queue.length = 0;
  }

  /** Clears everything (restart). */
  clear(): void {
    this.queue.length = 0;
    this.current = null;
    this.left = 0;
    this.silence = 0;
  }

  private dropStale(): void {
    const c = this.cfg;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      const max =
        q.priority === 1 ? c.chatterMaxWait : q.priority === 2 ? c.warningMaxWait : Infinity;
      if (q.waited > max) this.queue.splice(i, 1);
    }
  }

  private next(): void {
    if (this.queue.length === 0) return;
    let best = 0;
    for (let i = 1; i < this.queue.length; i++) {
      const a = this.queue[i];
      const b = this.queue[best];
      if (a.priority > b.priority || (a.priority === b.priority && a.seq < b.seq)) best = i;
    }
    const [q] = this.queue.splice(best, 1);
    this.current = { speaker: q.speaker, text: q.text, priority: q.priority };
    this.left = this.duration(q.text);
    this.onLine(this.current);
  }
}
