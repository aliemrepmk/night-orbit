import { WEAPONS, WEAPON_ORDER, type WeaponId } from '../gunship/weaponDefs';

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
  /** Sensor mode label: "WHT HOT", "BLK HOT" or "NV". */
  sensorMode: string;
  clock: number;
  /** `gpuMs` is null when the browser doesn't expose GPU timers. */
  debug?: { fps: number; gpuMs: number | null; calls: number; triangles: number } | null;
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
        <div class="hud-block center" data-k="obj">OBJ: SENSOR CALIBRATION</div>
        <div class="hud-block right">
          <div data-k="pol">WHT HOT</div>
          <div data-k="rng"></div>
          <div data-k="gimbal"></div>
        </div>
      </div>
      <svg class="reticle" viewBox="-100 -100 200 200" data-k="reticle"></svg>
      <div class="hud-row bottom">
        <div class="hud-block" data-k="weapons"></div>
        <div class="hud-block center" data-k="coords"></div>
        <div class="hud-block right">
          <div data-k="fov"></div>
          <div data-k="clock"></div>
        </div>
      </div>
      <div class="hud-debug" data-k="debug"></div>`;
    for (const node of root.querySelectorAll<HTMLElement>('[data-k]')) {
      this.el[node.dataset.k!] = node;
    }
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
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
    this.set(
      'weapons',
      WEAPON_ORDER.map((id) =>
        id === d.weapon ? `[${WEAPONS[id].label}]` : ` ${WEAPONS[id].label} `,
      ).join(' '),
    );

    if (this.reticleWeapon !== d.weapon) {
      this.reticleWeapon = d.weapon;
      this.el.reticle.innerHTML = RETICLES[d.weapon];
      this.el.reticle.dataset.weapon = d.weapon;
    }

    this.set(
      'debug',
      d.debug
        ? `FPS ${d.debug.fps.toFixed(0)}  GPU ${d.debug.gpuMs === null ? '--' : d.debug.gpuMs.toFixed(1)} MS  CALLS ${d.debug.calls}  TRIS ${(d.debug.triangles / 1000).toFixed(0)}K`
        : '',
    );
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
