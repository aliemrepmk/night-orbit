import type { AirDefense } from '../combat/AirDefense';
import { Path } from '../ai/Paths';
import { CONFIG } from '../config';
import type { EventBus } from '../core/EventBus';
import type { GameEvents } from '../core/events';
import type { Rng } from '../core/rng';
import { ORDNANCE } from '../gunship/airSupportDefs';
import { Helicopter } from '../units/Helicopter';
import type { WaveSpawner } from '../units/spawning';
import type { UnitManager } from '../units/UnitManager';
import { VEHICLES } from '../units/vehicleDefs';
import type { VehicleManager } from '../units/VehicleManager';
import { toPathPoints, type MapData, type ZoneId } from '../world/mapTypes';
import { Chatter } from './Chatter';
import { clinicVerdict, nearestFootprint, type Footprint } from './clinic';
import { Mission, type HelicopterStage, type MissionWorld } from './Mission';
import type { Action, MissionDef, Phase } from './missionTypes';
import { Radio } from './Radio';

export type MissionHostConfig = {
  readonly [K in Exclude<keyof typeof CONFIG.mission, 'calibrationLookAway'>]: number;
} & { readonly calibrationLookAway: readonly [number, number] };

export interface MissionHostDeps {
  readonly map: MapData;
  readonly bus: EventBus<GameEvents>;
  readonly units: UnitManager;
  readonly vehicles: VehicleManager;
  readonly spawner: WaveSpawner;
  readonly groundAt: (x: number, z: number) => number;
  /** Footprints of the protected buildings (the clinic and its generator). */
  readonly protectedFootprints: readonly Footprint[];
  readonly rng: Rng;
  readonly cfg?: MissionHostConfig;
  /** Enemy air defense (M8+ Phase E): `activateAA` and the air-defense radio calls. */
  readonly airDefense?: AirDefense;
}

/**
 * Plays a `MissionDef` on the real game systems (PLAN.md §7.14–7.15, §8): it is the `Mission`
 * runner's world (team routes, zone counts, tagged convoys, the helicopter), owns the radio and
 * its reactive chatter, and enforces the protected-clinic rule. `Game` wires it to the screen;
 * the headless auto-play test runs it with no screen at all. Pure: no DOM.
 */
export class MissionHost implements MissionWorld {
  readonly mission: Mission;
  readonly radio = new Radio();
  readonly chatter: Chatter;
  readonly helicopter: Helicopter;
  /** Zone the orbit should hold over (null: follow Ridgeback). */
  focus: ZoneId | null = null;
  /** Seconds left to draw the clinic marker. */
  clinicMarkLeft = 0;
  private route: string | null = null;
  private boarding = false;
  private wasUnderFire = false;
  private readonly roads = new Map<string, Path>();
  private readonly cfg: MissionHostConfig;

  constructor(
    def: MissionDef,
    private readonly d: MissionHostDeps,
  ) {
    this.cfg = d.cfg ?? CONFIG.mission;
    this.mission = new Mission(def, this);
    this.chatter = new Chatter(this.radio, d.rng);
    this.helicopter = new Helicopter(d.groundAt);
    // Kestrel 6 is a real target: blasts can hit it (via the grid), soldiers shoot it when low.
    d.units.addTarget(this.helicopter);
    d.units.airTarget = this.helicopter;
    for (const [id, pts] of Object.entries(d.map.vehiclePaths)) {
      this.roads.set(id, new Path(toPathPoints(pts)));
    }
    // The script decides when enemies come; no free-running waves.
    d.spawner.auto = false;

    const bus = d.bus;
    bus.on('unitKilled', (e) => {
      if (e.by === 'team') return;
      if (e.aa) return; // the "Triple-A destroyed" call comes from `aaDestroyed`
      if (e.kind === 'vehicle') this.chatter.vehicleKilled();
      else this.chatter.infantryKilled();
    });
    bus.on('dangerClose', () => this.chatter.say('dangerClose'));
    bus.on('strikeCalled', (e) => {
      if (e.danger) this.chatter.say('strikeDangerClose');
    });
    bus.on('impact', (e) => this.onImpact(e.pos.x, e.pos.z, e.weapon));
    bus.on('missionFailed', () => this.mission.fail());
    // Air defense (M8+ Phase E): the crew calls what is happening to the aircraft.
    bus.on('aaFiring', () => this.chatter.say('aaFiring'));
    bus.on('aaDestroyed', () => this.chatter.say('aaDestroyed'));
    bus.on('hullHit', (e) => this.chatter.say(e.by === 'missile' ? 'missileHit' : 'hullHit'));
    bus.on('engineLost', () => this.chatter.say('engineLost'));
    bus.on('missileLaunch', () => this.chatter.say('missileLaunch'));
    bus.on('missileDefeated', () => this.chatter.say('missileDefeated'));
    bus.on('flares', (e) => {
      if (e.result === 'wasted') this.chatter.say('flaresWasted');
      else if (e.result === 'empty') this.chatter.say('flaresEmpty');
    });
    bus.on('jetHit', () => this.chatter.say('jetHit'));
    bus.on('strikeAborted', () => this.chatter.say('strikeAborted'));
  }

