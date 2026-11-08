import { createBattle, createWorld, type StaticWorld } from './battle';

/**
 * The whole game minus the screen, wired like `Game` (real map, real units, real mission), for
 * the auto-play and host tests and for headless tuning runs. No renderer, no DOM. Pass a
 * `world` to reuse one (a restart, M8).
 */
export function headlessGame(world: StaticWorld = createWorld()) {
  const b = createBattle(world);
  const failures: string[] = [];
  b.bus.on('missionFailed', (e) => failures.push(e.reason));
  return { ...b, world, failures, footprints: world.footprints };
}

export type HeadlessGame = ReturnType<typeof headlessGame>;

/** Calibration flags a player raises by doing each prompt (looking at Ridgeback, keys 1–3, F). */
export const PROMPT_FLAGS = ['located', 'weapon25', 'weapon40', 'weapon105', 'sensor'] as const;

/**
 * For headless bots: do every calibration prompt. Call once per tick: prompts clear their flag
 * when they are shown (only actions after the prompt count), so a one-off call is not enough.
 */
export function doEveryPrompt(g: HeadlessGame): void {
  for (const f of PROMPT_FLAGS) g.host.playerDid(f);
}
