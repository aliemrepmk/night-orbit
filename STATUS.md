# NIGHT ORBIT — Project Status & Handoff

_Last updated: 2026-11-03_

This file says **where the project is right now**, **what needs testing**, and **what comes next**.
The full design and milestone list are in [`PLAN.md`](PLAN.md). Update this file at the end of
every session.

---

## 1. Where we are

| Milestone                        | State                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------- |
| **M0** Project setup             | ✅ Done                                                                           |
| **M1** Gunship, sensor & terrain | ✅ Done. Automated tests pass; manual test passed 2026-11-03 (§6)                 |
| **M2** Thermal look              | ✅ Code done, automated tests pass. ⏳ **Waiting for your manual look test** (§3) |
| M3 – M10                         | ⬜ Not started                                                                    |

**Automated checks (last run):** `npm run check` all green (typecheck, lint, **83 tests in 12 files**).
`npm run build` works (≈572 kB JS, 146 kB gzipped).

**Git:** M0 + M1 committed as a baseline and pushed to `https://github.com/aliemrepmk/night-orbit`
(`main`). Commit-message rules are in `CLAUDE.md`.

**Visual verification:** M1 checked by the user on 2026-11-03. M2 checked by Claude in Chrome
(screenshots at 105/40/25 mm, both polarities): reads as a thermal feed, 60 FPS, 49–94 draw calls.
The 150 ms switch static is too short to screenshot, so it still needs a human look.

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
  config.ts                ALL tunable numbers (orbit, sensor, terrain, loop, thermal, sensorFx)
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
  fx/
    Heat.ts (+test)        heat table (PLAN §7.5) + cooling curves: bodies, craters, fire, wrecks
  world/
    Terrain.ts (+test)     heightmap mesh + exact heightAt()
    groundHeat.ts (+test)  soil heat field (warm/cool field patches) within the soil range
    PlaceholderWorld.ts    TEMPORARY: houses (windows, chimneys), tree lines, hot moving dummies
  render/
    Renderer.ts            WebGLRenderer + composer: heat (half-float, MSAA) → bloom → ThermalPass
    ThermalMaterial.ts     the one shader: outputs raw heat (uniform / vertex / instance source)
    ThermalPass.ts         post: barrel, refocus blur, curve, polarity, grain, scanlines, vignette, static
    thermalMath.ts (+test) pure polarity / contrast curve / grain-by-zoom (spec for the shader)
    SensorFX.ts (+test)    weapon-switch static burst + refocus blur envelopes
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
`F` = white-hot / black-hot · `Esc` = pause · `F1` = FPS / draw calls / triangles. Add `?debug=1` to the URL to start with stats on.

---

## 3. What to test now (M2 manual sign-off)

Run `npm run dev`, open the URL, click to begin. M1's checklist passed (§6); this is the M2 look test.
Thermal tuning lives in `CONFIG.thermal` / `CONFIG.sensorFx` (`src/config.ts`) and heat values in
`src/fx/Heat.ts`.

### The look

- [ ] **First impression:** a screenshot reads instantly as a gunship thermal feed.
- [ ] **Hot things pop in both polarities:** soldiers (and the trucks' engine blocks) glow in
      white-hot and are dark blobs in black-hot. Press `F` to switch; HUD shows `WHT HOT`/`BLK HOT`.
- [ ] **Ground:** terrain is readable (not crushed to black), fields show as soft warm/cool patches
      but don't dominate. Too strong → `src/world/groundHeat.ts`; overall brightness →
      `CONFIG.thermal.gamma` (per weapon) and `levels`.
- [ ] **Buildings:** walls/roofs are slightly warmer than soil; lit windows and chimneys stand out.
- [ ] **Bloom:** soldiers glow a little, not a blur. Tune `CONFIG.thermal.bloom`.
- [ ] **Sensor texture:** grain is visible and stronger at 25 mm than at 105 mm; scanlines,
      the slow rolling band, vignette and slight barrel distortion are subtle, not distracting.

### Weapon switch

- [ ] Switching weapons (`1`/`2`/`3`/`Q`/wheel) gives a short static burst (~0.15 s) and a quick
      refocus blur (~0.4 s). Tune `CONFIG.sensorFx`.

### Readability and performance

- [ ] HUD text and reticles are readable in **both** polarities (they have a dark outline now).
- [ ] `F1`: FPS ~60, draw calls well under 150 (Claude measured 49 at 25 mm, 94 at 105 mm).
- [ ] Aiming still feels like M1 (barrel distortion magnifies the center by ~7%; if slewing now
      feels fast, lower `CONFIG.thermal.barrel`).

### Record results

Write findings in §6 below (or tell Claude at the start of the next session).

---

## 4. Next steps

1. **Finish M2 sign-off** using the checklist above; tune `config.ts` if needed.
2. **Start M3: weapons, ballistics & explosions** (PLAN.md §7.6, §7.7, §10 M3). Before firing is
   added, move drag-to-aim off the left button (§5, decision 6).
3. Consider adding the GitHub Actions CI workflow from PLAN.md §12.1 (`npm run check` +
   `npm run build` on every push) now that the repo is on GitHub.

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
10. **Thermal order differs slightly from PLAN.md §7.5:** the contrast curve is applied _before_
    polarity (PLAN lists polarity first), so black-hot is an exact mirror of white-hot. A test
    protects this. The shader in `ThermalPass.ts` mirrors `thermalMath.ts`; change both together.
11. **The scene renders raw heat**, not colors: a half-float render target with 4× MSAA (the
    canvas' own antialias doesn't apply to post-processing). No lights, no fog; haze is in
    `ThermalMaterial`. `renderer.info.autoReset` is off so F1 counts calls across all passes.
12. **Heat sources:** one material per heat value for unique meshes; per-vertex `heat` for the
    terrain; per-instance `instanceHeat` for instanced meshes (trees, windows, chimneys, later
    soldiers). Cooling curves in `fx/Heat.ts` are ready for M3/M4 (bodies, craters, wrecks).

---

## 6. Manual test results / notes

_(Fill in after testing.)_

| Date       | Item                     | Result                                                                  | Action                                        |
| ---------- | ------------------------ | ----------------------------------------------------------------------- | --------------------------------------------- |
| 2026-11-03 | M1 manual checklist      | User reported everything works                                          | None; M1 signed off                           |
| 2026-11-03 | M2 look (Claude, Chrome) | Thermal feed OK; HUD hard to read in black-hot; soil patches too strong | Added dark HUD outline; softened soil patches |

---

## 7. How to resume in a new session

Start Claude Code in this folder and say something like:

> "Read STATUS.md and PLAN.md. Here are my M2 test results: … Then let's start M3."

`CLAUDE.md` already tells Claude to read these files and follow the testing rules.
