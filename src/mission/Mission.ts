import type { ZoneId } from '../world/mapTypes';
import type { Action, Condition, MissionDef, Phase, Step } from './missionTypes';

export type HelicopterStage = 'none' | 'inbound' | 'landed' | 'boarded' | 'departed';

/** Order of the helicopter stages, so `helicopter('landed')` stays true once it has boarded. */
const HELI_ORDER: readonly HelicopterStage[] = ['none', 'inbound', 'landed', 'boarded', 'departed'];

/**
 * What the mission runner asks the game: the state its conditions read, and the actions it
 * cannot carry out itself (spawning, moving the team, the orbit, the radio). `MissionHost`
 * implements it on top of the real systems; tests implement it with plain fakes.
 */
export interface MissionWorld {
  teamReached(route: string): boolean;
  enemiesInZone(zone: ZoneId): number;
  vehiclesAlive(tag: string): number;
  helicopterStage(): HelicopterStage;
  perform(action: Action): void;
  /** A phase is about to run its `onEnter` (e.g. drop the last phase's unplayed radio lines). */
  phaseEntered?(phase: Phase): void;
}

export type MissionStatus = 'running' | 'complete' | 'failed';

export interface MissionTimer {
  readonly id: string;
  readonly label: string;
  left: number;
}

/**
 * Runs a `MissionDef` (PLAN.md §7.14). Every tick it checks the current step's condition; when
 * it holds (or the step's timeout runs out) the step's actions run once and the next step
 * becomes current. `nextPhase` enters the next phase (its `onEnter` actions run); after the last
 * phase, or on `completeMission`, the mission is complete. Pure: no DOM, no Three.js scene.
 */
export class Mission {
  status: MissionStatus = 'running';
  objective = '';
  phaseIndex = -1;
  stepIndex = 0;
  phaseTime = 0;
  stepTime = 0;
  /** Steps that fired through their timeout instead of their condition, as `phase/note` (debug, tests). */
  readonly timedOut: string[] = [];
  readonly flags = new Set<string>();
  readonly timers: MissionTimer[] = [];
  private pendingPhase: number | null = null;

  constructor(
    readonly def: MissionDef,
    private readonly world: MissionWorld,
  ) {}

  get phase(): Phase | null {
    return this.def.phases[this.phaseIndex] ?? null;
  }

  get step(): Step | null {
    return this.phase?.steps[this.stepIndex] ?? null;
  }

  /** Starts at the first phase, or at the phase with id `phaseId` (`?phase=`, cheats). */
  start(phaseId?: string): Phase {
    const i = phaseId ? this.def.phases.findIndex((p) => p.id === phaseId) : 0;
    if (i < 0) throw new Error(`Unknown mission phase "${phaseId}"`);
    this.enter(i);
    return this.def.phases[i];
  }

  /** Jumps to the next phase now (dev cheat `N`); returns it, or null after the last one. */
  skipPhase(): Phase | null {
    if (this.status !== 'running') return null;
    if (this.phaseIndex + 1 >= this.def.phases.length) {
      this.status = 'complete';
      return null;
    }
    this.enter(this.phaseIndex + 1);
    return this.phase;
  }

  setFlag(name: string): void {
    this.flags.add(name);
  }

  /** The game reports a lose condition (friendly fire, overrun, the clinic): the script stops. */
  fail(): void {
    if (this.status === 'running') this.status = 'failed';
  }

  timer(id: string): MissionTimer | undefined {
    return this.timers.find((t) => t.id === id);
  }

  update(dt: number): void {
    if (this.status !== 'running') return;
    for (const t of this.timers) t.left = Math.max(0, t.left - dt);
    this.phaseTime += dt;
    this.stepTime += dt;

    const step = this.step;
    if (!step) return; // a phase whose steps are all done waits for nextPhase (should not happen)
    const timedOut = step.timeout !== undefined && this.stepTime >= step.timeout;
    if (!this.check(step.when) && !timedOut) return;

    if (timedOut && !this.check(step.when)) {
      this.timedOut.push(`${this.phase!.id}/${step.note ?? this.stepIndex}`);
      this.run(step.onTimeout ?? []);
    }
    this.stepIndex++;
    this.stepTime = 0;
    this.run(step.do);
    this.applyPendingPhase();
  }

  /** True if condition `c` holds right now. */
  check(c: Condition): boolean {
    const w = this.world;
    switch (c.kind) {
      case 'timeInPhase':
        return this.phaseTime >= c.seconds;
      case 'timeInStep':
        return this.stepTime >= c.seconds;
      case 'teamReached':
        return w.teamReached(c.route);
      case 'zoneEnemiesBelow':
        return w.enemiesInZone(c.zone) < c.count;
      case 'vehiclesDestroyed':
        return w.vehiclesAlive(c.tag) === 0;
      case 'timerDone': {
        const t = this.timer(c.id);
        return t !== undefined && t.left <= 0;
      }
      case 'timerBelow': {
        const t = this.timer(c.id);
        return t !== undefined && t.left <= c.seconds;
      }
      case 'helicopter':
        return HELI_ORDER.indexOf(w.helicopterStage()) >= HELI_ORDER.indexOf(c.state);
      case 'flag':
        return this.flags.has(c.name);
      case 'allOf':
        return c.all.every((x) => this.check(x));
      case 'anyOf':
        return c.any.some((x) => this.check(x));
    }
  }

  /** One line for the debug overlay: phase, step and its note. */
  get debugLine(): string {
    const p = this.phase;
    if (!p) return this.status.toUpperCase();
    const s = this.step;
    const note = s?.note ? ` ${s.note}` : '';
    return `${p.id.toUpperCase()} ${this.stepIndex + 1}/${p.steps.length}${note} ${this.stepTime.toFixed(0)}s`;
  }

  private enter(i: number): void {
    this.phaseIndex = i;
    this.stepIndex = 0;
    this.phaseTime = 0;
    this.stepTime = 0;
    this.pendingPhase = null;
    const p = this.def.phases[i];
    this.objective = p.objective;
    this.world.phaseEntered?.(p);
    this.run(p.onEnter);
    this.applyPendingPhase();
  }

  private applyPendingPhase(): void {
    if (this.pendingPhase === null) return;
    const next = this.pendingPhase;
    this.pendingPhase = null;
    if (next >= this.def.phases.length) this.status = 'complete';
    else this.enter(next);
  }

  private run(actions: readonly Action[]): void {
    for (const a of actions) {
      if (this.status !== 'running') return;
      switch (a.kind) {
        case 'setObjective':
          this.objective = a.text;
          break;
        case 'setFlag':
          this.flags.add(a.name);
          break;
        case 'startTimer': {
          const t = this.timer(a.id);
          if (t) t.left = a.seconds;
          else this.timers.push({ id: a.id, label: a.label, left: a.seconds });
          break;
        }
        case 'nextPhase':
          // After the rest of this step's actions (a step reads top to bottom).
          this.pendingPhase = this.phaseIndex + 1;
          break;
        case 'completeMission':
          this.status = 'complete';
          break;
        default:
          this.world.perform(a);
      }
    }
  }
}
