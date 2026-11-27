import { CONFIG } from '../config';
import { buildBriefing, type Briefing } from '../mission/briefing';
import type { MapData } from '../world/mapTypes';
import { BOOT_BARS, BOOT_LINES, bootLineText, bootState } from './bootSequence';
import { briefingMap, briefingSvg, fitViewBoxText, type Box } from './briefingMap';
import { CONTROL_GROUPS } from './controls';
import type { AfterAction, HoldStatus, IncidentReport, Row, TimelineEntry, Tone } from './reports';
import type { Screen } from './screenFlow';
import { stepValue, type Settings } from './settings';
import {
  SETTINGS_PAGES,
  sliderCells,
  sliderRange,
  sliderText,
  stepChoice,
  type SettingRow,
  type SliderKey,
} from './settingsPages';
import { softKeyFor, stepFocus, type SoftKey } from './softKeys';

/** Button actions the game reacts to. */
export type ScreenButton =
  | 'continue'
  | 'begin'
  | 'deploy'
  | 'resume'
  | 'restart'
  | 'settings'
  | 'controls'
  | 'back'
  | 'retry'
  | 'again'
  | 'quit';

/** Actions the screens handle themselves (briefing paging, HOLD confirmations). */
type LocalAction = 'next' | 'askRestart' | 'askQuit' | 'confirm' | 'cancel';
type Action = ScreenButton | LocalAction;
type Key = SoftKey<Action>;

/** A radio line for the HOLD screen's comms log. */
export interface CommsLine {
  readonly time: string;
  readonly speaker: string;
  readonly text: string;
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The key caps of each screen: the bottom bar's keys, or the panel menu's (title, HOLD). */
const MENU_KEYS: Partial<Record<Screen, readonly Key[]>> = {
  title: [
    { cap: '1', label: 'BEGIN MISSION', action: 'begin', tone: 'go' },
    { cap: '2', label: 'SETTINGS', action: 'settings' },
    { cap: '3', label: 'CONTROLS', action: 'controls' },
  ],
  paused: [
    { cap: '1', label: 'RESUME', action: 'resume', tone: 'go' },
    { cap: '2', label: 'RESTART MISSION', action: 'askRestart' },
    { cap: '3', label: 'SETTINGS', action: 'settings' },
    { cap: '4', label: 'CONTROLS', action: 'controls' },
    { cap: '5', label: 'QUIT TO TITLE', action: 'askQuit' },
  ],
};

const BAR_KEYS: Partial<Record<Screen, readonly Key[]>> = {
  boot: [{ cap: 'ESC', label: 'SKIP', action: 'continue' }],
  briefing: [
    { cap: 'ESC', label: 'BACK', action: 'quit' },
    { cap: '→', label: 'NEXT PARAGRAPH', action: 'next' },
    { cap: '3', label: 'CONTROLS', action: 'controls' },
    { cap: 'ENTER', label: 'ACKNOWLEDGE & DEPLOY', action: 'deploy', tone: 'go' },
  ],
  settings: [{ cap: 'ESC', label: 'BACK', action: 'back' }],
  controls: [{ cap: 'ESC', label: 'BACK', action: 'back' }],
  failed: [
    { cap: 'ENTER', label: 'RETRY SAME RUN', action: 'retry', tone: 'go' },
    { cap: '2', label: 'NEW RUN', action: 'again' },
    { cap: 'ESC', label: 'TITLE', action: 'quit' },
  ],
  complete: [
    { cap: 'ENTER', label: 'NEW RUN', action: 'again', tone: 'go' },
    { cap: '2', label: 'REPLAY SAME RUN', action: 'retry' },
    { cap: 'ESC', label: 'TITLE', action: 'quit' },
  ],
};

const CONFIRM_KEYS: readonly Key[] = [
  { cap: 'ENTER', label: 'CONFIRM', action: 'confirm', tone: 'warn' },
  { cap: 'ESC', label: 'CANCEL', action: 'cancel' },
];

/** The top bar's middle text and the bottom bar's system status, per screen. */
const FRAME: Record<Screen, { title: string; titleTone: Tone; sys: string; sysTone: Tone }> = {
  boot: { title: 'POWER-ON · SELF TEST', titleTone: 'plain', sys: 'TESTING', sysTone: 'warn' },
  title: { title: 'STANDBY', titleTone: 'plain', sys: 'NOMINAL', sysTone: 'go' },
  briefing: {
    title: 'OPORD 01 · OPERATION NIGHT ORBIT',
    titleTone: 'plain',
    sys: 'NOMINAL',
    sysTone: 'go',
  },
  playing: { title: '', titleTone: 'plain', sys: 'NOMINAL', sysTone: 'go' },
  paused: { title: '■ HOLD · FIRE CONTROL SAFE', titleTone: 'warn', sys: 'HOLD', sysTone: 'warn' },
  settings: { title: 'SETTINGS', titleTone: 'plain', sys: 'NOMINAL', sysTone: 'go' },
  controls: { title: 'CONTROLS', titleTone: 'plain', sys: 'NOMINAL', sysTone: 'go' },
  failed: { title: '■ MISSION ABORTED', titleTone: 'bad', sys: 'ABORT', sysTone: 'bad' },
  complete: {
    title: '■ AFTER-ACTION REPORT · OP NIGHT ORBIT',
    titleTone: 'go',
    sys: 'RTB',
    sysTone: 'go',
  },
};

function keyButton(k: Key, cls = ''): string {
  const tone = k.tone && k.tone !== 'plain' ? ` ${k.tone}` : '';
  return `<button type="button" class="key${tone}${cls ? ` ${cls}` : ''}" data-a="${k.action}"><span class="arrow" aria-hidden="true">▶</span><span class="cap">[${esc(k.cap)}]</span> ${esc(k.label)}</button>`;
}

function rowsHtml(rows: readonly Row[]): string {
  return rows
    .map(
      (r) =>
        `<div class="kv"><span class="k">${esc(r.label)}</span><span class="v tone-${r.tone}">${esc(r.value)}</span></div>`,
    )
    .join('');
}

function cellsHtml(filled: number, n: number, tone: Tone): string {
  let out = '';
  for (let i = 0; i < n; i++) out += `<span class="${i < filled ? `on tone-${tone}` : ''}"></span>`;
  return out;
}

/**
 * The full-screen pages (M8, restyled in M10+ as the gunship's mission computer, PLAN.md §10
 * M10+): boot, title, briefing, HOLD, settings, controls, MISSION ABORTED and the AFTER-ACTION
 * REPORT, inside one console frame (top system bar, bottom soft-key bar). Plain DOM: the state
 * machine is `ScreenFlow`, the words come from pure builders (`reports.ts`, `briefing.ts`,
 * `bootSequence.ts`, `settingsPages.ts`), and `Game` does what a button means. Every key works
 * from the keyboard: number keys, Enter, Esc, arrows.
 */
export class Screens {
  /** A button was pressed. */
  onButton: (b: ScreenButton) => void = () => {};
  /** A setting changed (already sanitized and applied to the panel). */
  onSettings: (s: Settings) => void = () => {};
  /** The keyboard moved the focus (a soft tick). */
  onFocusMove: () => void = () => {};

