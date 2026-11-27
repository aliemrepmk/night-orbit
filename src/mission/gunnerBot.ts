import { Vector3 } from 'three';
import { Explosions } from '../combat/Explosions';
import { CONFIG } from '../config';
import { createRng, type Rng } from '../core/rng';
import type { Effects } from '../fx/Effects';
import { AirSupport, footprintDistance } from '../gunship/AirSupport';
import { STRIKES } from '../gunship/airSupportDefs';
import { Gunship } from '../gunship/Gunship';
import { Projectiles } from '../gunship/Projectiles';
import { Sensor } from '../gunship/Sensor';
import { ShotPlanner } from '../gunship/shot';
import { WEAPONS, type StrikeId, type WeaponId } from '../gunship/weaponDefs';
import { Weapons } from '../gunship/Weapons';
import { SensorFX } from '../render/SensorFX';
import { MAP } from '../world/MapData';
import { nearestFootprint } from './clinic';
import { doEveryPrompt, headlessGame, type HeadlessGame } from './headlessGame';
import { rateMission } from './stats';
import type { StaticWorld } from './battle';
import type { TwistRoll } from './twists';

/**
 * The headless gunner bot (M10 balance, PLAN.md §10): a stand-in player with human limits,
 * flying the real gunship and firing the real guns (same `ShotPlanner`, shells, blasts and
 * damage as the game), so mission length, team damage and hull damage can be measured over
 * many seeds without anyone playing. It calls air strikes on big groups (like `Game`: AA near
 * the target aborts them), and it isn't blinded by fog (a little stronger than a real player).
 */

/** How good the stand-in player is. */
export interface Skill {
  readonly name: string;
  /** Seconds between decisions (picking a target, a weapon, a new aim error). */
  readonly reaction: number;
  /** Seconds a new contact must be in sensor reach before the player has noticed it. */
  readonly acquire: number;
  /** Aim error (1 σ, ground meters) at the 105 mm's wide view; narrower views scale it down. */
  readonly aimError: number;
  /** Slew speed in view-heights per second (how fast the crosshair crosses the screen). */
  readonly slewViews: number;
  /** Share of a moving target's lead the player gets right (0 = aims at it, 1 = perfect). */
  readonly lead: number;
  /** Seconds from the missile warning to pressing X, and the chance of reacting at all. */
  readonly flareDelay: number;
  readonly flareChance: number;
}

export const SKILLS = {
  sharp: {
    name: 'sharp',
    reaction: 0.5,
    acquire: 1.5,
    aimError: 4,
    slewViews: 1.2,
    lead: 0.8,
    flareDelay: 0.8,
    flareChance: 0.95,
  },
  average: {
    name: 'average',
    reaction: 0.9,
    acquire: 3,
    aimError: 8,
    slewViews: 0.8,
    lead: 0.5,
    flareDelay: 1.5,
    flareChance: 0.75,
  },
  rookie: {
    name: 'rookie',
    reaction: 1.4,
    acquire: 5,
    aimError: 14,
    slewViews: 0.5,
    lead: 0.2,
    flareDelay: 2.5,
    flareChance: 0.5,
  },
} as const satisfies Record<string, Skill>;

export type ContactKind = 'infantry' | 'vehicle' | 'aa';

/** Something the bot could shoot at, as it sees it. */
export interface Contact {
  readonly kind: ContactKind;
  readonly x: number;
  readonly z: number;
  /** How much it matters on its own (AA, MANPADS, armed vehicles high; a rifleman 1). */
  readonly weight: number;
  /** Enemy soldiers within the cluster radius (itself included). */
  readonly cluster: number;
}

/** Threat score: the contact's own weight, more the closer it is to Ridgeback. */
export function threatScore(c: Contact, teamX: number, teamZ: number): number {
  const d = Math.hypot(c.x - teamX, c.z - teamZ);
  // AA and MANPADS threaten the aircraft wherever they are; the rest threaten the team.
  const near = c.kind === 'aa' ? 1 : 1 + 250 / (d + 50);
  return c.weight * near * (1 + 0.15 * (c.cluster - 1));
}

