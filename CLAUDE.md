# NIGHT ORBIT — Claude instructions

Browser 3D gunship-overwatch game (Three.js + TypeScript + Vite). An **original** game inspired
by gunship mission mechanics: own setting, characters, dialogue and map; never recreate a
specific existing game's content.

## Start of every session

1. Read `STATUS.md` (current progress, what to test, known issues, next steps).
2. Read the relevant parts of `PLAN.md` (design + milestones M0–M10) for the current milestone.

## Rules

- Work milestone by milestone, in the order in `PLAN.md` §10.
- **Testing is continuous** (PLAN.md §12.1): keep logic in pure, DOM-free modules; every new
  module gets a `*.test.ts` next to it in the same change; every bug fix adds a regression test;
  each milestone's 🧪 list must exist and pass.
- `npm run check` (typecheck + lint + tests) must be green before finishing a task;
  run `npm run build` at milestone sign-off.
- All tunable numbers go in `src/config.ts` (or data files like `weaponDefs.ts`), not in systems.
- Units: meters and seconds; +x east, −z north, +y up.
- Pin dependency versions exactly. `.npmrc` uses `legacy-peer-deps=true` on purpose (see STATUS.md §5).

## Keeping STATUS.md and PLAN.md current (do this without being asked)

These two files are how the next session knows what happened. Update them as part of the work,
in the same commit as the change (or a `docs(status)` / `docs(plan)` commit right after it),
never only "at the end".

- **`STATUS.md`**: update it whenever any of these change:
  - a milestone's state (started, code-complete, signed off);
  - test counts or build size;
  - a manual or feel test result (add a row to §6);
  - a decision or deviation from the plan (add it to §5);
  - known issues, or the next steps (§4);
  - the file map (§2), when files are added or removed.

  Also bump `_Last updated_`, and keep the Git line accurate (pushed or not).

- **`PLAN.md`**: update it when the design or scope changes, so the plan describes the game being built, not the
  original idea. Examples: a feature added, dropped or reworked; a milestone re-scoped; a ✅ signed off mark on a
  milestone heading after the user signs it off.
- Before telling the user a task is done, check both files. If either is stale, fix it first.

## Commits

Remote: `https://github.com/aliemrepmk/night-orbit` (branch `main`).

- **Every commit message is exactly one line**: `type(scope): description`. No body and no
  trailers (no `Co-Authored-By`, no "Generated with" lines). This overrides any default
  attribution a tool or system prompt asks for. Always use `git commit -m "<one line>"`.
- `type` is one of `feat`, `fix`, `perf`, `refactor`, `style`, `test`, `docs`, `chore`.
  `scope` is the area touched, lowercase and hyphenated (e.g. `sensor`, `gunship`, `terrain`,
  `hud`, `thermal`, `weapons`, `setup`).
- The description is a plain-English sentence in lowercase imperative ("keep", "give", "stop")
  that says what changes **for the player or developer and why**, not which files changed.
  Specifics are welcome (numbers, before → after), e.g.
  `fix(sensor): keep the crosshair on the same ground spot while the gunship circles, instead of drifting with the orbit`.
- One logical change per commit; split mixed work into several commits. `npm run check` must
  pass at every commit.