  private settings: Settings;
  /** 'playing' until the first `show`, so the first screen counts as a change (boot starts). */
  private state: Screen = 'playing';
  private readonly briefing: Briefing;
  private readonly mapBounds: Box;
  private para = 0;
  private readonly read = new Set<number>();
  private settingsTab = 0;
  private settingsRow = 0;
  private confirming: 'restart' | 'quit' | null = null;
  private bootStart = 0;
  private bootDone = false;
  private missionSeconds: number | null = null;

  constructor(
    private readonly root: HTMLElement,
    map: MapData,
    settings: Settings,
  ) {
    this.settings = { ...settings };
    this.briefing = buildBriefing(map);
    const sketch = briefingMap(map);
    // The view fits the whole grid (it covers the zones and the route), labels included.
    this.mapBounds = sketch.grid.box;
    root.style.setProperty('--wipe-ms', `${CONFIG.ui.wipeMs}ms`);
    root.innerHTML = `
      <div class="scanlines" aria-hidden="true"></div>
      <header class="frame-top">
        <span><span class="tone-go">◆</span> LANTERN 2-1 // MISSION SYSTEMS</span>
        <span data-k="frameTitle"></span>
        <span class="dim" data-k="clock"></span>
      </header>
      <main class="frame-body">
        ${this.bootHtml()}
        ${this.titleHtml()}
        ${this.briefingHtml(briefingSvg(sketch))}
        ${this.holdHtml()}
        <section class="page" data-screen="settings">
          <div class="panel br settings-panel">
            <div class="tabs" role="tablist" aria-label="Settings pages" data-k="settingsTabs"></div>
            <div class="srows" data-k="settingsRows"></div>
            <p class="hint" data-k="storageHint"></p>
          </div>
        </section>
        ${this.controlsHtml()}
        ${this.abortedHtml()}
        ${this.reportHtml()}
      </main>
      <footer class="frame-bottom">
        <div class="bar-keys" data-k="barKeys"></div>
        <span class="bar-note dim" data-k="barNote"></span>
        <span class="sys dim">SYS <span data-k="sysDot">●</span> <span data-k="sysText"></span></span>
      </footer>`;

    this.text('gridNote', `GRID SQUARE ${Math.round(sketch.grid.cell)} M · N ↑`);
    root.addEventListener('click', (e) => this.click(e));
    window.addEventListener('keydown', (e) => this.key(e));
    // The sketch fills its frame (as tall as the order panel): refit when the frame resizes.
    const frame = this.el('mapFrame');
    if (typeof ResizeObserver !== 'undefined')
      new ResizeObserver(() => this.fitMap()).observe(frame);
    window.addEventListener('resize', () => this.fitMap());
    // The clock and the boot animation (cheap: text only, and only while a screen is up).
    setInterval(() => this.tick(), 100);
    this.renderSettings();
    this.renderBriefing();
    this.tick();
  }

