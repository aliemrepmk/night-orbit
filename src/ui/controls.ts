/** The player's controls, shown on the pause screen and the in-game help overlay (`H`). */
export const CONTROLS: readonly (readonly [key: string, action: string])[] = [
  ['MOUSE', 'Slew the sensor (aim)'],
  ['LEFT CLICK', 'Fire (hold for 25 mm)'],
  ['1 / 2 / 3', '25 mm / 40 mm / 105 mm'],
  ['Q · WHEEL', 'Cycle weapon'],
  ['T', 'Air support: gun run → bomb → off'],
  ['WHEEL (T)', 'Turn the gun run; click calls it'],
  ['F', 'Sensor: white-hot / black-hot / NV'],
  ['X', 'Flares: decoy a missile (when you hear the warning)'],
  ['H', 'Show / hide these controls'],
  ['ESC', 'Pause'],
  ['F1', 'Performance stats'],
];

/** Drag-mode note: when the browser refuses pointer lock. */
export const DRAG_MODE_HINT = 'No pointer lock: hold the RIGHT button and drag to aim.';

/** The controls as table rows (HTML). */
export function controlsTable(): string {
  return `<table class="controls">${CONTROLS.map(
    ([k, a]) => `<tr><td>${k}</td><td>${a}</td></tr>`,
  ).join('')}</table>`;
}
