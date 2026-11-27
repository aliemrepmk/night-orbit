/** One control: the keys (each drawn as a key cap) and what they do. */
export interface ControlRow {
  readonly keys: readonly string[];
  readonly action: string;
}

/** The controls page (M10+), grouped like the cockpit: gunnery, sensor, support, system. */
export const CONTROL_GROUPS: readonly { title: string; rows: readonly ControlRow[] }[] = [
  {
    title: '[A] GUNNERY',
    rows: [
      { keys: ['MOUSE'], action: 'Slew the sensor (aim)' },
      { keys: ['LMB'], action: 'Fire (hold for the 25 mm)' },
      { keys: ['1', '2', '3'], action: '25 mm · 40 mm · 105 mm' },
      { keys: ['Q', 'WHEEL'], action: 'Cycle weapon' },
    ],
  },
  {
    title: '[B] SENSOR',
    rows: [
      { keys: ['F'], action: 'White-hot → black-hot → night vision' },
      { keys: ['RMB', 'DRAG'], action: 'Aim when the browser refuses pointer lock' },
    ],
  },
  {
    title: '[C] SUPPORT',
    rows: [
      { keys: ['T'], action: 'Air support: gun run → bomb → off' },
      { keys: ['WHEEL'], action: 'Turn the gun run (while aiming it)' },
      { keys: ['LMB'], action: 'Call the strike on the marked point' },
      { keys: ['X'], action: 'Flares: decoy a missile (when you hear the warning)' },
    ],
  },
  {
    title: '[D] SYSTEM',
    rows: [
      { keys: ['H'], action: 'Show / hide these controls' },
      { keys: ['ESC'], action: 'Hold (pause)' },
      { keys: ['F1'], action: 'Performance stats' },
    ],
  },
];

/** The player's controls as one list (the in-flight `H` overlay). */
export const CONTROLS: readonly (readonly [key: string, action: string])[] = CONTROL_GROUPS.flatMap(
  (g) => g.rows.map((r) => [r.keys.join(' · '), r.action] as const),
);

/** Drag-mode note: when the browser refuses pointer lock. */
export const DRAG_MODE_HINT = 'No pointer lock: hold the RIGHT button and drag to aim.';

/** The controls as table rows (HTML). */
export function controlsTable(): string {
  return `<table class="controls">${CONTROLS.map(
    ([k, a]) => `<tr><td>${k}</td><td>${a}</td></tr>`,
  ).join('')}</table>`;
}