  // ---------------------------------------------------------------- public API (Game)

  show(state: Screen): void {
    const changed = state !== this.state;
    this.state = state;
    this.root.dataset.state = state;
    this.root.classList.toggle('hidden', state === 'playing');
    if (state === 'playing') return;
    if (changed) {
      this.confirming = null;
      if (state === 'boot') {
        this.bootStart = performance.now();
        this.bootDone = false;
      }
      if (state === 'briefing') {
        this.para = 0;
        this.read.clear();
        this.read.add(0);
        this.renderBriefing();
      }
      if (state === 'settings') this.renderSettings();
      // The scanline wipe (restarted on every screen change; CSS skips it for reduced motion).
      this.root.classList.remove('wipe');
      void this.root.offsetWidth;
      this.root.classList.add('wipe');
    }
    if (state === 'briefing') this.fitMap();
    this.renderFrame();
    this.tick();
    if (changed) this.focusFirst();
  }

  /** The mission clock shown in the top bar (null before the first deploy). */
  setMissionTime(seconds: number | null): void {
    this.missionSeconds = seconds;
  }

  /** The HOLD screen's status card and radio log. */
  setHold(s: HoldStatus, comms: readonly CommsLine[]): void {
    this.text('holdObjective', s.objective);
    this.text('holdPhase', `${s.phase} · ${s.time}`);
    this.el('holdGauges').innerHTML = s.gauges
      .map(
        (g) =>
          `<div class="gauge"><span>${esc(g.label)}</span><span class="cells" role="meter" aria-label="${esc(g.label)}" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${g.filled}">${cellsHtml(g.filled, 10, g.tone)}</span><span class="v tone-${g.tone}">${esc(g.value)}</span></div>`,
      )
      .join('');
    this.el('holdSystems').innerHTML = s.systems
      .map(
        (r) =>
          `<div class="tile"><span class="k">${esc(r.label)}</span><span class="v tone-${r.tone}">${esc(r.value)}</span></div>`,
      )
      .join('');
    this.el('holdComms').innerHTML = comms.length
      ? comms
          .map(
            (c) =>
              `<div class="comm"><span class="dim">${esc(c.time)}</span><span class="who">${esc(c.speaker)}</span><span>${esc(c.text)}</span></div>`,
          )
          .join('')
      : '<div class="dim">No traffic yet.</div>';
  }

  /** MISSION ABORTED: the incident report, the record so far, and the run's events. */
  setFailed(
    r: IncidentReport,
    record: readonly Row[],
    events: readonly string[],
    seed: string,
  ): void {
    this.text('abortTitle', r.title);
    this.el('abortRows').innerHTML = rowsHtml(r.rows);
    this.text('abortTip', r.tip);
    this.el('abortRecord').innerHTML = rowsHtml(record);
    this.text('abortSeed', `[EVENTS] THIS RUN · SEED ${seed}`);
    this.el('abortEvents').innerHTML = this.eventsHtml(events);
  }

