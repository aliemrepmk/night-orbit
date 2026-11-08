import type { InfantryState } from './Infantry';

/**
 * The soldier figure (M8+ Phase C, play test: "should look like real soldiers, not tubes"):
 * a low-poly body of separate parts, posed procedurally. Pure: it only computes where each part
 * sits relative to the hips, so the poses can be tested; `InfantryRenderer` draws one
 * InstancedMesh per part.
 *
 * Body frame: origin at the hips, +y up, +z forward (the way the soldier faces), +x to its left,
 * meters at life size (the renderer scales by `CONFIG.infantry.scale`). The root lean, bob and
 * heading come from `infantryPose`.
 */

/** Every drawable part. Limbs come in left/right pairs that share one mesh. */
export type PartId =
  | 'torso'
  | 'head'
  | 'thigh'
  | 'shin'
  | 'upperArm'
  | 'forearm'
  | 'rifle'
  | 'helmet'
  | 'nvg'
  | 'carrier'
  | 'cap';

/** Segment sizes (m): each limb part hangs from its joint along −y; the rifle points along +z. */
export const BODY = {
  hipWidth: 0.11,
  shoulderY: 0.6,
  shoulderX: 0.23,
  thigh: 0.48,
  shin: 0.5,
  upperArm: 0.3,
  forearm: 0.32,
  torso: { w: 0.42, h: 0.62, d: 0.25, y: 0.33 },
  head: { r: 0.12, y: 0.8 },
  rifleLength: 0.95,
} as const;

export interface RigInput {
  readonly state: InfantryState;
  readonly walkPhase: number;
  readonly crouched: boolean;
  /** Seconds since this soldier last fired (Infinity: never). */
  readonly sinceShot: number;
  /** Ridgeback (helmet, NVG, plate carrier) or militia (soft cap or bareheaded). */
  readonly friendly: boolean;
  /** Stable per soldier (kit variety). */
  readonly id: number;
  /** The whole-body forward lean from `infantryPose` (radians): the legs counter it so the feet
   * stay under the soldier. */
  readonly lean: number;
}

/** One placed part: position (m, body frame), pitch about +x and roll about +z (radians). */
export interface PlacedPart {
  part: PartId;
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
}

/** Recoil: the rifle kicks back this far (m) right after a shot, over `RECOIL_SECONDS`. */
export const RECOIL = 0.07;
export const RECOIL_SECONDS = 0.14;

/** What the soldier wears on its head (and whether it carries plates and NVGs). */
export function kitFor(
  friendly: boolean,
  id: number,
): { headgear: 'helmet' | 'cap' | 'none'; nvg: boolean; carrier: boolean } {
  if (friendly) return { headgear: 'helmet', nvg: true, carrier: true };
  // Militia: mixed, by a stable hash of the id: most in soft caps, some bareheaded.
  const h = (id * 2654435761) >>> 0;
  return { headgear: h % 5 < 3 ? 'cap' : 'none', nvg: false, carrier: false };
}

/** How the limbs are held for a state: forward swing of each joint (radians). */
interface Stance {
  thighL: number;
  thighR: number;
  kneeL: number;
  kneeR: number;
  /** Shoulder swing forward (both arms hold the rifle) and elbow bend. */
  shoulder: number;
  elbow: number;
  /** Arms spread sideways (bodies flung or dead). */
  spread: number;
  /** Rifle pitch (0 = level forward, positive = muzzle down) and height above the hips. */
  riflePitch: number;
  rifleY: number;
  rifleZ: number;
}

/** The limb angles for a soldier's state (pure; the core of the figure's look). */
export function stanceFor(u: RigInput): Stance {
  const s: Stance = {
    thighL: 0,
    thighR: 0,
    kneeL: 0.08,
    kneeR: 0.08,
    shoulder: 0.55,
    elbow: 1.1,
    spread: 0,
    riflePitch: 0.45, // low ready: muzzle down in front of the body
    rifleY: 0.28,
    rifleZ: 0.24,
  };
  const shooting = u.state === 'firing' || u.sinceShot < 0.6;
  switch (u.state) {
    case 'moving':
    case 'fleeing': {
      const run = u.state === 'fleeing';
      const swing = (run ? 0.75 : 0.45) * Math.sin(u.walkPhase);
      s.thighL = swing;
      s.thighR = -swing;
      // The knee bends while the leg swings through (the back half of each stride).
      s.kneeL = 0.1 + (run ? 1.1 : 0.6) * Math.max(0, -Math.sin(u.walkPhase + 0.6));
      s.kneeR = 0.1 + (run ? 1.1 : 0.6) * Math.max(0, Math.sin(u.walkPhase + 0.6));
      if (run) {
        s.shoulder = 0.3;
        s.elbow = 1.4;
        s.riflePitch = 0.9;
      }
      break;
    }
    case 'flung':
      s.thighL = 0.5;
      s.thighR = -0.3;
      s.kneeL = 0.6;
      s.kneeR = 0.4;
      s.shoulder = 1.6;
      s.elbow = 0.3;
      s.spread = 0.9;
      s.riflePitch = 1.2;
      break;
    case 'dead':
      s.thighL = 0.15;
      s.thighR = -0.1;
      s.shoulder = 0.4;
      s.elbow = 0.4;
      s.spread = 0.7;
      s.riflePitch = 1.5;
      s.rifleY = 0.1;
      s.rifleZ = 0.45;
      break;
    default:
      if (u.crouched) {
        // Kneeling behind cover: the left foot planted, the right knee and shin on the ground.
        s.thighL = 1.2;
        s.kneeL = 0.7;
        s.thighR = 0.15;
        s.kneeR = 1.6;
      }
      break;
  }
  if (u.state !== 'flung' && u.state !== 'dead') {
    // The root lean tips the legs back with the body: swing them forward by as much.
    s.thighL += u.lean;
    s.thighR += u.lean;
  }
  if (shooting && (u.state === 'firing' || u.state === 'idle')) {
    // Shouldered: both arms up and forward, the rifle level at shoulder height.
    s.shoulder = 1.25;
    s.elbow = 0.55;
    s.riflePitch = 0;
    s.rifleY = BODY.shoulderY - 0.05;
    s.rifleZ = 0.18 - RECOIL * Math.max(0, 1 - u.sinceShot / RECOIL_SECONDS);
  }
  return s;
}

