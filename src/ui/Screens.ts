import { CONFIG } from '../config';
import { BRIEFING } from '../mission/briefing';
import type { Rating } from '../mission/stats';
import type { MapData } from '../world/mapTypes';
import { briefingMap, briefingSvg, fitViewBoxText, type Box } from './briefingMap';
import { controlsTable } from './controls';
import type { Screen } from './screenFlow';
import { stepValue, type Settings } from './settings';

/** Button actions the game reacts to. */
export type ScreenButton =
  'begin' | 'deploy' | 'resume' | 'restart' | 'settings' | 'back' | 'retry' | 'again';

const S = CONFIG.settings;

/**
 * The full-screen panels (M8, PLAN.md §7.16): title, briefing, pause, settings, failed and
 * complete. Plain DOM; the state machine is `ScreenFlow`, and `Game` does what a button means.
 */
export class Screens {
  /** A button was pressed. */
  onButton: (b: ScreenButton) => void = () => {};
  /** A setting changed (already sanitized and applied to the panel). */
  onSettings: (s: Settings) => void = () => {};

  private settings: Settings;

  constructor(
    private readonly root: HTMLElement,
    map: MapData,
    settings: Settings,
  ) {
    this.settings = { ...settings };
    const sketch = briefingMap(map);
    this.mapBounds = sketch.bounds;
    const para = (t: readonly string[]) => t.map((p) => `<p>${p}</p>`).join('');
    root.innerHTML = `
      <section class="panel" data-screen="title">
        <h1>NIGHT ORBIT</h1>
        <p class="sub">Gunship overwatch · Varesh Valley</p>
        <p class="cta">CLICK TO BEGIN</p>
        <div class="buttons"><button data-b="settings">SETTINGS</button></div>
      </section>
      <section class="panel wide" data-screen="briefing">
        <h2>${BRIEFING.title}</h2>
        <div class="brief">
          <div class="brief-frame">${briefingSvg(sketch)}</div>
          <div class="brief-text">
            <h3>SITUATION</h3>${para(BRIEFING.situation)}
            <h3>RULES OF ENGAGEMENT</h3>${para(BRIEFING.rules)}
            <p class="hint">Press H in the air for the controls.</p>
          </div>
        </div>
        <div class="buttons"><button class="primary" data-b="deploy">DEPLOY</button></div>
      </section>
      <section class="panel" data-screen="paused">
        <h2>PAUSED</h2>
        <div class="buttons">
          <button class="primary" data-b="resume">RESUME</button>
          <button data-b="restart">RESTART MISSION</button>
          <button data-b="settings">SETTINGS</button>
        </div>
        ${controlsTable()}
        <p class="hint" data-k="lockHint"></p>
      </section>
      <section class="panel" data-screen="settings">
        <h2>SETTINGS</h2>
        <div class="settings">
          ${slider('sensitivity', 'MOUSE SENSITIVITY')}
          ${toggle('invertY', 'INVERT MOUSE Y')}
          ${slider('volume', 'VOLUME')}
          ${slider('sfxVolume', 'EFFECTS')}
          ${slider('radioVolume', 'RADIO')}
          ${slider('engineVolume', 'ENGINE')}
          ${toggle('screenShake', 'SCREEN SHAKE')}
          ${toggle('subtitles', 'RADIO SUBTITLES')}
        </div>
        <p class="hint" data-k="storageHint"></p>
        <div class="buttons"><button class="primary" data-b="back">BACK</button></div>
      </section>
      <section class="panel" data-screen="failed">
        <h2>MISSION FAILED</h2>
        <p class="reason" data-k="failReason"></p>
        <table class="stats" data-k="failStats"></table>
        <p class="hint events" data-k="failEvents"></p>
        <div class="buttons"><button class="primary" data-b="retry">RETRY</button></div>
      </section>
      <section class="panel" data-screen="complete">
        <h2>MISSION COMPLETE</h2>
        <p class="sub">RIDGEBACK IS OUT</p>
        <div class="rating"><span data-k="grade"></span><span data-k="ratingLabel"></span></div>
        <table class="stats" data-k="completeStats"></table>
        <p class="hint events" data-k="completeEvents"></p>
        <div class="buttons"><button class="primary" data-b="again">PLAY AGAIN</button></div>
      </section>`;

    root.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-b]');
      if (btn) {
        e.stopPropagation();
        this.onButton(btn.dataset.b as ScreenButton);
        return;
      }
      // The whole title screen is a "click to begin" button.
      if (root.dataset.state === 'title') this.onButton('begin');
    });
    for (const input of root.querySelectorAll<HTMLInputElement>('input[data-s]')) {
      input.addEventListener('input', () => this.readInput(input));
      input.addEventListener('click', (e) => e.stopPropagation());
    }
    this.showSettings();
    // The sketch fills its frame (as tall as the briefing text): refit when the frame resizes.
    const frame = this.root.querySelector<HTMLElement>('.brief-frame')!;
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => this.fitMap()).observe(frame);
    window.addEventListener('resize', () => this.fitMap());
  }

  /** What the briefing sketch must show (every zone and the route). */
  private readonly mapBounds: Box;

  show(state: Screen): void {
    this.root.dataset.state = state;
    this.root.classList.toggle('hidden', state === 'playing');
    if (state === 'briefing') this.fitMap();
  }

  /** Widens the sketch's view to the frame's shape, so it fills it with more of the valley. */
  private fitMap(): void {
    const frame = this.root.querySelector<HTMLElement>('.brief-frame');
    const svg = frame?.querySelector('svg');
    if (!frame || !svg || frame.clientWidth === 0 || frame.clientHeight === 0) return;
    svg.setAttribute(
      'viewBox',
      fitViewBoxText(this.mapBounds, frame.clientWidth / frame.clientHeight),
    );
  }

  /** The fail screen: why, and the stats so far. */
  setFailed(reason: string, rows: readonly [string, string][], events = ''): void {
    this.text('failReason', reason);
    this.el('failStats').innerHTML = statRows(rows);
    this.text('failEvents', events);
  }

  setComplete(rating: Rating, rows: readonly [string, string][], events = ''): void {
    this.text('completeEvents', events);
    this.text('grade', rating.grade);
    this.text('ratingLabel', `${rating.label} · ${rating.score}`);
    this.el('completeStats').innerHTML = statRows(rows);
  }

  /** A line under the pause buttons (e.g. "click RESUME again" after a refused pointer lock). */
  setLockHint(text: string): void {
    this.text('lockHint', text);
  }

  setStorageHint(text: string): void {
    this.text('storageHint', text);
  }

  private readInput(input: HTMLInputElement): void {
    const key = input.dataset.s as keyof Settings;
    const s = this.settings;
    if (isSlider(key)) {
      s[key] = stepValue(Number(input.value), 0, S[key]);
    } else {
      s[key] = input.checked;
    }
    this.showSettings();
    this.onSettings({ ...s });
  }

  private showSettings(): void {
    const s = this.settings;
    for (const input of this.root.querySelectorAll<HTMLInputElement>('input[data-s]')) {
      const key = input.dataset.s as keyof Settings;
      const v = s[key];
      if (typeof v === 'boolean') input.checked = v;
      else input.value = String(v);
    }
    this.text('sensitivityValue', `${s.sensitivity.toFixed(2)}×`);
    for (const k of VOLUME_SLIDERS) this.text(`${k}Value`, `${Math.round(s[k] * 100)}%`);
  }

  private el(k: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  }

  private text(k: string, t: string): void {
    const e = this.el(k);
    if (e.textContent !== t) e.textContent = t;
  }
}

/** The volume sliders (master, then the mixer's buses, M9). */
const VOLUME_SLIDERS = ['volume', 'sfxVolume', 'radioVolume', 'engineVolume'] as const;
type SliderKey = 'sensitivity' | (typeof VOLUME_SLIDERS)[number];

function isSlider(key: keyof Settings): key is SliderKey {
  return key === 'sensitivity' || (VOLUME_SLIDERS as readonly string[]).includes(key);
}

function slider(key: SliderKey, label: string): string {
  const r = S[key];
  return `<label class="setting"><span>${label}</span>
    <input type="range" data-s="${key}" min="${r.min}" max="${r.max}" step="${r.step}"/>
    <span class="value" data-k="${key}Value"></span></label>`;
}

function toggle(key: keyof Settings, label: string): string {
  return `<label class="setting"><span>${label}</span>
    <input type="checkbox" data-s="${key}"/><span class="value"></span></label>`;
}

function statRows(rows: readonly [string, string][]): string {
  return rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}