  /** AFTER-ACTION REPORT. */
  setComplete(
    a: AfterAction,
    kills: number,
    line: TimelineEntry[],
    events: readonly string[],
    seed: string,
  ): void {
    this.text('grade', a.grade);
    this.el('grade').setAttribute('aria-label', `Grade ${a.grade}`);
    this.text('gradeLabel', a.label);
    this.text('gradeScore', a.score);
    this.el('breakdown').innerHTML = rowsHtml(a.breakdown);
    this.text('killTotal', String(kills));
    this.el('weaponBars').innerHTML = a.weapons
      .map(
        (w) =>
          `<div class="wbar"><span>${esc(w.label)}</span><span class="track"><span style="width:${Math.round(w.share * 100)}%"></span></span><span class="v">${w.kills}</span></div>`,
      )
      .join('');
    this.el('engagement').innerHTML = rowsHtml(a.engagement);
    this.el('outcome').innerHTML = rowsHtml(a.outcome);
    this.text('timelineTitle', `[C] TIMELINE · SEED ${seed}`);
    this.el('timeline').innerHTML =
      line
        .map(
          (e) =>
            `<div class="tl"><span class="dim">${esc(e.time)}</span><span class="tone-${e.tone}">${esc(e.text)}</span></div>`,
        )
        .join('') +
      (events.length ? `<div class="tl-events">${this.eventsHtml(events)}</div>` : '');
  }

  /** A line under the HOLD menu (e.g. "click RESUME again" after a refused pointer lock). */
  setLockHint(text: string): void {
    this.text('lockHint', text);
  }

  setStorageHint(text: string): void {
    this.text('storageHint', text);
  }

  // ---------------------------------------------------------------- markup

  private bootHtml(): string {
    const bars = BOOT_BARS.map(
      (b, i) =>
        `<div class="bootbar"><div class="kv"><span>${b.label}</span><span class="v" data-k="bootBarV${i}"></span></div><div class="track"><span data-k="bootBar${i}"></span></div></div>`,
    ).join('');
    return `
      <section class="page" data-screen="boot">
        <div class="cols boot-cols">
          <div class="panel br">
            <h2 class="label">[01] MISSION COMPUTER · REV 4.2</h2>
            <div class="bootlog" data-k="bootLog" aria-live="polite"></div>
            <div class="boot-continue" data-k="bootContinue">${keyButton({ cap: 'ENTER', label: 'ALL SYSTEMS NOMINAL · CONTINUE', action: 'continue', tone: 'go' }, 'big blink')}</div>
          </div>
          <div class="panel br">
            <h2 class="label">[02] SYSTEM STATUS</h2>
            ${bars}
            <p class="hint push">Any key or click skips the start-up.</p>
          </div>
        </div>
      </section>`;
  }

  private titleHtml(): string {
    return `
      <section class="page" data-screen="title">
        <svg class="title-reticle" aria-hidden="true" viewBox="-260 -260 520 520" fill="none" stroke="currentColor">
          <circle r="200" stroke-width="1" stroke-dasharray="4 8" stroke-opacity="0.6"></circle>
          <path d="M-150 -110 h-40 v40 M150 -110 h40 v40 M-150 110 h-40 v-40 M150 110 h40 v-40" stroke-width="2"></path>
          <path d="M0 -26 v-60 M0 26 v60 M-26 0 h-60 M26 0 h60" stroke-width="1.5"></path>
          <circle r="3" fill="currentColor" stroke="none"></circle>
        </svg>
        <div class="title-block">
          <div class="kicker dim">GUNSHIP OVERWATCH · VARESH VALLEY</div>
          <h1>NIGHT<br>ORBIT</h1>
          <div class="kicker dim">CALLSIGN <span class="bright">LANTERN 2-1</span> &nbsp;·&nbsp; POSITION <span class="bright">SENSOR OPERATOR / GUNNER</span></div>
          <nav class="menu" aria-label="Main menu">${MENU_KEYS.title!.map((k) => keyButton(k)).join('')}</nav>
          <div class="cta blink">▶ CLICK OR PRESS ENTER TO CONNECT</div>
        </div>
      </section>`;
  }

  private briefingHtml(svg: string): string {
    return `
      <section class="page" data-screen="briefing">
        <div class="cols brief-cols">
          <div class="panel br" aria-label="Map">
            <h2 class="label row"><span>[MAP] VARESH VALLEY</span><span class="dim small" data-k="gridNote"></span></h2>
            <div class="brief-frame" data-k="mapFrame">${svg}</div>
            <div class="legend dim">
              <span><span class="tone-go">─ ─ ─</span> RIDGEBACK ROUTE</span>
              <span><span class="tag">PL</span> PHASE LINE</span>
              <span>◌ OBJECTIVE AREA</span>
              <span>✚ CLINIC (PROTECTED)</span>
            </div>
          </div>
          <div class="panel br order">
            <div class="tabs six" role="tablist" aria-label="Paragraphs" data-k="paraTabs"></div>
            <h2 class="para-title" data-k="paraTitle"></h2>
            <div class="items" role="tabpanel" data-k="paraItems"></div>
          </div>
        </div>
      </section>`;
  }

