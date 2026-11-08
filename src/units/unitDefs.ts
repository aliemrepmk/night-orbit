/** `manpads`: a militia soldier with a shoulder-fired missile (M8+ Phase E). */
/** `mortar`: a mortar crew member that stays put and shells Ridgeback (M8+ Phase F). */
export type InfantryType = 'rifleman' | 'machineGunner' | 'ridgeback' | 'manpads' | 'mortar';

/** Stats for one kind of soldier (PLAN.md §9 enemy table). These WILL be tuned in playtesting. */
export interface InfantryDef {
  readonly type: InfantryType;
  readonly hp: number;
  /** Damage per second to Ridgeback's team health while firing (before accuracy). */
  readonly dps: number;
  /** Farthest distance it fires from (meters). */
  readonly range: number;
  /** Walking speed (m/s). */
  readonly speed: number;
  /** Tracers per visible burst. */
  readonly burst: number;
  /** Carries a shoulder-fired missile and launches it at the gunship (M8+ Phase E). */
  readonly launcher?: boolean;
  /** Mans a mortar: stays in place and drops rounds near Ridgeback (M8+ Phase F). */
  readonly mortar?: boolean;
}

export const INFANTRY: Readonly<Record<InfantryType, InfantryDef>> = {
  rifleman: { type: 'rifleman', hp: 100, dps: 0.6, range: 200, speed: 2.6, burst: 2 },
  // 1 in 6 enemies; slower, longer reach, hurts the team ~2.5× as much.
  machineGunner: { type: 'machineGunner', hp: 100, dps: 1.5, range: 250, speed: 2.0, burst: 5 },
  // Friendlies don't hurt team health; `range`/`burst` drive their (visual + slow) return fire.
  ridgeback: { type: 'ridgeback', hp: 100, dps: 0, range: 190, speed: 3.4, burst: 3 },
  // A missile team: a sidearm against the team (weak), but launches at the gunship when it can.
  manpads: {
    type: 'manpads',
    hp: 100,
    dps: 0.2,
    range: 160,
    speed: 2.4,
    burst: 1,
    launcher: true,
  },
  mortar: { type: 'mortar', hp: 100, dps: 0, range: 0, speed: 0, burst: 0, mortar: true },
};
