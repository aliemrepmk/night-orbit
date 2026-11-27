/**
 * Soft keys (M10+): every screen's buttons carry a key cap (`[1]`, `[ENTER]`, `[ESC]`) and work
 * from the keyboard as well as the mouse. Pure: which key a keyboard code presses, and where
 * arrow keys move the focus.
 */

/** How a key is drawn: `go` = the main action (phosphor green), `warn` = caution (amber). */
export type KeyTone = 'go' | 'warn' | 'plain';

export interface SoftKey<A extends string = string> {
  /** The key cap shown and pressed: `1`–`9`, `ENTER`, `ESC`, `R`, … */
  readonly cap: string;
  readonly label: string;
  readonly action: A;
  readonly tone?: KeyTone;
}

/** The key cap a `KeyboardEvent.code` presses, or null for keys that are not soft keys. */
export function capForCode(code: string): string | null {
  const digit = /^(?:Digit|Numpad)([0-9])$/.exec(code);
  if (digit) return digit[1];
  if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') return 'ENTER';
  if (code === 'Escape' || code === 'Backspace') return 'ESC';
  const letter = /^Key([A-Z])$/.exec(code);
  return letter ? letter[1] : null;
}

/**
 * The soft key a keyboard code presses: the key with that cap; ENTER (or space) also presses
 * the screen's `go` key when no key has an ENTER cap of its own.
 */
export function softKeyFor<A extends string>(
  keys: readonly SoftKey<A>[],
  code: string,
): SoftKey<A> | null {
  const cap = capForCode(code);
  if (cap === null) return null;
  const exact = keys.find((k) => k.cap === cap);
  if (exact) return exact;
  if (cap === 'ENTER') return keys.find((k) => k.tone === 'go') ?? null;
  return null;
}

/** Moves a focus index by `dir` over `n` items, wrapping at both ends (n = 0 → -1). */
export function stepFocus(index: number, n: number, dir: number): number {
  if (n <= 0) return -1;
  if (index < 0 || index >= n) return dir < 0 ? n - 1 : 0;
  return (((index + dir) % n) + n) % n;
}