  private holdHtml(): string {
    return `
      <section class="page" data-screen="paused">
        <div class="cols hold-cols">
          <div class="panel br">
            <h1 class="hold-title">HOLD</h1>
            <nav class="menu" aria-label="Hold menu">${MENU_KEYS.paused!.map((k) => keyButton(k)).join('')}</nav>
            <div class="confirm" data-k="confirm" role="alertdialog" aria-label="Confirm">
              <span class="tone-warn" data-k="confirmText"></span>
              <div class="row-keys">${CONFIRM_KEYS.map((k) => keyButton(k, 'small')).join('')}</div>
            </div>
            <p class="hint" data-k="lockHint"></p>
            <p class="hint push">The world holds still. Radio static is off until you resume.</p>
          </div>
          <div class="stack">
            <div class="panel br" aria-label="Status">
              <h2 class="label row"><span>[STATUS]</span><span data-k="holdPhase"></span></h2>
              <div class="objective">OBJ <span class="dim">·</span> <span data-k="holdObjective"></span></div>
              <div class="gauges" data-k="holdGauges"></div>
              <div class="tiles" data-k="holdSystems"></div>
            </div>
            <div class="panel br grow" aria-label="Radio log">
              <h2 class="label">[COMMS] LAST TRAFFIC</h2>
              <div class="comms" data-k="holdComms"></div>
            </div>
          </div>
        </div>
      </section>`;
  }

  private controlsHtml(): string {
    const groups = CONTROL_GROUPS.map(
      (g) =>
        `<div class="panel br"><h2 class="label">${esc(g.title)}</h2>${g.rows
          .map(
            (r) =>
              `<div class="crow"><span class="caps">${r.keys.map((k) => `<span class="kcap">${esc(k)}</span>`).join('')}</span><span>${esc(r.action)}</span></div>`,
          )
          .join('')}</div>`,
    ).join('');
    return `<section class="page" data-screen="controls"><div class="grid4">${groups}</div><p class="hint center" data-k="controlsNote">In flight, H shows these controls over the feed.</p></section>`;
  }

  private abortedHtml(): string {
    return `
      <section class="page" data-screen="failed">
        <div class="cols abort-cols">
          <div class="panel br bad" aria-label="Incident report">
            <h2 class="label tone-bad">[INCIDENT] SITREP 01</h2>
            <h1 class="abort-title tone-bad" data-k="abortTitle"></h1>
            <div class="kvs wide" data-k="abortRows"></div>
            <p class="tip push"><span class="tone-warn">TIP ·</span> <span data-k="abortTip"></span></p>
          </div>
          <div class="stack">
            <div class="panel br"><h2 class="label">[RECORD] SO FAR</h2><div class="kvs" data-k="abortRecord"></div></div>
            <div class="panel br grow"><h2 class="label" data-k="abortSeed"></h2><div class="events" data-k="abortEvents"></div></div>
          </div>
        </div>
      </section>`;
  }

  private reportHtml(): string {
    return `
      <section class="page" data-screen="complete">
        <div class="cols aar-cols">
          <div class="panel br" aria-label="Rating">
            <h2 class="label">[RATING]</h2>
            <div class="stamp-row"><div class="stamp" data-k="grade" role="img"></div>
              <div><div class="grade-label" data-k="gradeLabel"></div><div class="dim" data-k="gradeScore"></div></div></div>
            <div class="tone-go extracted">RIDGEBACK EXTRACTED</div>
            <div class="kvs" data-k="breakdown"></div>
          </div>
          <div class="panel br" aria-label="Engagement">
            <h2 class="label">[A] ENGAGEMENT</h2>
            <div class="big-number"><span data-k="killTotal"></span> <span class="dim small">KILLS</span></div>
            <div data-k="weaponBars"></div>
            <div class="kvs" data-k="engagement"></div>
          </div>
          <div class="panel br" aria-label="Outcome and timeline">
            <h2 class="label">[B] OUTCOME</h2>
            <div class="kvs" data-k="outcome"></div>
            <h2 class="label" data-k="timelineTitle"></h2>
            <div class="timeline" data-k="timeline"></div>
          </div>
        </div>
      </section>`;
  }

  private eventsHtml(events: readonly string[]): string {
    return events.length
      ? events.map((e) => `<div class="ev"><span class="dim">▸</span> ${esc(e)}</div>`).join('')
      : '<div class="dim">No special events.</div>';
  }