  /** Starts the mission (at a phase, for `?phase=` and tests). */
  start(phaseId?: string): void {
    const p = this.mission.def.phases.find((x) => x.id === phaseId) ?? this.mission.def.phases[0];
    if (phaseId) this.placeTeam(p);
    this.mission.start(p.id);
  }

  /** Dev cheat `N`: clears the field and jumps to the next phase. */
  skipPhase(): void {
    this.d.spawner.clearQueue();
    this.d.units.killAllEnemies();
    this.d.vehicles.destroyAll();
    const i = this.mission.phaseIndex + 1;
    const next = this.mission.def.phases[i];
    if (next) this.placeTeam(next);
    this.mission.skipPhase();
  }

  /** A player prompt was done (calibration: `weapon25`, `weapon40`, `weapon105`, `sensor`). */
  playerDid(flag: string): void {
    this.mission.setFlag(flag);
  }

  /** Per fixed step. `aim` is the sensor's ground point. */
  update(dt: number, aim: { x: number; z: number }): void {
    const { units, spawner } = this.d;
    // Calibration: "find Ridgeback" means the crosshair is really on them (M8+ fix: it used to
    // count any mouse movement). The prompt clears the flag, so only a look after it counts.
    const team = units.teamPosition;
    if (Math.hypot(aim.x - team.x, aim.z - team.z) < this.cfg.locateRadius) {
      this.mission.setFlag('located');
    }
    this.mission.update(dt);
    spawner.update(dt, units, aim);
    this.helicopter.update(dt);
    this.updateHelicopterDamage();
    this.updateBoarding();
    this.updateTeamChatter();
    this.clinicMarkLeft = Math.max(0, this.clinicMarkLeft - dt);
    const onClinic =
      nearestFootprint(this.d.protectedFootprints, aim.x, aim.z) < this.cfg.clinicHoverRadius;
    this.chatter.update(dt, onClinic);
    this.radio.update(dt);
  }

  // --- MissionWorld ---

  teamReached(route: string): boolean {
    return this.route === route && this.d.units.squad.arrived;
  }

  enemiesInZone(zone: ZoneId): number {
    const z = this.d.map.zones[zone];
    // Soldiers still trickling in count too: a wave that hasn't appeared yet isn't "clear".
    return this.d.units.enemiesWithin(z.center[0], z.center[1], z.radius) + this.d.spawner.queued;
  }

  vehiclesAlive(tag: string): number {
    return this.d.vehicles.aliveTagged(tag);
  }

  helicopterStage(): HelicopterStage {
    return this.helicopter.stage;
  }

  phaseEntered(): void {
    this.radio.dropWaiting();
  }