/** The weapons the player prefers for a contact, best first. */
export function preferredWeapons(c: Contact): readonly WeaponId[] {
  if (c.kind !== 'infantry') return ['105', '40'];
  if (c.cluster >= 3) return ['105', '40', '25'];
  return ['40', '25', '105'];
}

/** What the gun can do right now and what is near the aim point. */
export interface FireCheck {
  readonly ready: Readonly<Record<WeaponId, boolean>>;
  /** Ground distance from the aim point to the nearest friendly (Ridgeback, the helicopter). */
  readonly friendly: number;
  /** ... to the nearest protected thing (clinic, civilian vehicle). */
  readonly protectedDist: number;
  /** Extra room (m) the player leaves for their own aim error (about 2.5 σ). */
  readonly margin: number;
}

/**
 * The weapon to fire at a contact, or null to hold fire: the first preferred gun that is
 * ready, isn't danger close to a friendly and can't reach anything protected. A careful
 * player: never knowingly danger close, never near the clinic or the bus.
 */
export function chooseWeapon(c: Contact, f: FireCheck): WeaponId | null {
  for (const id of preferredWeapons(c)) {
    const w = WEAPONS[id];
    if (!f.ready[id]) continue;
    if (f.friendly <= w.dangerClose + f.margin) continue;
    if (f.protectedDist <= w.blastRadius + 6 + f.margin) continue;
    return id;
  }
  return null;
}

/** A standard normal sample (Box–Muller). */
function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** What one run of the mission looked like. */
export interface RunReport {
  readonly seed: number;
  readonly skill: string;
  readonly roll: string;
  readonly result: 'complete' | 'failed' | 'timeout';
  readonly failure: string;
  readonly seconds: number;
  /** Seconds spent in each phase, in order. */
  readonly phases: readonly { id: string; seconds: number }[];
  /** Ridgeback's lowest health (% of max) and the total damage they took. */
  readonly teamMin: number;
  readonly teamTaken: number;
  /** The gunship's hull at the end (% of max), missiles launched / hit. */
  readonly hull: number;
  readonly missiles: number;
  readonly missileHits: number;
  readonly shots: Readonly<Record<WeaponId, number>>;
  /** Strikes called (and aborted by AA). */
  readonly strikes: Readonly<Record<StrikeId, number>>;
  readonly strikesAborted: number;
  readonly kills: number;
  readonly dangerClose: number;
  readonly timeouts: readonly string[];
  readonly grade: string;
  readonly score: number;
}

const NO_FX = { explosion() {}, flares() {} } as unknown as Effects;
/** Enemy soldiers in a group before the player spends a strike on it. */
const STRIKE_CLUSTER: Record<StrikeId, number> = { gunrun: 4, bomb: 6 };
/** Extra margin (m) the player keeps between friendlies and a strike's danger-close line. */
const STRIKE_MARGIN = 15;
const CLUSTER_RADIUS = 14;
const UNIT_WEIGHT = { rifleman: 1, machineGunner: 1.4, manpads: 3, mortar: 2.2, ridgeback: 0 };

/**
 * One headless run with a bot gunner. Steps the same systems in the same order as
 * `Game.update` (minus the screen, the strikes and the sounds).
 */
export class GunnerSim {
  readonly g: HeadlessGame;
  readonly gunship = new Gunship();
  readonly sensor: Sensor;
  readonly weapons = new Weapons();
  readonly projectiles = new Projectiles();
  readonly air = new AirSupport(createRng(8080));
  private readonly shots: ShotPlanner;
  private readonly explosions: Explosions;
  private readonly spreadRng = createRng(31337);
  private readonly rng: Rng;

