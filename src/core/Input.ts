/**
 * Mouse + keyboard input.
 *
 * Aiming uses Pointer Lock (raw mouse deltas, no cursor). If the browser refuses pointer lock,
 * we fall back to "drag mode": hold the left button and drag to aim.
 *
 * Deltas and key presses accumulate between frames; the game consumes them once per frame.
 */
export class Input {
  private dx = 0;
  private dy = 0;
  private wheelSteps = 0;
  private readonly pressed = new Set<string>();
  private readonly held = new Set<string>();
  private mouseHeld = false;

  locked = false;
  dragMode = false;
  /** Called whenever pointer lock is gained or lost. */
  onLockChange: (locked: boolean) => void = () => {};

  constructor(private readonly target: HTMLElement) {
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => this.enableDragMode());

    window.addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragMode && this.mouseHeld)) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseHeld = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.locked && !this.dragMode) return;
        e.preventDefault();
        this.wheelSteps += Math.sign(e.deltaY);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.code === 'F1') e.preventDefault(); // browser help
      if (!e.repeat) this.pressed.add(e.code);
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      this.mouseHeld = false;
    });
  }

  /** Starts aiming: requests pointer lock, or falls back to drag mode. */
  requestLock(): void {
    if (this.dragMode) {
      this.onLockChange(true);
      return;
    }
    try {
      const result = this.target.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => this.enableDragMode());
    } catch {
      this.enableDragMode();
    }
  }

  /** Returns and clears the mouse movement since the last call. */
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  /** Returns and clears the wheel steps since the last call (positive = scroll down). */
  consumeWheel(): number {
    const w = this.wheelSteps;
    this.wheelSteps = 0;
    return w;
  }

  /** True once per key press (the press is consumed). */
  wasPressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  isHeld(code: string): boolean {
    return this.held.has(code);
  }

  get isMouseHeld(): boolean {
    return this.mouseHeld;
  }

  /** Clears per-frame state that nobody consumed. */
  endFrame(): void {
    this.pressed.clear();
  }

  private enableDragMode(): void {
    if (this.dragMode) return;
    this.dragMode = true;
    console.warn('[input] Pointer lock unavailable: hold the left mouse button and drag to aim.');
    this.onLockChange(true);
  }
}