  perform(a: Action): void {
    const { units, vehicles, spawner, map } = this.d;
    switch (a.kind) {
      case 'say':
        this.radio.say(a.speaker, a.text, a.priority);
        return;
      case 'setOrbitFocus':
        this.focus = a.zone;
        return;
      case 'spawnWave':
        spawner.queueAt(units, a.site, a.count, a.type);
        return;
      case 'activateAA':
        this.d.airDefense?.activate(a.site);
        return;
      case 'spawnConvoy': {
        const road = this.roads.get(a.path);
        if (!road) throw new Error(`Unknown vehicle path "${a.path}"`);
        const n = a.vehicles.length;
        a.vehicles.forEach((type, k) => {
          // The lead starts farthest along, the rest queue up behind it.
          const v = vehicles.spawn(VEHICLES[type], road, (n - 1 - k) * this.cfg.convoyGap);
          if (v) v.tag = a.tag;
        });
        return;
      }
      case 'zoneWaves':
        spawner.auto = a.zone !== null;
        spawner.zone = a.zone;
        if (a.interval > 0) spawner.waveInterval = a.interval;
        return;
      case 'moveTeam': {
        const pts = map.friendlyRoutes[a.route];
        if (!pts) throw new Error(`Unknown team route "${a.route}"`);
        this.route = a.route;
        units.squad.walk(toPathPoints(pts));
        return;
      }
      case 'teamHold':
        units.squad.halt();
        return;
      case 'routZone': {
        const z = map.zones[a.zone];
        spawner.clearQueue();
        units.routEnemiesWithin(z.center[0], z.center[1], z.radius, this.cfg.routSeconds);
        return;
      }
      case 'spawnHelicopter':
        this.helicopter.call(a.from[0], a.from[1], a.pad[0], a.pad[1]);
        return;
      case 'boardHelicopter':
        this.boarding = true;
        return;
      case 'markClinic':
        this.clinicMarkLeft = a.seconds;
        return;
      default:
        // setObjective, setFlag, startTimer, nextPhase, completeMission: the runner's own.
        return;
    }
  }

  private placeTeam(p: Phase): void {
    this.route = null;
    this.d.units.placeTeam(p.teamStart[0], p.teamStart[1]);
  }

  /** Once Kestrel 6 is down, Ridgeback walks to it and climbs in. */
  private updateBoarding(): void {
    if (!this.boarding || this.helicopter.state !== 'landed') return;
    const units = this.d.units;
    const pad = this.helicopter.padPosition;
    const t = units.teamPosition;
    if (this.route !== 'helicopter') {
      this.route = 'helicopter';
      // Stop short of the airframe, beside its door.
      units.squad.walk([
        { x: t.x, z: t.z },
        { x: pad.x + this.cfg.boardOffset, z: pad.z },
      ]);
    }
    if (units.squad.arrived) {
      units.boarded = true;
      this.boarding = false;
      this.helicopter.board();
    }
  }

  /** Kestrel 6 under fire: its radio calls, and the fail when enemy fire brings it down. */
  private updateHelicopterDamage(): void {
    const h = this.helicopter;
    if (h.state === 'destroyed') {
      // Shot down by the player's own round: Explosions already failed the mission.
      if (h.killedBy === 'enemy' && this.mission.status === 'running')
        this.d.bus.emit('missionFailed', { reason: 'helicopter_lost' });
      return;
    }
    if (!h.underFire) return;
    if (h.hp < h.maxHp * this.cfg.heloHurtFraction) this.chatter.say('heloHurt');
    else this.chatter.say('heloUnderFire');
  }

  private updateTeamChatter(): void {
    const team = this.d.units.team;
    if (team.underFire && !this.wasUnderFire) this.chatter.say('teamUnderFire');
    this.wasUnderFire = team.underFire;
    if (team.value < team.max * this.cfg.teamHurtFraction && team.underFire)
      this.chatter.say('teamHurt');
  }

  /** Clinic rule, near-miss warnings and "off target" calls for every impact. */
  private onImpact(x: number, z: number, weapon: keyof typeof ORDNANCE): void {
    if (this.mission.status !== 'running') return;
    const w = ORDNANCE[weapon];
    const verdict = clinicVerdict(nearestFootprint(this.d.protectedFootprints, x, z), w);
    if (verdict === 'hit') {
      this.d.bus.emit('missionFailed', { reason: 'clinic_hit' });
      return;
    }
    if (verdict === 'nearMiss') {
      this.chatter.say('clinicNearMiss');
      return;
    }
    // Off target: a big round that landed near enemies but hit none of them.
    if (weapon !== '40' && weapon !== '105') return;
    const units = this.d.units;
    let near = false;
    let close = false;
    for (const e of units.enemies) {
      // The impact event comes after the blast: count soldiers it just killed as hits.
      if (!e.alive && e.sinceDeath > 0.5) continue;
      const dist = Math.hypot(e.position.x - x, e.position.z - z);
      if (dist < this.cfg.missNear) near = true;
      if (dist < w.blastRadius) close = true;
    }
    if (near && !close) this.chatter.say('miss');
  }
}
