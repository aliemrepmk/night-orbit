export type InfantryType = 'rifleman' | 'machineGunner' | 'ridgeback';

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
}

export const INFANTRY: Readonly<Record<InfantryType, InfantryDef>> = {
  rifleman: { type: 'rifleman', hp: 100, dps: 0.6, range: 200, speed: 2.6, burst: 2 },
  // 1 in 6 enemies; slower, longer reach, hurts the team ~2.5× as much.
  machineGunner: { type: 'machineGunner', hp: 100, dps: 1.5, range: 250, speed: 2.0, burst: 5 },
  // Friendlies don't hurt team health; `range`/`burst` drive their (visual + slow) return fire.
  ridgeback: { type: 'ridgeback', hp: 100, dps: 0, range: 190, speed: 3.4, burst: 3 },
};
