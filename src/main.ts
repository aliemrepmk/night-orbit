import './ui/hud.css';
import { Game } from './core/Game';

const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const hud = document.querySelector<HTMLElement>('#hud')!;
const screen = document.querySelector<HTMLElement>('#screen')!;

new Game(canvas, hud, screen).start();
