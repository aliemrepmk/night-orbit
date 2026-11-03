# NIGHT ORBIT — Project Status & Handoff

_Last updated: 2026-11-03_

This file says **where the project is right now**, **what needs testing**, and **what comes next**.
The full design and milestone list are in [`PLAN.md`](PLAN.md). Update this file at the end of
every session.

---

## 1. Where we are

| Milestone                        | State                                                             |
| -------------------------------- | ----------------------------------------------------------------- |
| **M0** Project setup             | ✅ Done                                                           |
| **M1** Gunship, sensor & terrain | ✅ Done. Automated tests pass; manual test passed 2026-11-03 (§6) |
| M2 Thermal look                  | ⬜ Next                                                           |
| M3 – M10                         | ⬜ Not started                                                    |

**Automated checks (last run):** `npm run check` all green (typecheck, lint, **53 tests in 8 files**).
`npm run build` works (≈550 kB JS, 139 kB gzipped).

**Git:** M0 + M1 committed as a baseline and pushed to `https://github.com/aliemrepmk/night-orbit`
(`main`). Commit-message rules are in `CLAUDE.md`.

**Visual verification:** done by the user in the browser on 2026-11-03; M1 checklist passed.

---

## 2. What exists (file map)

```
PLAN.md                    full implementation plan (design, milestones, tests per milestone)
STATUS.md                  this file
CLAUDE.md                  short instructions auto-loaded by Claude Code sessions
index.html                 canvas, HUD root, title/pause screen with controls table
.npmrc                     legacy-peer-deps=true (see §5, decision 1)
src/
  main.ts                  entry point
  config.ts                ALL tunable numbers (orbit, sensor, terrain, loop)
  config.test.ts           config sanity rules (M0 smoke test)
  core/
    Game.ts                owns systems; frame → input → fixed steps → camera sync → render → HUD
    FixedStepper.ts (+test) 60 Hz fixed timestep, clamps long frames
    Input.ts               pointer lock, mouse deltas, keys, wheel; drag-to-aim fallback
    rng.ts (+test)         seeded PRNG (mulberry32)
  gunship/
    Gunship.ts (+test)     counter-clockwise orbit, center glide, heading
    Sensor.ts (+test)      ground-stabilized camera, slew, gimbal limit, zoom, telemetry getters
    sensorMath.ts (+test)  pure math: slew, meters-per-pixel, clamp, heading, smoothing
    weaponDefs.ts (+test)  weapon ids + FOV per weapon (fire stats come in M3)
  world/
    Terrain.ts (+test)     heightmap mesh + exact heightAt()
    PlaceholderWorld.ts    TEMPORARY: gray houses, tree lines, moving "dummy" targets
  render/
    Renderer.ts            WebGLRenderer, scene, fog, placeholder lights
  ui/
    HUD.ts                 telemetry, reticles per weapon, weapon list, clock, F1 debug stats
    hud.css                HUD + title/pause screen styles
```

### Commands