  time = 0;
  private think = 0;
  /** When each contact (by object) was first in sensor reach. */
  private readonly firstSeen = new Map<object, number>();
  /** Last position of each contact, for its velocity. */
  private readonly lastPos = new Map<object, { x: number; z: number; t: number }>();
  /** Targets the player gave up on (in cover, behind a roof) until the given time. */
  private readonly ignoreUntil = new Map<object, number>();
  private target: { obj: object; contact: Contact; vx: number; vz: number } | null = null;
  private shotsAtTarget = 0;
  private readonly desired = new Vector3();
  private readonly landing = new Vector3();
  private readonly groundAt: (x: number, z: number) => number;
  private readonly error = { x: 0, z: 0 };
  private flareTimer = -1;
  private focus: string | null = null;
  private held = false;
  private clicks = 0;
  private switchWait = 0;

  // Report counters.
  readonly shotCount: Record<WeaponId, number> = { '25': 0, '40': 0, '105': 0 };
  teamMin = 1;
  missiles = 0;
  missileHits = 0;
  readonly strikes: Record<StrikeId, number> = { gunrun: 0, bomb: 0 };
  strikesAborted = 0;

  constructor(
    world: StaticWorld,
    readonly roll: TwistRoll,
    readonly skill: Skill,
  ) {
    this.g = headlessGame(world, roll);
    this.rng = createRng(roll.seed * 7919 + 17);
    const g = this.g;
    this.groundAt = (x, z) => world.terrain.heightAt(x, z);
    const ground = { heightAt: this.groundAt };
    this.sensor = new Sensor(this.gunship, ground, 16 / 9);
    this.shots = new ShotPlanner(world.collision);
    this.explosions = new Explosions(NO_FX, this.sensor, new SensorFX(), g.bus, (c, r) =>
      g.units.targetsNear(c, r),
    );
    g.units.plane = this.gunship;
    g.bus.on('gunJammed', (e) => this.weapons.guns['105'].jam(e.seconds));
    g.bus.on('engineLost', () => (this.gunship.speedScale = CONFIG.airDefense.engineOutSpeed));
    g.bus.on('hullHit', (e) => {
      if (e.by === 'missile') this.missileHits++;
    });
    g.host.start();
    const t = g.units.teamPosition;
    this.gunship.reset(t.x, t.z);
    this.sensor.reset(t.x, t.z);
  }

  /** Plays to the end (or `maxSeconds`) and reports. */
  run(dt = 1 / 30, maxSeconds = 40 * 60): RunReport {
    const g = this.g;
    const phases: { id: string; seconds: number }[] = [];
    let phaseStart = 0;
    let phase = -1;
    while (this.time < maxSeconds && g.host.mission.status === 'running' && !g.failures.length) {
      this.step(dt);
      if (g.host.mission.phaseIndex !== phase) {
        if (phase >= 0) phases[phases.length - 1].seconds = Math.round(this.time - phaseStart);
        phase = g.host.mission.phaseIndex;
        phaseStart = this.time;
        phases.push({ id: g.host.mission.phase?.id ?? '?', seconds: 0 });
      }
    }
    if (phases.length) phases[phases.length - 1].seconds = Math.round(this.time - phaseStart);
    const summary = g.stats.summary(g.units.team.taken, this.time, g.host.bonuses);
    const rating = rateMission(summary);
    const status = g.host.mission.status;
    return {
      seed: this.roll.seed,
      skill: this.skill.name,
      roll: `${this.roll.extraction} + ${this.roll.side.join(',')}`,
      result: g.failures.length ? 'failed' : status === 'complete' ? 'complete' : 'timeout',
      failure: g.failures[0] ?? '',
      seconds: Math.round(this.time),
      phases,
      teamMin: Math.round(this.teamMin * 100),
      teamTaken: Math.round(g.units.team.taken),
      hull: Math.round((g.airDefense.hull / CONFIG.airDefense.hull) * 100),
      missiles: this.missiles,
      missileHits: this.missileHits,
      shots: { ...this.shotCount },
      strikes: { ...this.strikes },
      strikesAborted: this.strikesAborted,
      kills: g.stats.kills,
      dangerClose: g.stats.dangerClose,
      timeouts: [...g.host.mission.timedOut],
      grade: rating.grade,
      score: rating.score,
    };
  }

