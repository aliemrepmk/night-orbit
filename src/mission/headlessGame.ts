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

