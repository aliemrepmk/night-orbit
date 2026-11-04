# NIGHT ORBIT — Project Status & Handoff

_Last updated: 2026-11-04_

This file says **where the project is right now**, **what needs testing**, and **what comes next**.
The full design and milestone list are in [`PLAN.md`](PLAN.md). Update this file at the end of
every session.

---

## 1. Where we are

| Milestone                               | State                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| **M0** Project setup                    | ✅ Done                                                                |
| **M1** Gunship, sensor & terrain        | ✅ Done. Automated tests pass; manual test passed 2026-11-03 (§6)      |
| **M2** Thermal look                     | ✅ Done. Automated tests pass; manual look test passed 2026-11-03 (§6) |
| **M2+** Night-vision sensor             | ✅ Done. Tests pass; look test passed 2026-11-03 (§6)                  |
| **M3** Weapons, ballistics & explosions | ✅ Done. Tests pass; feel test passed 2026-11-04 (§6)                  |
| **M4** Infantry & friendlies            | 🟨 Code-complete. Tests pass; **feel test pending (§3.1)**             |
| M5 – M10                                | ⬜ Not started                                                         |

**Automated checks (last run):** `npm run check` all green (typecheck, lint, **222 tests in 33 files**).
`npm run build` works (≈619 kB JS, 161 kB gzipped).

**Git:** `https://github.com/aliemrepmk/night-orbit` (`main`). M0–M3 are pushed; the M4 commits are local, **not pushed yet**. Commit-message rules are in `CLAUDE.md`.

**Visual verification:** M1, M2 and NV signed off by the user on 2026-11-03. M3 checked by Claude
in Chrome (all three guns fired, tracers, impacts, burning wreck, both polarities; GPU ~7–8 ms,
≤ 100 draw calls) and by a scripted lead test in the real game (§6). Feel test passed (user, 2026-11-04).
M4 checked by Claude in Chrome (team, strobes in all three sensors, 60 enemies, overrun and
friendly-fire fail screens, danger close; 60 FPS, GPU ~7.7–8.1 ms, ≤ 28 draw calls; §6).

---

## 2. What exists (file map)

