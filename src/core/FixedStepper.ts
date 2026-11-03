/**
 * Converts variable real frame times into a whole number of fixed simulation steps.
 * This keeps ballistics and AI identical on 60 Hz and 144 Hz screens.
 */
export class FixedStepper {
  private acc = 0;

  constructor(
    readonly step: number,
    readonly maxFrame: number,
  ) {}

  /** Adds elapsed real time (seconds) and returns how many fixed steps to run now. */
  advance(elapsed: number): number {
    this.acc += Math.min(Math.max(elapsed, 0), this.maxFrame);
    // Small epsilon so float error (e.g. 6 × 1/60 ≠ 0.1 exactly) never drops a step.
    const n = Math.floor((this.acc + 1e-9) / this.step);
    this.acc = Math.max(0, this.acc - n * this.step);
    return n;
  }

  /** Fraction (0–1) of the next step already accumulated; useful for render interpolation. */
  get alpha(): number {
    return this.acc / this.step;
  }

  reset(): void {
    this.acc = 0;
  }
}
