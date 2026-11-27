// M10+ fonts, bundled (SIL Open Font Licence; no network): Plex Mono for data, Chakra Petch for headings.
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/chakra-petch/latin-600.css';
import '@fontsource/chakra-petch/latin-700.css';
import './ui/hud.css';
import './ui/screens.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const screen = document.querySelector<HTMLElement>('#screen')!;

const game = new Game(canvas, hud, screen);
game.start();

// Dev builds only: expose the game for console debugging and automated browser checks.
// Vite strips this branch from production builds.
if (import.meta.env.DEV) (window as unknown as { nightOrbit: Game }).nightOrbit = game;