  /** One fixed step, in `Game.update` order. */
  step(dt: number): void {
    const g = this.g;
    this.time += dt;
    doEveryPrompt(g);
    this.gunship.update(dt);
    this.sensor.update(dt);
    this.decide(dt);

    const n = this.weapons.update(dt, this.sensor.weapon, this.held, this.clicks);
    this.clicks = 0;
    for (let i = 0; i < n; i++) this.fire(this.sensor.weapon);
    this.projectiles.update(dt, (s) =>
      this.explosions.detonate(s.to, WEAPONS[s.weapon], s.hitKind === 'ground'),
    );

    this.air.update(dt, (x, z, o) =>
      this.explosions.detonate(this.landing.set(x, this.groundAt(x, z), z), o, true),
    );

    const before = g.airDefense.missiles.length;
    g.host.update(dt, this.sensor.aim);
    g.units.update(dt);
    g.vehicles.update(dt);
    g.airDefense.update(dt, this.gunship, () => {});
    this.missiles += Math.max(0, g.airDefense.missiles.length - before);
    this.followTeam();
    this.teamMin = Math.min(this.teamMin, g.units.team.value / g.units.team.max);
  }

  private fire(id: WeaponId): void {
    const s = this.shots.plan(
      id,
      this.gunship.position,
      this.gunship.center,
      this.sensor.aim,
      this.spreadRng,
    );
    if (!s) return;
    this.projectiles.fire(id, s.from, s.to, s.duration, s.kind, s.box);
    this.g.bus.emit('shotFired', { weapon: id });
    this.shotCount[id]++;
    this.shotsAtTarget++;
  }

  /** `Game.followTeam`: the orbit follows the mission's focus zone, else Ridgeback. */
  private followTeam(): void {
    const host = this.g.host;
    if (host.focus !== this.focus) {
      this.focus = host.focus;
      if (host.focus) {
        const [x, z] = MAP.zones[host.focus].center;
        this.gunship.setFocus(x, z);
      }
    }
    if (this.focus) return;
    const team = this.g.units.teamPosition;
    const c = this.gunship.targetCenter;
    if (Math.hypot(team.x - c.x, team.z - c.z) > CONFIG.ridgeback.followDistance) {
      this.gunship.setFocus(team.x, team.z);
    }
  }

  /** The player: flares, target choice, slewing toward the (erroneous) aim point, trigger. */
  private decide(dt: number): void {
    const s = this.skill;
    this.flares(dt);
    this.think -= dt;
    if (this.think <= 0) {
      this.think = s.reaction;
      this.pickTarget();
    }
    this.held = false;
    const t = this.target;
    if (!t) return;

    // Lead the target by its motion over the shell's flight time, as well as the player can.
    const w = WEAPONS[this.sensor.weapon];
    const flight = this.gunship.position.distanceTo(this.sensor.aim) / w.shellSpeed;
    const lead = s.lead * flight;
    this.desired.set(
      t.contact.x + t.vx * lead + this.error.x,
      0,
      t.contact.z + t.vz * lead + this.error.z,
    );
    const viewHeight = 2 * this.sensor.slantRange * Math.tan((this.sensor.fovDeg * Math.PI) / 360);
    const maxMove = s.slewViews * viewHeight * dt;
    const dx = this.desired.x - this.sensor.aim.x;
    const dz = this.desired.z - this.sensor.aim.z;
    const d = Math.hypot(dx, dz);
    const k = d > maxMove ? maxMove / d : 1;
    this.sensor.aim.x += dx * k;
    this.sensor.aim.z += dz * k;
    this.sensor.update(0); // gimbal limit and ground height

    this.switchWait -= dt;
    if (this.switchWait > 0 || d > Math.max(3, viewHeight * 0.04)) return;
    const id = this.sensor.weapon;
    const gun = this.weapons.guns[id];
    if (id === '25') this.held = gun.status === 'ready' && gun.heat < 0.85;
    else if (gun.status === 'ready') this.clicks = 1;
  }

