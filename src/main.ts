import './ui/hud.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const screen = document.querySelector<HTMLElement>('#screen')!;

const game = new Game(canvas, hud, screen);
game.start();

// Dev builds only: expose the game for console debugging and automated browser checks.
// Vite strips this branch from production builds.
if (import.meta.env.DEV) (window as unknown as { nightOrbit: Game }).nightOrbit = game;