  // ---------------------------------------------------------------- rendering

  private renderFrame(): void {
    const f = FRAME[this.state];
    const t = this.el('frameTitle');
    t.textContent = f.title;
    t.className = `tone-${f.titleTone}`;
    this.el('sysDot').className = `tone-${f.sysTone}`;
    this.text('sysText', this.state === 'boot' && this.bootDone ? 'NOMINAL' : f.sys);
    if (this.state === 'boot' && this.bootDone) this.el('sysDot').className = 'tone-go';
    const keys = this.confirming ? [] : (BAR_KEYS[this.state] ?? []);
    this.el('barKeys').innerHTML = keys.map((k) => keyButton(k, 'small')).join('');
    this.text(
      'barNote',
      this.state === 'briefing'
        ? `READ ${this.read.size} / ${this.briefing.paragraphs.length}`
        : this.state === 'settings'
          ? '[↑↓] ROW · [←→] CHANGE · [1–3] PAGE'
          : this.state === 'paused' || this.state === 'title'
            ? '[↑↓] SELECT · [ENTER] OK'
            : '',
    );
    const c = this.el('confirm');
    c.classList.toggle('open', this.confirming !== null);
    this.text(
      'confirmText',
      this.confirming === 'quit'
        ? 'QUIT TO THE TITLE? THIS RUN IS LOST.'
        : 'RESTART THIS RUN? PROGRESS IS LOST.',
    );
  }

  private tick(): void {
    if (this.state === 'playing') return;
    const now = new Date();
    const two = (n: number) => String(n).padStart(2, '0');
    const zulu = `${two(now.getUTCHours())}:${two(now.getUTCMinutes())}:${two(now.getUTCSeconds())}Z`;
    const t =
      this.missionSeconds !== null &&
      (this.state === 'paused' || this.state === 'failed' || this.state === 'complete')
        ? `T+ ${two(Math.floor(this.missionSeconds / 60))}:${two(Math.floor(this.missionSeconds % 60))} · `
        : '';
    this.text('clock', `${t}${zulu}`);
    if (this.state === 'boot') this.renderBoot();
  }

  private renderBoot(): void {
    const s = bootState((performance.now() - this.bootStart) / 1000);
    const log = this.el('bootLog');
    if (log.childElementCount !== s.lines) {
      log.innerHTML =
        BOOT_LINES.slice(0, s.lines)
          .map((l) => {
            const t = bootLineText(l);
            return `<div class="bootline"><span class="lbl">${esc(t.label)} <span class="dim">${t.dots}</span></span><span class="${l.status === 'OK' ? '' : 'tone-go'}">${esc(l.status)}</span></div>`;
          })
          .join('') + (s.done ? '' : '<div class="cursor blink">█</div>');
    }
    s.bars.forEach((b, i) => {
      const bar = this.el(`bootBar${i}`);
      bar.style.width = `${Math.round(b * 100)}%`;
      bar.className = b >= 1 ? 'full' : '';
      this.text(`bootBarV${i}`, b >= 1 ? 'OK' : `${Math.round(b * 100)}%`);
    });
    if (s.done !== this.bootDone) {
      this.bootDone = s.done;
      this.el('bootContinue').classList.toggle('open', s.done);
      this.renderFrame();
      if (s.done) this.focusFirst();
    }
  }

  private renderBriefing(): void {
    const ps = this.briefing.paragraphs;
    const p = ps[this.para];
    this.el('paraTabs').innerHTML = ps
      .map((q, i) => {
        const sel = i === this.para;
        const cls = `key tab${sel ? ' selected' : ''}${q.roe ? ' warn' : ''}`;
        return `<button type="button" role="tab" class="${cls}" aria-selected="${sel}" data-para="${i}"><span class="tabkey">${esc(q.key)}</span><span class="tabstate ${this.read.has(i) ? 'tone-go' : 'dim'}">${this.read.has(i) ? '✓ READ' : 'UNREAD'}</span></button>`;
      })
      .join('');
    const t = this.el('paraTitle');
    t.textContent = p.title;
    t.className = `para-title${p.roe ? ' tone-warn' : ''}`;
    this.el('paraItems').innerHTML = p.items
      .map(
        ([k, v]) =>
          `<div class="item"><span class="${p.roe ? 'tone-warn' : 'dim'}">${esc(k)}</span><span>${esc(v)}</span></div>`,
      )
      .join('');
    if (this.state === 'briefing') this.renderFrame();
  }

