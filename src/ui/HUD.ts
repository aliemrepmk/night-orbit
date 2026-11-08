import { WEAPON_ORDER, type WeaponId } from '../gunship/weaponDefs';
import { controlsTable } from './controls';
import type { EdgeArrow } from './edgeArrow';
import { gunLine, inboundLine, strikeLine, teamLine, type GunReadout } from './hudFormat';

/** An off-screen friendly marker (M8): where on the edge, which way, and its label. */
export interface FriendlyArrow extends EdgeArrow {
  readonly label: string;
}

/** Off-screen friendlies drawn at once: Ridgeback and Kestrel 6. */
const MAX_ARROWS = 4; // Ridgeback, Kestrel 6, and up to two inbound missiles

export interface HudData {
  altitude: number;
  heading: number;
  range: number;
  azimuth: number;
  depression: number;
  aimX: number;
  aimZ: number;
  fov: number;
  weapon: WeaponId;
  /** Ammo / heat / reload state of every gun. */
  guns: Readonly<Record<WeaponId, GunReadout>>;
  /** Sensor mode label: "WHT HOT", "BLK HOT" or "NV". */
  sensorMode: string;
  clock: number;
  /** Kestrel 6's health line while it is in the picture ('' otherwise). */
  kestrel: string;
  /** Ridgeback's shared health, its maximum, and whether enemies are shooting at it. */
  team: number;
  teamMax: number;
  underFire: boolean;
  /** An impact just landed danger close to a friendly. */
  dangerClose: boolean;
  /** Air support (PLAN.md §7.19): each strike's state, strikes inbound, and the aiming preview. */
  air: {
    strikes: readonly { label: string; cooldownLeft: number; selected: boolean }[];
    inbound: readonly { callsign: string; eta: number }[];
    /** Footprint outline in CSS pixels while aiming a strike; `danger` = friendlies too close. */
    preview: { points: readonly (readonly [number, number])[]; danger: boolean } | null;
  };
  /** Mission (M7): objective line, radio subtitle, countdowns, and the clinic marker outline. */
  objective: string;
  subtitle: string;
  timers: readonly string[];
  clinicMark: readonly (readonly [number, number])[] | null;
  /** Off-screen friendly arrows (M8). */
  arrows: readonly FriendlyArrow[];
  /** The controls overlay (`H`, M8). */
  help: boolean;
  /** Air defense (M8+ Phase E): the hull and flares lines, and the most urgent warning ('' = none). */
  hull: string;
  flares: string;
  airAlert: string;
  /** `gpuMs` is null when the browser doesn't expose GPU timers. */
  debug?: {
    fps: number;
    gpuMs: number | null;
    calls: number;
    triangles: number;
    kills: number;
    enemies: number;
    vehicles: number;
    /** Mission phase / step (and its timer), and active cheats. */
    mission: string;
    cheats: string;
  } | null;
}

const RETICLES: Record<WeaponId, string> = {
  // 25 mm: fine crosshair with range ticks
  '25': `
    <line x1="-70" y1="0" x2="-10" y2="0"/><line x1="10" y1="0" x2="70" y2="0"/>
    <line x1="0" y1="-70" x2="0" y2="-10"/><line x1="0" y1="10" x2="0" y2="70"/>
    <line x1="-35" y1="-5" x2="-35" y2="5"/><line x1="35" y1="-5" x2="35" y2="5"/>
    <line x1="-5" y1="-35" x2="5" y2="-35"/><line x1="-5" y1="35" x2="5" y2="35"/>`,
  // 40 mm: bracket box with center dot
  '40': `
    <path d="M-45,-25 V-45 H-25 M25,-45 H45 V-25 M45,25 V45 H25 M-25,45 H-45 V25"/>
    <circle cx="0" cy="0" r="2.5" class="fill"/>`,
  // 105 mm: large brackets and a small cross
  '105': `
    <path d="M-85,-55 V-85 H-55 M55,-85 H85 V-55 M85,55 V85 H55 M-55,85 H-85 V55"/>
    <line x1="-12" y1="0" x2="12" y2="0"/><line x1="0" y1="-12" x2="0" y2="12"/>`,
};