```
PLAN.md                    full implementation plan (design, milestones, tests per milestone)
STATUS.md                  this file
CLAUDE.md                  short instructions auto-loaded by Claude Code sessions
index.html                 canvas, HUD root, title/pause screen with controls table
.npmrc                     legacy-peer-deps=true (see §5, decision 1)
src/
  main.ts                  entry point (dev builds expose `window.nightOrbit` for debugging)
  config.ts                ALL tunable numbers (orbit, sensor, terrain, loop, thermal, NV, render,
                           sensorFx, gunnery, fx)
  config.test.ts           config sanity rules (M0 smoke test)
  core/
    Game.ts                owns systems; frame → input → fixed steps → camera sync → render → HUD
    FixedStepper.ts (+test) 60 Hz fixed timestep, clamps long frames
    Input.ts               pointer lock, mouse deltas, keys, wheel, trigger; right-drag aim fallback
    EventBus.ts (+test)    typed pub/sub; events.ts = GameEvents (shotFired, impact, unitKilled)
    rng.ts (+test)         seeded PRNG (mulberry32)
  gunship/
    Gunship.ts (+test)     counter-clockwise orbit, center glide, heading
    Sensor.ts (+test)      ground-stabilized camera, slew, gimbal limit, zoom, telemetry getters
    sensorMath.ts (+test)  pure math: slew, meters-per-pixel, clamp, heading, smoothing
    weaponDefs.ts (+test)  ALL weapon stats (PLAN §9) + per-weapon impact effects (data)
    Weapons.ts (+test)     state machines: 25 mm heat/overheat, 40 mm clip, 105 mm reload
    ballistics.ts (+test)  flight time, spread disc, spread across view, muzzle position
    Projectiles.ts (+test) pooled shells in flight; impact on exactly the right tick
  combat/
    Damage.ts (+test)      falloff, armor table, applyRadial
    Explosions.ts (+test)  one impact end to end: damage, fx, shake, whiteout, events,
                           friendly fire → missionFailed, danger close
  fx/
    Heat.ts (+test)        heat table (PLAN §7.5) + cooling curves: bodies, craters, fire, wrecks
    Light.ts (+test)       NV table: near-IR albedo + glow per object, ground albedo from heat
    Particles.ts (+test)   pooled particle sim in typed arrays (pure)
    PointLayer.ts          one-draw-call point sprites (heat in thermal, light in NV)
    Effects.ts (+test)     flash, debris, smoke, craters, shockwave, fire, tracers
  units/
    unitDefs.ts            ALL infantry stats (rifleman, machine gunner, Ridgeback), data
    SpatialGrid.ts (+test) 20 m grid: radius + nearest queries (blasts, separation, targeting)
    Infantry.ts (+test)    one soldier (either side): walk, damage, fling death, cooling; recyclable
    infantryPose.ts (+test) pure walk bob / lean / tumble / lying-flat pose
    TeamHealth.ts (+test)  Ridgeback shared health: damage, +1/s regen after 4 s quiet, overrun
    Squad.ts (+test)       route following with holds, diamond formation slots, strobe blink timing
    UnitManager.ts (+test) owns all soldiers + grid; enemy advance/fire, Ridgeback return fire,
                           ground tracers, overrun → missionFailed
    InfantryRenderer.ts    ONE InstancedMesh for every soldier + IR strobe point layer
    TestScene.ts (+test)   TEMPORARY M4 scene: Ridgeback route + wave spawner (≤ 60 alive)
  world/
    Terrain.ts (+test)     heightmap mesh + exact heightAt()
    groundHeat.ts (+test)  soil heat field (warm/cool field patches) within the soil range
    Collision.ts (+test)   raycast vs terrain + rotated building boxes (roofs before ground)
    DummyTarget.ts (+test) TEMPORARY shootable truck (M5 replaces): drives, smokes, burns, cools
    PlaceholderWorld.ts    TEMPORARY: houses (+collision boxes), tree lines, 2 dummy trucks
  render/
    Renderer.ts            WebGLRenderer + composer: heat (half-float, MSAA) → bloom → ThermalPass
    ThermalMaterial.ts     the one shader: signature (heat, albedo, glow) → heat or NV light
    ThermalPass.ts         post: barrel, refocus blur, curve, polarity, grain, scanlines, vignette, static
    thermalMath.ts (+test) pure sensor modes, polarity, curves, NV lighting, grain (spec for shaders)
    SensorFX.ts (+test)    weapon-switch static burst + refocus blur envelopes
    GpuTimer.ts (+test)    GPU ms per frame via WebGL timer query (F1 stats)
  audio/
    sounds.ts              PLACEHOLDER synth sound definitions (M9 replaces)
    AudioEngine.ts (+test) WebAudio player; silent no-op without WebAudio
  ui/
    HUD.ts                 telemetry, reticles, gun status, team health, DANGER CLOSE, clock,
                           F1 stats (incl. KIA and live enemies EN)
    hudFormat.ts (+test)   pure HUD text: gun status, team health line, fail reasons
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

Mouse = slew sensor · **left click = fire (hold for 25 mm)** · `1`/`2`/`3` = 25/40/105 mm ·
`Q` or wheel = cycle weapon · `F` = sensor: white-hot → black-hot → night vision · `Esc` = pause ·
`F1` = FPS / GPU ms / draw calls / triangles / kills / live enemies. If pointer lock is unavailable, **hold the
right button and drag** to aim. Add `?debug=1` to the URL to start with stats on.

---

## 3. Manual checklists

### 3.1 M4 feel test (pending): "60 enemies attacking a moving team is fun for 2 minutes"

Run `npm run dev`, open the URL (add `?debug=1` for stats), click to begin. The orbit starts over
Ridgeback (four soldiers in a diamond, west of the village) and follows them as they walk.
Enemy groups of 6–10 arrive every 8 s from all sides, up to 60 alive. Tuning: `CONFIG.ridgeback`,
`CONFIG.enemyFire`, `CONFIG.testScene`, `CONFIG.infantry`, and `src/units/unitDefs.ts`.

- [ ] **Friend or foe:** with `1` (25 mm) you can find Ridgeback by the blinking strobes in
      white-hot and black-hot; in NV (`F` ×2) the strobes are the brightest thing on screen and
      soldiers nearly vanish. (Strobes too strong/weak in thermal: `strobeThermalHeat`, `strobeSize`.)
- [ ] **Soldiers read as people:** they walk with a slight bob/lean, face where they go, stop and
      turn to shoot; killed ones are thrown, lie flat and slowly cool. Bodies don't stack.
- [ ] **Enemy fire is readable:** short tracers and muzzle flashes toward the team; the HUD shows
      `RIDGEBACK ▮▮▮▮▮▮▮▮▯▯  82%  UNDER FIRE` and the bar drops; after 4 s without enemy fire it
      climbs back +1/s.
- [ ] **Ridgeback helps:** while holding at a waypoint they shoot back and slowly kill enemies
      (those don't count in `KIA`, which is your kills only).
- [ ] **Danger close:** a 105 mm within ~33 m (40 mm ~12 m, 25 mm ~4 m) of a friendly flashes
      `DANGER CLOSE` under the reticle.
- [ ] **Friendly fire:** killing a Ridgeback member shows `MISSION FAILED / FRIENDLY FIRE: YOU HIT
    RIDGEBACK`; ignoring the enemies long enough shows `RIDGEBACK OVERRUN`. Click reloads.
- [ ] **Fun for 2 minutes?** Pressure should build if you don't thin the groups (Claude's scripted
      run with no player fire: overrun at ~70 s). Too hard/easy → `accuracyNear/Far`, `dps` in
      `unitDefs.ts`, `waveInterval`, `maxEnemies`.
- [ ] `F1`: FPS ~60 and GPU well under 16 ms with 60 enemies, tracers and a few 105 mm hits.
- [ ] Orbit follow: when the team walks on, the orbit glides after them and you can still aim
      around them (the gimbal limit is 450 m from the orbit center).

### 3.1b M3 feel test (passed 2026-11-04; unchecked edge cases listed in §6)

Run `npm run dev`, open the URL, click to begin, press `F1`. Weapon numbers are in
`src/gunship/weaponDefs.ts` (stats + impact effects); feedback/effects tuning in `CONFIG.sensor`
(shake, recoil), `CONFIG.sensorFx` (whiteout), `CONFIG.gunnery` (tracers), `CONFIG.fx`.

- [ ] **Each gun feels distinct:** 25 mm = hold for a stream of small sparks with tracers, heat bar
      fills, overheats after ~4 s (`OVERHEAT` countdown, 3 s); 40 mm = one thump per click, five
      boxes `■■■■■` then `RELOAD`; 105 mm = big flash, shockwave ring, shake, `LOADING` 5 s.
- [ ] **Leading:** shells take ~1.3 / 1.5 / 1.9 s to land. You can hit a walking soldier or a
      driving truck only by aiming ahead of it (the 105 mm forgives more).
- [ ] **Kills read in heat:** soldiers are thrown, lie flat and slowly cool; trucks smoke below half
      health, then burn (fire + smoke plume) for 40 s and cool. `KIA` in F1 counts kills.
- [ ] **Roofs:** firing at a house hits the roof (no crater), firing past it hits the ground.
- [ ] **Tracers** streak in from the left side, thin, never as big blobs near the screen edge.
- [ ] **Shake / whiteout:** a 105 mm hit near the crosshair shakes the view and briefly whites out
      the sensor (black-out in black-hot); far-away hits barely shake.
- [ ] **Sound (placeholder):** guns and muffled impacts play after you click to begin.
- [ ] **Drag-aim fallback:** if your browser denies pointer lock, right-drag aims and left fires.
- [ ] `F1`: GPU well under 16 ms during sustained 25 mm fire and after a few 105 mm hits.

### 3.2 Visual checklist (M2 + NV; passed 2026-11-03 — reuse after visual changes)

Run `npm run dev`, open the URL, click to begin.
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

### Night vision (added after M2; press `F` until the HUD shows `NV`)

- [ ] NV reads as a green image-intensifier feed, clearly different from thermal.
- [ ] Tree lines and grass fields are bright, bare-soil fields darker (reverse of thermal);
      lit windows glow with a small halo; soldiers are hard to pick out (thermal's job).
- [ ] Grain is heavier than thermal but the image is still readable at 25 mm.
- [ ] Switching sensors with `F` gives the same static burst as a weapon switch.
- [ ] Tuning: `CONFIG.nightVision` (light, gain, gamma, grain, phosphor color) and albedos/glow in
      `src/fx/Light.ts`.

### Weapon switch

- [ ] Switching weapons (`1`/`2`/`3`/`Q`/wheel) gives a short static burst (~0.15 s) and a quick
      refocus blur (~0.4 s). Tune `CONFIG.sensorFx`.

### Readability and performance

- [ ] HUD text and reticles are readable in **both** polarities (they have a dark outline now).
- [ ] **Aiming no longer lags** (fixed after your report, see §6). `F1`: FPS ~60, **GPU well under
      16 ms** (Claude measured ~7.5–8 ms), draw calls well under 150 (49 at 25 mm, 90 at 105 mm).
- [ ] Edges (roofs, tree lines) don't shimmer distractingly while the orbit turns (MSAA is off;
      if they do, try `CONFIG.render.msaaSamples: 2` and check GPU ms in F1).
- [ ] Aiming still feels like M1 (barrel distortion magnifies the center by ~7%; if slewing now
      feels fast, lower `CONFIG.thermal.barrel`).

### Record results

Write findings in §6 below (or tell Claude at the start of the next session).

---

## 4. Next steps

1. **M4 feel test** (§3.1) by the user, then tune and sign off M4.
2. **Then M5: enemy AI & vehicles** (PLAN.md §7.10–7.11): paths, cover points, EnemyBrain
   (cover / fire / flee, morale break), real trucks/technicals/APCs replacing `DummyTarget`.
   Enemy line of sight is not checked yet (enemies shoot through houses); M5 should add it.
3. Push the M4 commits once the user is happy with them.
4. Consider adding the GitHub Actions CI workflow from PLAN.md §12.1 (`npm run check` +
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
   the event types live in `core/events.ts`.
5. **Orbit center glide** uses exponential smoothing (time constant 4 s), not the
   "15 m/s" mentioned in PLAN.md §4. Revisit if long moves feel too fast at the start.
6. **Drag-to-aim fallback uses the RIGHT mouse button** (moved in M3 so the left button fires).
   The context menu is suppressed while playing.
7. **HUD altitude is in meters** (`ALT 0700 M`), matching the world units.
8. **Terrain is 3,200 m wide** (larger than the 1,600 m playable map) so map edges are never
   visible from the orbit; there is a config test protecting this.
9. **The sensor slew test** checks that a 100 px mouse move shifts the ground point 100 px on
   screen (±5 px) at four orbit angles; keep it passing when changing the sensor.
10. **Thermal order differs slightly from PLAN.md §7.5:** the contrast curve is applied _before_
    polarity (PLAN lists polarity first), so black-hot is an exact mirror of white-hot. A test
    protects this. The shader in `ThermalPass.ts` mirrors `thermalMath.ts`; change both together.
11. **The scene renders raw heat**, not colors, into a half-float render target. No lights, no fog; haze is in
    `ThermalMaterial`. `renderer.info.autoReset` is off so F1 counts calls across all passes.
12. **Signature sources:** one material per signature for unique meshes (each dummy soldier has
    its own so it can cool alone); per-vertex `signature` for the terrain; per-instance
    `instanceSignature` for instanced meshes (trees, windows, chimneys, craters, later soldiers).
13. **⚠️ Render budget (`CONFIG.render`): pixel ratio capped at 1.5, MSAA off.** At 2× with 4×
    MSAA the GPU needed ~23 ms/frame on a MacBook (budget 16.7 ms), which made aiming lag even
    though FPS still read 60: frames queue behind the GPU. Measured GPU ms (2940×1492 vs 2205×1119):
    2×+MSAA4 ≈ 23, 2× no MSAA ≈ 13, 1.5×+MSAA4 ≈ 16, **1.5× no MSAA ≈ 7.5**. A config test guards
    the cap. **Always check `GPU … MS` in F1 (not just FPS) after adding render work.**
14. **Night-vision sensor (user request, not in PLAN.md):** a real third sensor mode, not a tint.
    Every object carries a _signature_ (heat, near-IR albedo, glow) as a uniform, per-vertex or
    per-instance vec3; one shared uniform switches all materials. NV light = albedo × (sky + moon
    by angle) + glow (`thermalMath.nvSurfaceLight`, mirrored in the shader). `F` cycles
    WHT → BLK → NV and triggers the switch static. Costs ~1–2 ms GPU over thermal (8–10 ms).
    **For M3+:** new objects need albedo + glow too (muzzle flash / fire / explosions: `GLOW`);
    **M4 changed this:** strobes glow fully in NV and also carry a little heat
    (`CONFIG.ridgeback.strobeThermalHeat` = 0.5) so they stay visible in thermal (see decision 21).
15. **Keys pressed before pointer lock is granted are dropped** (state is still "title" for a
    moment after the click). Harmless; noticed while testing NV.
16. **Firing pipeline (M3):** fire → raycast the sensor's line of sight from the aircraft (roofs
    before ground) → offset by a uniform spread disc _across the view_ → re-raycast (spread lands
    on real surfaces) → shell flies from the muzzle (below + left side of the aircraft) for
    distance / speed seconds → `Explosions.detonate()`. Trigger clicks gathered per frame count
    on the first fixed step only; the click that starts/resumes the game is discarded.
17. **Tracers** are point sprites, skipped within 150 m of the sensor and capped at 7 px
    (`CONFIG.gunnery`); without this they were huge white blobs near the camera (regression test).
18. **`DummyTarget` and the placeholder sounds are temporary** (M4 units, M9 audio). Dummy HP/armor
    follow the plan (rifleman 100 HP; cargo truck 300 HP, armor 0.5/1/1).
19. **Dev-only debug hook:** `window.nightOrbit` (the Game) exists only in `npm run dev`; Vite strips
    it from production builds (checked: not in `dist/`). Used for scripted browser checks, e.g.
    the lead test in §6 (TypeScript `private` is compile-time only).
20. **Impact sound isn't delayed by distance** (sound would take ~3 s to reach the aircraft); kept
    immediate for feedback in the placeholder. Revisit in M9.
21. **Strobes are visible in thermal too (M4).** PLAN §7.9 wanted strobes "always visible"
    while decision 14 had planned NV-only. In thermal both sides are identical warm figures, so
    NV-only strobes would make friend-or-foe a guess outside NV. Kept as one config number
    (`strobeThermalHeat`; 0 = realistic NV-only). Ask the user in the feel test.
22. **M4 enemy AI is minimal:** think at 4 Hz (staggered): target the nearest friendly, walk at it,
    stop at a random 60–95 % of its range, fire until the target leaves range. No cover, morale,
    fleeing or line of sight (M5). Damage to the team = `dps × accuracy × dt`, accuracy 0.6 up
    close → 0.25 at max range (`CONFIG.enemyFire`).
23. **Team health regenerates after 4 s with no enemy fire** (PLAN §9), not "no enemy firing
    within 80 m" (§7.9; PLAN updated). Individual friendlies have 100 HP against player fire only;
    a wounded-but-alive friendly gives a danger-close warning, a dead one fails the mission.
24. **Ridgeback return fire** only while holding at a waypoint: every 1.5–3.5 s each member shoots
    the nearest enemy within 190 m, 30 % chance to kill. Reported as `unitKilled` with `by: 'team'`;
    F1 `KIA` counts only the player's kills.
25. **Retry reloads the page** (`location.reload()`); M8 adds a real restart that resets systems.
    After a failure the world keeps rendering (orbit, smoke) but units and guns stop.
26. **The orbit follows the team:** when Ridgeback is more than 70 m from the orbit's target center,
    the center glides to the team (`CONFIG.ridgeback.followDistance`). M7's mission script takes this over.
27. **Soldier budget:** at most 128 soldiers (alive + bodies); spawning past that reuses the
    longest-dead body, never a living soldier. Units only simulate while playing (not behind the
    title or pause screen), so the team can't be overrun before you start.
28. **Explosions query targets through the unit grid** out to max(blast radius, danger-close
    distance); `Damageable.takeDamage` takes a `DamageSource` (weapon id or `'team'`).

---

## 6. Manual test results / notes

_(Fill in after testing.)_

| Date       | Item                          | Result                                                                                                                  | Action                                                                                                         |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | M1 manual checklist           | User reported everything works                                                                                          | None; M1 signed off                                                                                            |
| 2026-11-03 | M2 look (Claude, Chrome)      | Thermal feed OK; HUD hard to read in black-hot; soil patches too strong                                                 | Added dark HUD outline; softened soil patches                                                                  |
| 2026-11-03 | M2 aiming (user)              | "Looking around feels a bit laggy"                                                                                      | GPU was ~23 ms/frame; capped pixel ratio 1.5, MSAA off → ~7.5 ms; GPU ms added to F1                           |
| 2026-11-03 | NV look (Claude, Chrome)      | Trees/walls rendered darker than the ground (sideways surfaces got too little sky light)                                | Flattened sky term, rebalanced moon/sky and albedos; regression test added                                     |
| 2026-11-03 | M2 look test (user)           | "It looks well for now"                                                                                                 | None; M2 signed off                                                                                            |
| 2026-11-03 | NV look test (user)           | Approved ("mark it signed off")                                                                                         | None; NV signed off                                                                                            |
| 2026-11-03 | M3 tracers (Claude)           | First meters of each tracer drew as huge white blobs near the camera                                                    | Skip < 150 m from sensor, cap 7 px; regression test                                                            |
| 2026-11-03 | M3 smoke (Claude)             | 105 mm smoke too faint to read after the flash                                                                          | Warmer, more opaque plume                                                                                      |
| 2026-11-03 | M3 lead test (scripted)       | 25 mm 1.2 s bursts on walking soldiers: led 2/2 killed, unled 1/3 killed                                                | Leading matters as intended; 105 mm led on a truck destroyed it (burning)                                      |
| 2026-11-04 | M3 feel test (user)           | "M3 seems to be working well"; signed off                                                                               | Not yet tried: sound, pause with shells in flight, roof hits, 2–3 min stress (GPU, crater cap), Firefox/Safari |
| 2026-11-04 | M4 scripted (Claude, Chrome)  | No player fire: enemies reach 60 alive, team 96 → 0 by ~70 s, `RIDGEBACK OVERRUN` screen                                | Works; difficulty to judge in the feel test (`CONFIG.enemyFire`, `unitDefs.ts`)                                |
| 2026-11-04 | M4 fail/warn (Claude, Chrome) | 105 mm 28 m from the team → DANGER CLOSE, nobody hurt; 40 mm on a member → `FRIENDLY FIRE` fail screen                  | Works as designed                                                                                              |
| 2026-11-04 | M4 look (Claude, Chrome)      | Team readable at 25 mm; strobes blink in WHT/BLK, bright in NV; NV tracers visible; 60 FPS, GPU 7.7–8.1 ms, 23–28 calls | None yet; user feel test pending                                                                               |

---

## 7. How to resume in a new session

Start Claude Code in this folder and say something like:

> "Read STATUS.md and PLAN.md. Let's start M4."

`CLAUDE.md` already tells Claude to read these files and follow the testing rules.