  private pickParagraph(i: number): void {
    this.para = (i + this.briefing.paragraphs.length) % this.briefing.paragraphs.length;
    this.read.add(this.para);
    this.renderBriefing();
  }

  private renderSettings(): void {
    this.el('settingsTabs').innerHTML = SETTINGS_PAGES.map((pg, i) => {
      const sel = i === this.settingsTab;
      return `<button type="button" role="tab" class="key tab${sel ? ' selected' : ''}" aria-selected="${sel}" data-tab="${i}"><span class="cap">[${i + 1}]</span> ${pg.name}</button>`;
    }).join('');
    const rows = SETTINGS_PAGES[this.settingsTab].rows;
    this.el('settingsRows').innerHTML = rows.map((r, i) => this.settingRowHtml(r, i)).join('');
  }

  private settingRowHtml(r: SettingRow, i: number): string {
    const v = this.settings[r.key];
    const head = `<div class="slabel"><span>${r.label}</span><span class="dim small">${esc(r.help)}</span></div>`;
    if (r.kind === 'slider') {
      const key = r.key as SliderKey;
      const n = v as number;
      const lit = sliderCells(key, n);
      return `<div class="srow" tabindex="-1" data-row="${i}">${head}<div class="sctl">
        <button type="button" class="key step" data-step="-1" aria-label="Decrease ${r.label}">−</button>
        <span class="cells wide" role="meter" aria-label="${r.label}" aria-valuetext="${sliderText(key, n)}">${cellsHtml(lit, 20, 'plain')}</span>
        <button type="button" class="key step" data-step="1" aria-label="Increase ${r.label}">+</button>
        <span class="v">${sliderText(key, n)}</span></div></div>`;
    }
    const opts = (r.options ?? [])
      .map((o, j) => {
        const on = o.value === v;
        return `<button type="button" role="radio" class="key choice${on ? ' selected go' : ''}" aria-checked="${on}" data-choice="${j}">${o.text}</button>`;
      })
      .join('');
    return `<div class="srow" tabindex="-1" data-row="${i}">${head}<div class="sctl" role="radiogroup" aria-label="${r.label}">${opts}</div></div>`;
  }

  /** Changes setting row `i` of the current page by `dir` steps (or to choice `choice`). */
  private changeSetting(i: number, dir: number, choice?: number): void {
    const row = SETTINGS_PAGES[this.settingsTab].rows[i];
    if (!row) return;
    const s = this.settings as unknown as Record<string, number | boolean>;
    if (row.kind === 'slider') {
      const key = row.key as SliderKey;
      s[key] = stepValue(this.settings[key], dir, sliderRange(key));
    } else if (choice !== undefined && row.options?.[choice]) {
      s[row.key] = row.options[choice].value;
    } else {
      s[row.key] = stepChoice(row, s[row.key], dir);
    }
    this.settingsRow = i;
    this.renderSettings();
    this.focusRow(i);
    this.onSettings({ ...this.settings });
  }

  private focusRow(i: number): void {
    this.root.querySelector<HTMLElement>(`.srow[data-row="${i}"]`)?.focus({ preventScroll: true });
  }

  /** Widens the sketch's view to the frame's shape, so it fills it with more of the valley. */
  private fitMap(): void {
    const frame = this.el('mapFrame');
    const svg = frame.querySelector('svg');
    if (!svg || frame.clientWidth === 0 || frame.clientHeight === 0) return;
    svg.setAttribute(
      'viewBox',
      fitViewBoxText(this.mapBounds, frame.clientWidth / frame.clientHeight),
    );
  }

  // ---------------------------------------------------------------- input

  /** The keys the current screen answers to. */
  private keys(): readonly Key[] {
    if (this.confirming) return CONFIRM_KEYS;
    const keys = [...(MENU_KEYS[this.state] ?? []), ...(BAR_KEYS[this.state] ?? [])];
    if (this.state === 'boot' && this.bootDone)
      keys.push({ cap: 'ENTER', label: 'CONTINUE', action: 'continue', tone: 'go' });
    return keys;
  }

  private press(a: Action): void {
    switch (a) {
      case 'next':
        this.pickParagraph(this.para + 1);
        return;
      case 'askRestart':
      case 'askQuit':
        this.confirming = a === 'askRestart' ? 'restart' : 'quit';
        this.renderFrame();
        this.root.querySelector<HTMLElement>('.confirm .key')?.focus({ preventScroll: true });
        return;
      case 'cancel':
        this.confirming = null;
        this.renderFrame();
        this.focusFirst();
        return;
      case 'confirm': {
        const what = this.confirming;
        this.confirming = null;
        this.renderFrame();
        if (what) this.onButton(what === 'restart' ? 'restart' : 'quit');
        return;
      }
      default:
        this.onButton(a);
    }
  }

