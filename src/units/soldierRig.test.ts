import { describe, expect, it } from 'vitest';
import {
  BODY,
  kitFor,
  partHeat,
  RECOIL,
  rigSoldier,
  stanceFor,
  type PartId,
  type PlacedPart,
  type RigInput,
} from './soldierRig';

const base: RigInput = {
  state: 'idle',
  walkPhase: 0,
  crouched: false,
  sinceShot: Infinity,
  friendly: false,
  id: 1,
  lean: 0,
};

function rig(u: Partial<RigInput>): PlacedPart[] {
  const out: PlacedPart[] = [];
  const n = rigSoldier({ ...base, ...u }, out);
  return out.slice(0, n).map((p) => ({ ...p }));
}

const all = (parts: PlacedPart[], id: PartId) => parts.filter((p) => p.part === id);
const one = (parts: PlacedPart[], id: PartId) => all(parts, id)[0];

/** The lowest point of a shin (its foot end) in the body frame. */
function footY(shin: PlacedPart): number {
  // The shin center plus half its length along its own down axis (pitch = −forward).
  return shin.y - Math.cos(shin.pitch) * (BODY.shin / 2);
}

describe('soldier figure (M8+ Phase C: "look like real soldiers, not tubes")', () => {
  it('has a head, torso, two arms in two segments, two legs in two segments and a rifle', () => {
    const p = rig({});
    expect(all(p, 'torso')).toHaveLength(1);
    expect(all(p, 'head')).toHaveLength(1);
    for (const id of ['thigh', 'shin', 'upperArm', 'forearm'] as const)
      expect(all(p, id)).toHaveLength(2);
    expect(all(p, 'rifle')).toHaveLength(1);
    // Head above the torso, legs below the hips.
    expect(one(p, 'head').y).toBeGreaterThan(one(p, 'torso').y);
    for (const s of all(p, 'shin')) expect(s.y).toBeLessThan(0);
  });

  it('standing still, both feet are on the ground (about a leg length below the hips)', () => {
    const p = rig({});
    for (const s of all(p, 'shin')) {
      expect(footY(s)).toBeCloseTo(-(BODY.thigh + BODY.shin), 1);
    }
  });

  it('walking swings the legs opposite each other, and they cross over a stride', () => {
    const a = stanceFor({ ...base, state: 'moving', walkPhase: Math.PI / 2 });
    const b = stanceFor({ ...base, state: 'moving', walkPhase: (3 * Math.PI) / 2 });
    expect(a.thighL).toBeGreaterThan(0.3);
    expect(a.thighR).toBeLessThan(-0.3);
    expect(b.thighL).toBeLessThan(-0.3);
    expect(b.thighR).toBeGreaterThan(0.3);
  });

  it('running (fleeing) takes longer strides and bends the knees more than walking', () => {
    let walkKnee = 0;
    let runKnee = 0;
    let walkSwing = 0;
    let runSwing = 0;
    for (let k = 0; k < 32; k++) {
      const ph = (k / 32) * Math.PI * 2;
      const w = stanceFor({ ...base, state: 'moving', walkPhase: ph });
      const r = stanceFor({ ...base, state: 'fleeing', walkPhase: ph });
      walkKnee = Math.max(walkKnee, w.kneeL);
      runKnee = Math.max(runKnee, r.kneeL);
      walkSwing = Math.max(walkSwing, w.thighL);
      runSwing = Math.max(runSwing, r.thighL);
    }
    expect(runKnee).toBeGreaterThan(walkKnee);
    expect(runSwing).toBeGreaterThan(walkSwing);
  });

  it('crouched in cover it kneels: low feet and knees, the knees well bent', () => {
    const s = stanceFor({ ...base, crouched: true });
    expect(s.kneeL).toBeGreaterThan(0.5);
    expect(s.kneeR).toBeGreaterThan(1.2);
    const p = rig({ crouched: true });
    // Nothing of the legs reaches as low as a standing leg: the hips have dropped toward them.
    for (const sh of all(p, 'shin'))
      expect(footY(sh)).toBeGreaterThan(-(BODY.thigh + BODY.shin) + 0.25);
  });

  it('firing shoulders the rifle: level, at shoulder height, pointing forward', () => {
    const p = rig({ state: 'firing', sinceShot: 1 });
    const r = one(p, 'rifle');
    expect(Math.abs(r.pitch)).toBeLessThan(0.05);
    expect(r.y).toBeGreaterThan(BODY.shoulderY - 0.15);
    expect(r.z).toBeGreaterThan(0.2);
    // At low ready (idle, no recent shot) the muzzle points down.
    expect(one(rig({}), 'rifle').pitch).toBeGreaterThan(0.3);
  });

  it('the rifle kicks back right after a shot, then settles', () => {
    const fresh = one(rig({ state: 'firing', sinceShot: 0 }), 'rifle');
    const later = one(rig({ state: 'firing', sinceShot: 1 }), 'rifle');
    expect(later.z - fresh.z).toBeCloseTo(RECOIL, 5);
  });

  it('flung and dead bodies throw their arms out sideways', () => {
    for (const state of ['flung', 'dead'] as const) {
      const arms = all(rig({ state }), 'upperArm');
      expect(Math.abs(arms[0].roll)).toBeGreaterThan(0.5);
      expect(Math.sign(arms[0].roll)).toBe(-Math.sign(arms[1].roll));
    }
  });

  it('the legs counter the body lean, so a leaning soldier keeps its feet under it', () => {
    const upright = stanceFor({ ...base, state: 'moving', walkPhase: 0 });
    const leaning = stanceFor({ ...base, state: 'moving', walkPhase: 0, lean: 0.3 });
    expect(leaning.thighL - upright.thighL).toBeCloseTo(0.3);
    // Not for bodies (their pose is the fall itself).
    expect(stanceFor({ ...base, state: 'dead', lean: 0.3 }).thighL).toBe(
      stanceFor({ ...base, state: 'dead' }).thighL,
    );
  });
});