/** A limb segment hanging from (jx, jy, jz) swung forward by `forward`: its center. */
function hang(
  len: number,
  forward: number,
  jx: number,
  jy: number,
  jz: number,
  out: PlacedPart,
): void {
  // Rotating the down vector (0, −1, 0) by pitch −forward about +x gives (0, −cos f, sin f).
  out.x = jx;
  out.y = jy - Math.cos(forward) * (len / 2);
  out.z = jz + Math.sin(forward) * (len / 2);
  out.pitch = -forward;
  out.roll = 0;
}

/** Where a limb segment of length `len` swung forward by `forward` ends. */
function tip(len: number, forward: number, jy: number, jz: number): [number, number] {
  return [jy - Math.cos(forward) * len, jz + Math.sin(forward) * len];
}

const part = (id: PartId): PlacedPart => ({ part: id, x: 0, y: 0, z: 0, pitch: 0, roll: 0 });

/**
 * Places every part for a soldier into `out` (reused between calls; returns how many are used).
 * The list order is fixed: torso, head, thigh L/R, shin L/R, upper arm L/R, forearm L/R, rifle,
 * then the kit parts the soldier wears.
 */
export function rigSoldier(u: RigInput, out: PlacedPart[]): number {
  const s = stanceFor(u);
  const B = BODY;
  let n = 0;
  const next = (id: PartId) => {
    if (out.length <= n) out.push(part(id));
    const p = out[n++];
    p.part = id;
    p.roll = 0;
    return p;
  };

  const torso = next('torso');
  torso.x = 0;
  torso.y = B.torso.y;
  torso.z = 0;
  torso.pitch = 0;

  const head = next('head');
  head.x = 0;
  head.y = B.head.y;
  head.z = 0.02;
  head.pitch = 0;

  // Legs: thigh from the hip joint, shin from the knee.
  const legs: [number, number, number][] = [
    [B.hipWidth, s.thighL, s.kneeL],
    [-B.hipWidth, s.thighR, s.kneeR],
  ];
  for (const [x, thigh] of legs) hang(B.thigh, thigh, x, 0, 0, next('thigh'));
  for (const [x, thigh, knee] of legs) {
    const [ky, kz] = tip(B.thigh, thigh, 0, 0);
    hang(B.shin, thigh - knee, x, ky, kz, next('shin'));
  }

  // Arms: both reach toward the rifle; spread pushes them out sideways.
  for (const side of [1, -1]) {
    const p = next('upperArm');
    hang(B.upperArm, s.shoulder, side * B.shoulderX, B.shoulderY, 0, p);
    // Spread swings the arm out from the shoulder: tilt it and move its center outward.
    p.roll = side * s.spread;
    p.x += side * Math.sin(s.spread) * (B.upperArm / 2);
  }
  for (const side of [1, -1]) {
    const [ey, ez] = tip(B.upperArm, s.shoulder, B.shoulderY, 0);
    const p = next('forearm');
    const elbowX = side * (B.shoulderX - 0.05 + Math.sin(s.spread) * B.upperArm);
    hang(B.forearm, s.shoulder + s.elbow, elbowX, ey, ez, p);
    p.roll = side * s.spread;
    p.x += side * Math.sin(s.spread) * (B.forearm / 2);
  }

  const rifle = next('rifle');
  rifle.x = -0.06; // carried slightly right of center (right-handed)
  rifle.y = s.rifleY;
  rifle.z = s.rifleZ + B.rifleLength / 2 - 0.25;
  rifle.pitch = s.riflePitch;

  const kit = kitFor(u.friendly, u.id);
  if (kit.carrier) {
    const c = next('carrier');
    c.x = 0;
    c.y = B.torso.y + 0.04;
    c.z = 0;
    c.pitch = 0;
  }
  if (kit.headgear !== 'none') {
    const h = next(kit.headgear);
    h.x = 0;
    h.y = B.head.y + (kit.headgear === 'helmet' ? 0.035 : 0.07);
    h.z = 0.01;
    h.pitch = 0;
  }
  if (kit.nvg) {
    const g = next('nvg');
    g.x = 0;
    g.y = B.head.y + 0.08;
    g.z = B.head.r + 0.03;
    g.pitch = 0;
  }
  return n;
}

/**
 * Each part's heat in thermal (0–1) from the body's heat: bare skin (head, hands) reads hottest,
 * clothing and kit cooler, and a rifle barrel warms up when fired and cools over ~10 s.
 */
export function partHeat(id: PartId, bodyHeat: number, sinceShot: number): number {
  switch (id) {
    case 'head':
      return bodyHeat;
    case 'forearm':
      return bodyHeat * 0.93; // sleeves rolled, bare hands
    case 'torso':
    case 'upperArm':
      return bodyHeat * 0.8;
    case 'thigh':
    case 'shin':
      return bodyHeat * 0.74;
    case 'carrier':
    case 'helmet':
    case 'cap':
      return bodyHeat * 0.62;
    case 'nvg':
      return bodyHeat * 0.7;
    case 'rifle': {
      const warm = Number.isFinite(sinceShot) ? Math.exp(-sinceShot / 10) : 0;
      return 0.28 + 0.6 * warm;
    }
  }
}