  private click(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>('[data-a]');
    if (btn) {
      e.stopPropagation();
      this.press(btn.dataset.a as Action);
      return;
    }
    const para = target.closest<HTMLElement>('[data-para]');
    if (para) return this.pickParagraph(Number(para.dataset.para));
    const tab = target.closest<HTMLElement>('[data-tab]');
    if (tab) {
      this.settingsTab = Number(tab.dataset.tab);
      this.settingsRow = 0;
      return this.renderSettings();
    }
    const row = target.closest<HTMLElement>('[data-row]');
    const step = target.closest<HTMLElement>('[data-step]');
    const choice = target.closest<HTMLElement>('[data-choice]');
    if (row && (step || choice)) {
      const i = Number(row.dataset.row);
      return this.changeSetting(
        i,
        Number(step?.dataset.step ?? 0),
        choice ? Number(choice.dataset.choice) : undefined,
      );
    }
    // The boot screen skips on any click; the whole title screen is a "click to begin" button.
    if (this.state === 'boot') this.press('continue');
    else if (this.state === 'title' && !target.closest('button')) this.press('begin');
  }

  private key(e: KeyboardEvent): void {
    if (this.state === 'playing' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.code === 'F1' || e.code === 'F5' || e.code === 'F12' || e.code === 'Tab') return;
    if (this.state === 'boot') {
      e.preventDefault();
      this.press('continue');
      return;
    }
    const arrow = e.code.startsWith('Arrow') ? e.code.slice(5) : null;
    if (arrow) {
      e.preventDefault();
      this.arrow(arrow as 'Up' | 'Down' | 'Left' | 'Right');
      return;
    }
    if (this.state === 'settings' && !this.confirming) {
      const n = /^(?:Digit|Numpad)([1-3])$/.exec(e.code);
      if (n) {
        e.preventDefault();
        this.settingsTab = Number(n[1]) - 1;
        this.settingsRow = 0;
        this.renderSettings();
        this.focusRow(0);
        return;
      }
    }
    // Enter / space on a focused button clicks it natively: don't press a second key as well.
    const active = document.activeElement as HTMLElement | null;
    if (
      (e.code === 'Enter' || e.code === 'Space') &&
      active?.tagName === 'BUTTON' &&
      this.root.contains(active)
    )
      return;
    const k = softKeyFor(this.keys(), e.code);
    if (k) {
      e.preventDefault();
      this.press(k.action);
    }
  }

  private arrow(dir: 'Up' | 'Down' | 'Left' | 'Right'): void {
    if (this.state === 'briefing' && (dir === 'Left' || dir === 'Right')) {
      this.pickParagraph(this.para + (dir === 'Right' ? 1 : -1));
      this.onFocusMove();
      return;
    }
    if (this.state === 'settings') {
      const rows = SETTINGS_PAGES[this.settingsTab].rows.length;
      if (dir === 'Up' || dir === 'Down') {
        this.settingsRow = stepFocus(this.settingsRow, rows, dir === 'Down' ? 1 : -1);
        this.focusRow(this.settingsRow);
      } else this.changeSetting(this.settingsRow, dir === 'Right' ? 1 : -1);
      this.onFocusMove();
      return;
    }
    const keys = this.focusables();
    if (!keys.length) return;
    const i = keys.indexOf(document.activeElement as HTMLElement);
    const step = dir === 'Down' || dir === 'Right' ? 1 : -1;
    keys[stepFocus(i, keys.length, step)].focus({ preventScroll: true });
    this.onFocusMove();
  }

  /** The keys in the visible page and the bottom bar, in reading order. */
  private focusables(): HTMLElement[] {
    const scope = this.confirming
      ? this.root.querySelectorAll<HTMLElement>('.confirm .key')
      : this.root.querySelectorAll<HTMLElement>(
          `[data-screen="${this.state}"] .key, .frame-bottom .key`,
        );
    return [...scope].filter((k) => k.offsetParent !== null);
  }

  private focusFirst(): void {
    if (this.state === 'settings') return this.focusRow(this.settingsRow);
    const go = this.focusables().find((k) => k.classList.contains('go')) ?? this.focusables()[0];
    go?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- DOM helpers

  private el(k: string): HTMLElement {
    return this.root.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
  }

  private text(k: string, t: string): void {
    const e = this.el(k);
    if (e.textContent !== t) e.textContent = t;
  }
}