  private flares(dt: number): void {
    const ad = this.g.airDefense;
    if (ad.inbound.length === 0) {
      this.flareTimer = -1;
      return;
    }
    if (this.flareTimer < 0) {
      this.flareTimer = this.rng() < this.skill.flareChance ? this.skill.flareDelay : Infinity;
    }
    this.flareTimer -= dt;
    if (this.flareTimer <= 0) {
      ad.dropFlares(this.gunship);
      this.flareTimer = Infinity; // once per warning
    }
  }

  /** Every contact the player has noticed, in sensor reach. */
  private *contacts(): Generator<{ obj: object; contact: Contact; vx: number; vz: number }> {
    const g = this.g;
    const c = this.gunship.center;
    const reach = CONFIG.sensor.gimbalRadius;
    const seen = (obj: object, x: number, z: number): boolean => {
      if (Math.hypot(x - c.x, z - c.z) > reach) {
        this.firstSeen.delete(obj);
        return false;
      }
      if (!this.firstSeen.has(obj)) this.firstSeen.set(obj, this.time);
      if ((this.ignoreUntil.get(obj) ?? 0) > this.time) return false;
      return this.time - this.firstSeen.get(obj)! >= this.skill.acquire;
    };
    const velocity = (obj: object, x: number, z: number) => {
      const p = this.lastPos.get(obj);
      this.lastPos.set(obj, { x, z, t: this.time });
      if (!p || this.time - p.t <= 0) return { vx: 0, vz: 0 };
      return { vx: (x - p.x) / (this.time - p.t), vz: (z - p.z) / (this.time - p.t) };
    };
    const enemies = g.units.enemies.filter((e) => e.alive);
    for (const e of enemies) {
      const { x, z } = e.position;
      if (!seen(e, x, z)) continue;
      let cluster = 0;
      for (const o of enemies)
        if (Math.hypot(o.position.x - x, o.position.z - z) < CLUSTER_RADIUS) cluster++;
      const weight = UNIT_WEIGHT[e.def.type];
      yield { obj: e, contact: { kind: 'infantry', x, z, weight, cluster }, ...velocity(e, x, z) };
    }
    for (const v of g.vehicles.vehicles) {
      if (!v.inUse || !v.alive || v.def.civilian) continue;
      const { x, z } = v.position;
      if (!seen(v, x, z)) continue;
      const weight = v.def.antiAir ? 3 : 2;
      yield {
        obj: v,
        contact: { kind: 'vehicle', x, z, weight, cluster: 1 },
        ...velocity(v, x, z),
      };
    }
    for (const a of g.airDefense.guns) {
      if (!a.active || !a.alive) continue;
      const { x, z } = a.position;
      if (!seen(a, x, z)) continue;
      yield { obj: a, contact: { kind: 'aa', x, z, weight: 3, cluster: 1 }, vx: 0, vz: 0 };
    }
  }