/** Plain DOM overlay. Only touches the DOM when a value actually changes. */
export class HUD {
  private readonly el: Record<string, HTMLElement> = {};
  private readonly cache = new Map<string, string>();
  private reticleWeapon: WeaponId | null = null;

  constructor(private readonly root: HTMLElement) {
    root.innerHTML = `
      <div class="hud-row top">
        <div class="hud-block">
          <div>LANTERN 2-1</div>
          <div data-k="alt"></div>
          <div data-k="hdg"></div>
        </div>
        <div class="hud-block center">
          <div data-k="obj"></div>
          <div class="hud-timers" data-k="timers"></div>
          <div class="hud-inbound" data-k="inbound"></div>
        </div>
        <div class="hud-block right">
          <div data-k="pol">WHT HOT</div>
          <div data-k="rng"></div>
          <div data-k="gimbal"></div>
        </div>
      </div>
      <svg class="footprint" data-k="footprint"><polygon data-k="footprintShape"/></svg>
      <svg class="clinic-mark hidden" data-k="clinic"><polygon data-k="clinicShape"/></svg>
      <div class="hud-subtitle" data-k="subtitle"></div>
      <svg class="reticle" viewBox="-100 -100 200 200" data-k="reticle"></svg>
      <div class="hud-alert" data-k="alert"></div>
      <div class="hud-row bottom">
        <div class="hud-block">
          <div class="hud-team" data-k="hull"></div>
          <div class="hud-team" data-k="kestrel"></div>
          <div class="hud-team" data-k="team"></div>
          <div data-k="weapons"></div>
          <div class="hud-air" data-k="air"></div>
          <div data-k="flares"></div>
        </div>
        <div class="hud-block center" data-k="coords"></div>
        <div class="hud-block right">
          <div data-k="fov"></div>
          <div data-k="clock"></div>
        </div>
      </div>
      <div class="hud-debug" data-k="debug"></div>
      ${Array.from({ length: MAX_ARROWS }, (_, i) => `<div class="hud-arrow hidden" data-k="arrow${i}"><span class="tip">▶</span><span class="label"></span></div>`).join('')}
      <div class="hud-help hidden" data-k="help"><div class="title">CONTROLS · H TO CLOSE</div>${controlsTable()}</div>`;
    for (const node of root.querySelectorAll<HTMLElement>('[data-k]')) {
      this.el[node.dataset.k!] = node;
    }
  }

  /** `behindScreen`: a menu is on top, so the middle of the view (reticle, alerts, subtitles) hides. */
  show(visible: boolean, behindScreen = false): void {
    this.root.classList.toggle('hidden', !visible);
    this.root.classList.toggle('behind-screen', behindScreen);
  }

  update(d: HudData): void {
    this.set('alt', `ALT ${pad(Math.round(d.altitude), 4)} M`);
    this.set('hdg', `HDG ${pad(Math.round(d.heading) % 360, 3)}`);
    this.set('rng', `RNG ${pad(Math.round(d.range), 4)} M`);
    this.set(
      'gimbal',
      `AZ ${sign(Math.round(d.azimuth))}${pad(Math.abs(Math.round(d.azimuth)), 3)}  EL -${pad(Math.round(d.depression), 2)}`,
    );
    this.set('coords', `TGT ${grid(d.aimX)} ${grid(-d.aimZ)}`);
    this.set('pol', d.sensorMode);
    this.set('fov', `FOV ${d.fov.toFixed(1)}`);
    this.set('clock', clock(d.clock));
    this.set('team', teamLine(d.team, d.teamMax, d.underFire));
    this.set('kestrel', d.kestrel);
    const preview = d.air.preview;
    this.set(
      'alert',
      d.airAlert ||
        (d.dangerClose ? 'DANGER CLOSE' : preview?.danger ? 'FRIENDLIES DANGER CLOSE' : ''),
    );
    this.set('hull', d.hull);
    this.set('flares', d.flares);
    this.set(
      'air',
      d.air.strikes.map((s) => strikeLine(s.label, s.cooldownLeft, s.selected)).join('\n'),
    );
    this.set('inbound', d.air.inbound.map((s) => inboundLine(s.callsign, s.eta)).join('\n'));
    this.set('obj', d.objective);
    this.set('subtitle', d.subtitle);
    this.set('timers', d.timers.join('\n'));
    this.setPolygon('clinic', 'clinicShape', d.clinicMark);
    this.setFootprint(preview);
    this.set('weapons', WEAPON_ORDER.map((id) => gunLine(d.guns[id], id === d.weapon)).join('\n'));

    this.setArrows(d.arrows);
    this.el.help.classList.toggle('hidden', !d.help);

    if (this.reticleWeapon !== d.weapon) {
      this.reticleWeapon = d.weapon;
      this.el.reticle.innerHTML = RETICLES[d.weapon];
      this.el.reticle.dataset.weapon = d.weapon;
    }

    this.set(
      'debug',
      d.debug
        ? `FPS ${d.debug.fps.toFixed(0)}  GPU ${d.debug.gpuMs === null ? '--' : d.debug.gpuMs.toFixed(1)} MS  CALLS ${d.debug.calls}  TRIS ${(d.debug.triangles / 1000).toFixed(0)}K  KIA ${d.debug.kills}  EN ${d.debug.enemies}  VEH ${d.debug.vehicles}\n${d.debug.mission}  ${d.debug.cheats}`
        : '',
    );
  }