describe('soldier kit', () => {
  it('Ridgeback wears helmets with NVGs and plate carriers', () => {
    const p = rig({ friendly: true });
    expect(all(p, 'helmet')).toHaveLength(1);
    expect(all(p, 'nvg')).toHaveLength(1);
    expect(all(p, 'carrier')).toHaveLength(1);
    expect(all(p, 'cap')).toHaveLength(0);
    // The NVG sits on the front of the helmet.
    expect(one(p, 'nvg').z).toBeGreaterThan(BODY.head.r);
  });

  it('militia never wear NVGs or plates; most wear soft caps, some go bareheaded', () => {
    let caps = 0;
    let bare = 0;
    for (let id = 0; id < 200; id++) {
      const k = kitFor(false, id);
      expect(k.nvg).toBe(false);
      expect(k.carrier).toBe(false);
      expect(k.headgear).not.toBe('helmet');
      if (k.headgear === 'cap') caps++;
      else bare++;
    }
    expect(caps).toBeGreaterThan(bare);
    expect(bare).toBeGreaterThan(20);
    // Stable: the same soldier always looks the same.
    expect(kitFor(false, 42)).toEqual(kitFor(false, 42));
  });
});

describe('soldier thermal signature', () => {
  it('bare skin reads hottest, clothing and kit cooler', () => {
    const body = 0.95;
    expect(partHeat('head', body, Infinity)).toBe(body);
    expect(partHeat('forearm', body, Infinity)).toBeGreaterThan(partHeat('torso', body, Infinity));
    expect(partHeat('torso', body, Infinity)).toBeGreaterThan(partHeat('carrier', body, Infinity));
    expect(partHeat('thigh', body, Infinity)).toBeLessThan(partHeat('torso', body, Infinity));
    // Cooling bodies cool every part.
    expect(partHeat('head', 0.4, Infinity)).toBeLessThan(partHeat('head', 0.95, Infinity));
  });

  it('a rifle barrel warms up when fired and cools over about 10 s', () => {
    const cold = partHeat('rifle', 0.95, Infinity);
    const hot = partHeat('rifle', 0.95, 0);
    expect(hot).toBeGreaterThan(cold + 0.5);
    expect(partHeat('rifle', 0.95, 30)).toBeLessThan(cold + 0.05);
  });

  it('reuses the output list between calls (no per-frame allocation once warm)', () => {
    const out: PlacedPart[] = [];
    rigSoldier({ ...base, friendly: true }, out);
    const size = out.length;
    const first = out[0];
    rigSoldier({ ...base, friendly: false }, out);
    expect(out.length).toBe(size);
    expect(out[0]).toBe(first);
  });
});