  private pickTarget(): void {
    const g = this.g;
    const team = g.units.teamPosition;
    // Give up on a target that soaked up shots without dying (in cover, under a roof).
    if (this.target && this.shotsAtTarget >= (this.sensor.weapon === '25' ? 60 : 6)) {
      this.ignoreUntil.set(this.target.obj, this.time + 12);
      this.target = null;
    }
    const contacts = [...this.contacts()];
    this.callStrike(contacts);
    let best: typeof this.target = null;
    let bestScore = 0;
    for (const c of contacts) {
      let score = threatScore(c.contact, team.x, team.z);
      if (this.target && c.obj === this.target.obj) score *= 1.3; // stick with it a while
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    if (!best || best.obj !== this.target?.obj) this.shotsAtTarget = 0;
    this.target = best;
    if (!best) return;

    const s = this.skill;
    const err = s.aimError * Math.min(1, this.sensor.fovDeg / WEAPONS['105'].fovDeg + 0.25);
    this.error.x = gauss(this.rng) * err;
    this.error.z = gauss(this.rng) * err;

    const c = best.contact;
    const id = chooseWeapon(c, {
      ready: {
        '25': this.weapons.guns['25'].status === 'ready',
        '40': this.weapons.guns['40'].status === 'ready',
        '105': this.weapons.guns['105'].status === 'ready',
      },
      friendly: this.nearestFriendly(c.x, c.z),
      protectedDist: this.nearestProtected(c.x, c.z),
      margin: 2.5 * err,
    });
    if (id === null) {
      this.target = null; // hold fire: too close to friends or protected things
      return;
    }
    if (id !== this.sensor.weapon) {
      this.sensor.selectWeapon(id);
      this.switchWait = 0.35; // the view refocuses after a switch
    }
  }

  /**
   * Air support, as a player uses it: the bomb on a big group, the gun run on a smaller one,
   * only when no friendly or protected thing is near the footprint (gun runs are laid across
   * the line to Ridgeback). AA near the target aborts the strike, as in `Game.handleInput`.
   */
  private callStrike(contacts: readonly { contact: Contact }[]): void {
    const g = this.g;
    for (const id of ['bomb', 'gunrun'] as const) {
      if (!this.air.ready(id)) continue;
      const team = g.units.teamPosition;
      for (const { contact: c } of contacts) {
        if (c.kind !== 'infantry' || c.cluster < STRIKE_CLUSTER[id]) continue;
        const toTeam = Math.atan2(team.x - c.x, team.z - c.z);
        const axis = toTeam + Math.PI / 2;
        if (!this.strikeSafe(id, c.x, c.z, axis)) continue;
        this.air.mode = id;
        this.air.axis = axis;
        const threat = g.airDefense.strikeThreat(c.x, c.z);
        if (threat >= CONFIG.airDefense.abortAt) {
          const aborted = this.air.abort();
          if (aborted) {
            g.bus.emit('strikeAborted', { strike: aborted.id });
            this.strikesAborted++;
          }
          return;
        }
        if (this.air.call(c.x, c.z)) {
          if (threat > 0 && this.rng() < CONFIG.airDefense.jetHitChance) {
            g.bus.emit('jetHit', { strike: id });
          }
          g.bus.emit('strikeCalled', { strike: id, x: c.x, z: c.z, danger: false });
          this.strikes[id]++;
        }
        return; // one call per decision
      }
    }
  }

  private strikeSafe(id: StrikeId, x: number, z: number, axis: number): boolean {
    const def = STRIKES[id];
    const keep = def.dangerClose + STRIKE_MARGIN;
    const far = (px: number, pz: number) => footprintDistance(def, x, z, axis, px, pz) > keep;
    for (const f of this.g.units.friendlies) {
      if (f.alive && !far(f.position.x, f.position.z)) return false;
    }
    const h = this.g.host.helicopter;
    if (h.state !== 'gone' && !far(h.position.x, h.position.z)) return false;
    for (const v of this.g.vehicles.vehicles) {
      if (v.inUse && v.def.civilian && !far(v.position.x, v.position.z)) return false;
    }
    // The clinic: keep the whole footprint (plus its blast) clear of it.
    const reach =
      Math.hypot(def.stripLength / 2, def.stripWidth / 2) +
      def.ordnance.blastRadius +
      2 * STRIKE_MARGIN;
    return nearestFootprint(this.g.footprints, x, z) > reach;
  }

  private nearestFriendly(x: number, z: number): number {
    let best = Infinity;
    for (const f of this.g.units.friendlies) {
      if (f.alive) best = Math.min(best, Math.hypot(f.position.x - x, f.position.z - z));
    }
    const h = this.g.host.helicopter;
    if (h.state !== 'gone') best = Math.min(best, Math.hypot(h.position.x - x, h.position.z - z));
    return best;
  }

  private nearestProtected(x: number, z: number): number {
    let best = nearestFootprint(this.g.footprints, x, z);
    for (const v of this.g.vehicles.vehicles) {
      if (v.inUse && v.def.civilian)
        best = Math.min(best, Math.hypot(v.position.x - x, v.position.z - z));
    }
    return best;
  }
}