  /** Places the off-screen friendly arrows (rounded to whole pixels / degrees, so idle frames don't touch the DOM). */
  private setArrows(arrows: readonly FriendlyArrow[]): void {
    for (let i = 0; i < MAX_ARROWS; i++) {
      const a = arrows[i];
      const el = this.el[`arrow${i}`];
      const key = a
        ? `${Math.round(a.x)},${Math.round(a.y)},${Math.round(a.angle)},${a.label}`
        : '';
      if (this.cache.get(`arrow${i}`) === key) continue;
      this.cache.set(`arrow${i}`, key);
      el.classList.toggle('hidden', !a);
      if (!a) continue;
      el.style.transform = `translate(${Math.round(a.x)}px, ${Math.round(a.y)}px)`;
      (el.firstElementChild as HTMLElement).style.transform = `rotate(${Math.round(a.angle)}deg)`;
      (el.lastElementChild as HTMLElement).textContent = a.label;
      // Keep the label inside the screen: put it on the side away from the edge.
      el.classList.toggle('label-left', Math.cos((a.angle * Math.PI) / 180) > 0.5);
      el.classList.toggle('label-up', Math.sin((a.angle * Math.PI) / 180) > 0.5);
    }
  }

  /** Draws (or hides) the strike footprint outline on the ground. */
  private setFootprint(p: HudData['air']['preview']): void {
    const points = p ? p.points.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ') : '';
    const key = `${points}|${p?.danger ? 1 : 0}`;
    if (this.cache.get('footprint') === key) return;
    this.cache.set('footprint', key);
    this.el.footprintShape.setAttribute('points', points);
    this.el.footprint.classList.toggle('danger', p?.danger === true);
    this.el.footprint.classList.toggle('hidden', p === null);
  }

  /** Draws (or hides) a screen-space outline (the clinic marker). */
  private setPolygon(
    svgKey: string,
    shapeKey: string,
    points: readonly (readonly [number, number])[] | null,
  ): void {
    const text = points ? points.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join(' ') : '';
    if (this.cache.get(svgKey) === text) return;
    this.cache.set(svgKey, text);
    this.el[shapeKey].setAttribute('points', text);
    this.el[svgKey].classList.toggle('hidden', points === null);
  }

  private set(key: string, text: string): void {
    if (this.cache.get(key) === text) return;
    this.cache.set(key, text);
    this.el[key].textContent = text;
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

function sign(n: number): string {
  return n < 0 ? '-' : '+';
}

/** Map coordinate as a 5-digit grid value (meters from the map's south-west corner). */
function grid(v: number): string {
  return pad(Math.max(0, Math.round(v + 800)), 5);
}

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${pad(Math.floor(s / 3600), 2)}:${pad(Math.floor(s / 60) % 60, 2)}:${pad(s % 60, 2)}`;
}