| Command              | What it does                                                          |
| -------------------- | --------------------------------------------------------------------- |
| `npm run dev`        | dev server (default http://localhost:5173)                            |
| `npm run test:watch` | re-run tests on every save (use while coding)                         |
| `npm run check`      | typecheck + lint + tests; **must be green before finishing any task** |
| `npm run build`      | production build into `dist/`                                         |
| `npm run format`     | Prettier on the whole repo                                            |

### Controls (current)

Mouse = slew sensor · `1`/`2`/`3` = 25/40/105 mm zoom · `Q` or wheel = cycle weapon ·
`Esc` = pause · `F1` = FPS / draw calls / triangles. Add `?debug=1` to the URL to start with stats on.

---

## 3. What to test now (M1 manual sign-off)

Run `npm run dev`, open the URL, click to begin. Go through each item and note results here.

### Aiming feel (most important)

- [ ] **Stability:** with the mouse still, the crosshair stays on the same ground spot while the
      plane circles. Only a very slight hand-held wobble is expected.
- [ ] **Direction:** mouse right → view pans right; mouse up → view pans away. Check at several
      points around the orbit (it takes 2 minutes for a full circle).
- [ ] **Speed:** at each zoom level, the ground under the crosshair follows the mouse naturally.
      Too fast/slow → change `CONFIG.sensor.sensitivity` in `src/config.ts`.
- [ ] **Zoom:** `1`/`2`/`3`, `Q` and the wheel switch weapons; the zoom transition feels quick but
      not instant. Tune `CONFIG.sensor.zoomTau` (smaller = faster).
- [ ] **Gimbal limit:** you can't slew more than ~450 m from the orbit center; it stops smoothly.
- [ ] **Wobble:** the jitter isn't distracting at 25 mm. Tune `CONFIG.sensor.jitterDeg` (0 = off).

### Readability

- [ ] The white moving shapes (soldier stand-ins, 1.3× size) are trackable at 25 mm and 40 mm,
      and at least visible at 105 mm.
- [ ] HUD text is readable; reticle changes with the weapon.

### Robustness

- [ ] `Esc` pauses (overlay says PAUSED); clicking resumes; mouse movement while paused doesn't
      move the aim afterwards.
- [ ] Resize the window: no stretching, HUD stays in the corners.
- [ ] Switch tabs for a while and come back: no jump or freeze.
- [ ] Test in Chrome, Firefox and Safari. Safari: if pointer lock fails, the game should fall back
      to "hold left button and drag to aim" (a console warning says so).
- [ ] Press `F1`: FPS should be ~60 (or your screen's refresh rate). Note the draw-call count.

### Record results

Write findings in §6 below (or tell Claude at the start of the next session).

---

## 4. Next steps

1. **Start M2: thermal look** (see PLAN.md §7.5 and §10 M2):
   - `src/render/ThermalMaterial.ts`: shader where every object has a heat value 0–1
     (instanced meshes use a per-instance `instanceHeat` attribute).
   - `src/render/ThermalPass.ts`: post-processing chain: bloom → polarity (white-hot/black-hot)
     → contrast curve → animated grain → scanlines → vignette.
   - `src/render/SensorFX.ts`: static burst + refocus blur on weapon switch.
   - `F` key toggles polarity; HUD shows `WHT HOT` / `BLK HOT` (the label exists but is static now).
   - Assign heat values to placeholder world objects (table in PLAN.md §7.5).
   - 🧪 Tests: heat values within 0–1, polarity function, heat decay curves.
   - Remove the placeholder lights/fog from `Renderer.ts` once thermal replaces them.

---

## 5. Decisions & known issues (read before changing things)

1. **`.npmrc` has `legacy-peer-deps=true`.** npm 10.9 crashes (`Cannot read properties of null
(reading 'edgesOut')`) resolving Vitest 5's optional peers. All required peers are direct
   dev-dependencies, so this is safe. Remove it if a future npm fixes the bug.
2. **Pinned versions** (exact, chosen to be a few weeks old): three 0.186.1, vite 8.3.4,
   vitest 5.0.4, typescript 6.0.3 (TS 7 isn't supported by typescript-eslint yet),
   eslint 10.12.0, typescript-eslint 8.71.2, prettier 3.9.10, simplex-noise 4.0.3.
3. **No physics engine** (decided): ray/radius checks are enough; physics could be added later for
   visual-only debris/wrecks (Rapier) after M10 if explosions feel flat. See PLAN.md §3.
4. **Small differences from PLAN.md's file layout:** `core/FixedStepper.ts` instead of
   `core/Loop.ts` (the RAF loop lives in `Game.start()`); `GameState` is a type in `Game.ts`;
   there is no `EventBus` yet (add it in M3/M4 when the first events exist).
5. **Orbit center glide** uses exponential smoothing (time constant 4 s), not the
   "15 m/s" mentioned in PLAN.md §4. Revisit if long moves feel too fast at the start.
6. **⚠️ Drag-to-aim fallback uses the left mouse button**, which will conflict with firing in M3.
   Plan: move drag-aim to the right button (or Shift+drag) when M3 adds firing.
7. **HUD altitude is in meters** (`ALT 0700 M`), matching the world units.
8. **Terrain is 3,200 m wide** (larger than the 1,600 m playable map) so map edges are never
   visible from the orbit; there is a config test protecting this.
9. **The sensor slew test** checks that a 100 px mouse move shifts the ground point 100 px on
   screen (±5 px) at four orbit angles; keep it passing when changing the sensor.

---

## 6. Manual test results / notes

_(Fill in after testing.)_

| Date       | Item                     | Result                         | Action              |
| ---------- | ------------------------ | ------------------------------ | ------------------- |
| 2026-11-03 | M1 manual checklist (§3) | User reported everything works | None; M1 signed off |

---

## 7. How to resume in a new session

Start Claude Code in this folder and say something like:

> "Read STATUS.md and PLAN.md. Here are my M1 test results: … Then let's commit and start M2."

`CLAUDE.md` already tells Claude to read these files and follow the testing rules.
