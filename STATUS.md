# NIGHT ORBIT — Project Status & Handoff

_Last updated: 2026-11-05_

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
| **M4** Infantry & friendlies            | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                  |
| **M5** Enemy AI & vehicles              | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                  |
| **M5+** Air support                     | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                  |
| **M6** The handcrafted map              | ✅ Signed off (look test passed, user, 2026-11-05)                     |
| M7 – M10                                | ⬜ Not started                                                         |

**Automated checks (last run):** `npm run check` all green (typecheck, lint, **348 tests in 46 files**).
`npm run build` works (≈666 kB JS, 178 kB gzipped).

**Git:** `https://github.com/aliemrepmk/night-orbit` (`main`). M0–M5+ are pushed; the M6 commits are local, with a push scheduled for 2026-11-06 00:30 (Turkish time). Commit-message rules are in `CLAUDE.md`.

**Visual verification:** M1, M2 and NV signed off by the user on 2026-11-03. M3 checked by Claude
in Chrome (all three guns fired, tracers, impacts, burning wreck, both polarities; GPU ~7–8 ms,
≤ 100 draw calls) and by a scripted lead test in the real game (§6). Feel test passed (user, 2026-11-04).
M4 checked by Claude in Chrome (team, strobes in all three sensors, 60 enemies, overrun and
friendly-fire fail screens, danger close; 60 FPS, GPU ~7.7–8.1 ms, ≤ 28 draw calls; §6). Feel test passed (user, 2026-11-05).
M5 checked by Claude in Chrome (enemies at house corners, convoy on the west road, mounted-gun tracers,
105 mm truck kill → burning wreck with the convoy queued behind it; 60 FPS, GPU ~7.9 ms, ≤ 35 draw calls; §6).
M5 feel test passed (user, 2026-11-05). M5+ checked by Claude in Chrome (strip and circle previews, inbound
callouts, rearm countdowns, gun-run lethality, bomb flash/shockwave/whiteout and jet streak; 60 FPS, GPU ~8 ms; §6).
M6 and its feedback fixes checked by Claude in Chrome (zone tour in all sensors, no spawn camping, enemies cross on the bridge; §6).

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
                           sensorFx, gunnery, infantry, ai, enemyFire, ridgeback, vehicles,
                           groundFire, testScene, hud, fx)
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
    weaponDefs.ts (+test)  ALL weapon stats (PLAN §9) + per-weapon impact effects (data); the
                           `Ordnance` type every impact (guns and strikes) shares
    airSupportDefs.ts      ALL air-strike stats (gun run, bomb) + the ORDNANCE table (data)
    AirSupport.ts (+test)  strike aiming mode, cooldowns, impact schedule, jet passes, footprints
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
  ai/
    Paths.ts (+test)       ground polylines: point/heading at distance, corner slowdown factor
    CoverPoints.ts (+test) cover reservation (one soldier per point); corner points from houses
    EnemyBrain.ts (+test)  pure decision: flee / take cover / fire / advance / hold
  units/
    unitDefs.ts            ALL infantry stats (rifleman, machine gunner, Ridgeback), data
    SpatialGrid.ts (+test) 20 m grid: radius + nearest queries (blasts, separation, targeting)
    Infantry.ts (+test)    one soldier (either side): walk, damage, fling death, cooling; recyclable
    infantryPose.ts (+test) pure walk bob / lean / tumble / lying-flat pose
    TeamHealth.ts (+test)  Ridgeback shared health: damage, +1/s regen after 4 s quiet, overrun
    Squad.ts (+test)       route following with holds, diamond formation slots, strobe blink timing
    UnitManager.ts (+test) owns all soldiers + grid; runs EnemyBrain (cover, line of sight, panic,
                           morale), wall sliding, Ridgeback return fire, tracers, overrun → fail
    InfantryRenderer.ts    ONE InstancedMesh for every soldier + IR strobe point layer
    vehicleDefs.ts         ALL vehicle stats + box-part layouts (truck, technical, APC), data
    Vehicle.ts (+test)     one vehicle: road driving (corner slowdown, smooth turning), armor,
                           intact → smoking → burning wreck; recyclable
    VehicleManager.ts (+test) convoy spacing, wrecks block the road, unloading, mounted guns,
                           bail-outs; pool of 12
    VehicleRenderer.ts     ONE InstancedMesh of boxes for every vehicle part + smoke/fire emission
    UnitManager.ai.test.ts M5 enemy behavior: cover, line of sight, walls, panic, morale, paths
    TestScene.ts (+test)   TEMPORARY scene on the real map (M7 replaces): Ridgeback walks the whole
                           journey; anti-camping waves on the map's paths/spawns (≤ 60); convoys
    mapScene.test.ts       headless run of the real map scene (enemies cross only on the bridge)
  world/
    mapTypes.ts            the MapData types (roads, stream, bridges, fields, buildings, walls,
                           props, zones, routes, enemy/vehicle paths, spawns)
    MapData.ts             THE handcrafted Varesh Valley map (data; edit this to change the map)
    validateMap.ts (+test) authoring checks + 2D geometry helpers (rects, polylines, crossings)
    terrainShape.ts (+test) the map's height field: hills, valley walls, flats, level roads, stream
    Terrain.ts (+test)     heightmap mesh + exact heightAt() (takes a height field)
    groundHeat.ts (+test)  ground heat: soil patches, and per-field levels (plowed/grass/stubble/gravel)
    Collision.ts (+test)   raycast vs terrain + rotated building boxes (roofs before ground);
                           line of sight (houses + hills) and push-out of building footprints
    Roads.ts (+test)       road ribbons draped over the terrain
    crossings.ts (+test)   stream crossings: walkers detour over the nearest bridge
    WorldBuilder.ts (+test) MapData → meshes (≈13 draw calls), collision boxes, cover, bridge surface
    InstancedSignature.ts  static InstancedMesh with a signature per instance
  debug/
    mapOverlay.ts (+test)  overlay shapes from MapData; placer format; F3 zone-tour order
    DebugOverlay.ts        SVG overlay projected onto the sensor view (F2), placer mark
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
                           F1 stats (incl. KIA, live enemies EN, live vehicles VEH)
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
`Q` or wheel = cycle weapon · `T` = air support: gun run → bomb → off (wheel turns the run, click calls it) ·
`F` = sensor: white-hot → black-hot → night vision · `Esc` = pause ·
`F1` = FPS / GPU ms / draw calls / triangles / kills / live enemies / live vehicles. If pointer lock is unavailable, **hold the
right button and drag** to aim. Add `?debug=1` to the URL to start with stats on.
Map authoring (dev builds, or `?debug=1`): `F2` = map overlay · `P` = log the crosshair point as
`[x, z]` (console + clipboard) · `F3` = tour the orbit over each zone, then back to the team.

---

## 3. Manual checklists

### 3.1 M6 look test (passed 2026-11-05): "flying the orbit over each zone shows a believable, readable place"

Run `npm run dev`, click to begin. Press `F3` to park the orbit over each zone in turn (OP →
fields → village → crossroads → LZ; a sixth press goes back to following Ridgeback). Try all
three weapons' zoom and all three sensors (`F`). `F2` shows the map overlay; `P` logs the
crosshair point (to paste into `src/world/MapData.ts`).

- [ ] **Fields:** plowed fields read warm with faint furrows, grass fields cool; hedgerows as
      thin lines; the farmhouse, barn and shed; hay bales; the tree line to the north.
- [ ] **Stream and bridge:** the cold (black in white-hot) stream runs north–south west of the
      village; the farm track crosses it on a small bridge. Ridgeback walks over it (Claude
      checked: nobody wades).
- [ ] **Village:** 43 houses and a workshop on five streets (main road, north street, back
      street, west lane, east street), lit windows, chimneys, parked cars and crates, a square. The **clinic** on the square's east side has lit
      windows on every side and a hot generator next to it (it is protected; firing on it only
      fails the mission from M7).
- [ ] **Crossroads:** the north and east roads meet the main road; gas station canopy, shop,
      garage, two houses, compound walls.
- [ ] **Quarry LZ:** a light gravel floor with warmer rock faces on three sides, open to the
      north-east, south-east and west.
- [ ] **Valley:** the ground rises into hills/mountains beyond the map edge; no visible terrain
      edge from any orbit.
- [ ] **Play still works:** Ridgeback now walks the whole journey OP → LZ (and back); enemy
      groups arrive along the map's approach paths; convoys come down the north/east roads or
      into the village. Enemies use cover at houses, hedges, walls, rocks and props.
- [ ] **No spawn camping (your feedback):** keep the crosshair on a spot where enemies just
      appeared: the next groups come from elsewhere (never within 160 m of the crosshair, a site
      rests 30 s), and soldiers appear one at a time, so one shell can't wipe a whole group as
      it spawns.
- [ ] **Bridge (your feedback):** enemies on the other bank walk to the bridge and cross on it
      (watch the bridge when Ridgeback is in the fields or the village west edge).
- [ ] `F1`: GPU well under 16 ms and draw calls well under 150 over every zone (Claude:
      ~30–34 calls, GPU 7–8 ms; ~10 ms with the F2 overlay on).

### 3.1a M5+ feel test (passed 2026-11-05): "calling a strike is a deliberate, risky decision; the delay makes you predict; the guns still matter"

Run `npm run dev`, click to begin. Strike stats: `src/gunship/airSupportDefs.ts`; wheel step and
jet streak: `CONFIG.airSupport`.

- [ ] **Aiming:** `T` once = GUN RUN (▶ on its HUD line, a dashed 60 × 8 m strip on the ground
      under the crosshair, running away from the aircraft); the wheel turns it in 15° steps.
      `T` again = BOMB (dashed 40 m circle), `T` again = back to the guns. Pressing `1`/`2`/`3`
      or `Q` also returns to the guns. While aiming, clicks don't fire the guns.
- [ ] **Calling:** a click calls the strike on that ground point (it stays there even if you
      look away). The top of the HUD shows `HAMMER 1-1 INBOUND 7` (gun run) or
      `SABRE 2-2 INBOUND 18` (bomb), counting down; the strike line shows `REARM 60` / `REARM 90`.
- [ ] **Gun run:** a hot streak dives in along the strip, and 40 small hits walk along it in 2 s.
      Claude measured ~65 % of soldiers inside the strip killed (they keep walking during the
      7 s delay, so lead the group). Good against technicals; hurts APCs (×0.6).
- [ ] **Bomb:** 18 s later, one huge flash, shockwave ring, shake and whiteout; anything within
      ~25 m dies, APCs included. The jet passes high overhead just before.
- [ ] **Restraint:** with a friendly within 25 m of the strip (100 m of the bomb point) the
      footprint turns solid and blinks, and `FRIENDLIES DANGER CLOSE` shows. Calling anyway can
      kill Ridgeback → `FRIENDLY FIRE` fail screen.
- [ ] **Balance:** unlimited calls, cooldown only (your choice). Does it make the guns feel
      redundant? Knobs: `cooldown`, `delay`, `impacts`, `damage` in `airSupportDefs.ts`.
- [ ] `F1`: GPU stays well under 16 ms during a gun run and after a bomb.

### 3.1b M5 feel test (passed 2026-11-05): "enemies visibly take cover, advance and flee; a convoy arrives, unloads and burns convincingly"

Run `npm run dev`, open the URL (add `?debug=1` for stats; F1 shows `VEH` = live vehicles), click
to begin. Same moving-team scene as M4, plus a convoy every 45 s (first at 20 s) on the road that
ends nearest Ridgeback. Tuning: `CONFIG.ai`, `CONFIG.vehicles`, `CONFIG.testScene`,
`src/units/vehicleDefs.ts`, `panicRadius` in `src/gunship/weaponDefs.ts`.

- [ ] **Cover:** when Ridgeback walks past the village (south-west leg), enemies run to house
      corners, crouch (lower, leaning) and fire from there; they hop forward corner to corner.
      One soldier per corner. Crouched soldiers take less 25/40 mm damage (`ARMOR.cover`).
- [ ] **Line of sight:** enemies behind a house or a hill don't fire (team health doesn't drop for
      them); they walk around houses (sliding along the wall), not through them.
- [ ] **Panic:** a 105 mm hit near a group (within ~45 m) sends the survivors running away for
      3–5 s, then they come back. 40 mm has a 10 m panic radius, 25 mm none.
- [ ] **Morale:** after you kill 3+ soldiers near one, it may break (30 %) and run back the way
      it came for 8–12 s. Fleeing soldiers are fast, bright targets.
- [ ] **Convoy:** a truck leads, often a technical and sometimes an APC behind, ~22 m apart, slowing
      for bends. Trucks stop at the road end and 6–8 soldiers climb out of the back one by one.
- [ ] **Vehicle damage:** trucks take ~2 × 40 mm or one 105 mm; they smoke below half health, then
      burn (fire + smoke) and lose their cab. The APC laughs off 25 mm; it needs the 105 mm.
- [ ] **Wreck blocks the road:** kill the lead truck on the way in: the vehicles behind stop short
      of the wreck and unload / open fire right there. Some soldiers bail out of a burning truck
      and run; the rest count as kills (`KIA`).
- [ ] **Technicals are priority targets:** once stopped, their heavier tracers drain team health
      fast (dps 3 vs 0.6 for a rifleman); the APC fires on the move (dps 4).
- [ ] `F1`: FPS ~60, GPU well under 16 ms with a convoy, burning wrecks and ~60 soldiers.
- [ ] Difficulty: with no player fire the team was overrun at ~75 s (Claude's run). Waves now come
      every 10 s (was 8) to make room for the convoys.

### 3.1c M4 feel test (passed 2026-11-05): "60 enemies attacking a moving team is fun for 2 minutes"

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

### 3.1d M3 feel test (passed 2026-11-04; unchecked edge cases listed in §6)

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

1. **M7: mission scripting & dialogue**: mission scripting & dialogue** (PLAN.md §7.14–7.15, §8): the mission runner
   (phases, conditions, actions), the radio with subtitles, protected-clinic fail logic
   (`WorldBuilder.protectedBoxes`), `moveTeam` on the map's route ids, scripted spawns at the
   map's spawn points/paths, the extraction helicopter. Replaces `units/TestScene.ts`.
2. Consider adding the GitHub Actions CI workflow from PLAN.md §12.1 (`npm run check` +
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
18. **`DummyTarget` (removed in M5) and the placeholder sounds are temporary** (M9 audio). Dummy HP/armor
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

29. **Cover points come from the authored objects** (M6 replaced "hand-placed cover per zone",
    PLAN §7.11): 1.4 m outside each building corner, 1 m outside each prop corner, and every 9 m
    along both faces of each hedge, wall and rock face; points inside anything or in the stream
    are dropped (~440 points). To add cover somewhere, add a prop or wall in `MapData.ts`. A soldier only looks for cover within 1.25 × its range of the
    target and 40 m of itself; a point must be within 0.9 × range of the target and not farther
    than the soldier already is, and either have a view of the target or bring it ≥ 15 m closer
    (corner-to-corner bounding). In cover without a view it moves on and won't pick that point
    again right away. Crouched soldiers take 0.5 / 0.7 / 1.0 damage from 25 / 40 / 105 mm and
    Ridgeback hits them half as often.
30. **Line of sight checks houses and hills** (terrain sampled every 10 m, eye level 0.5 m above
    the body center). On the placeholder terrain (±22 m hills) hills block ~38 % of 50–250 m
    sightlines, which is why decision 29's bounding rule exists. M6 flattens the village/LZ.
31. **Morale is event-based, not a meter:** each nearby (25 m) enemy death adds 1 stress; being
    wounded also counts. At 3 stress (or when wounded) the soldier rolls once (30 % to break)
    and the stress resets. Breaking = run toward its spawn point for 8–12 s, then rally. Big
    blasts (weapon `panicRadius`: 105 mm 45 m, 40 mm 10 m) make survivors run 3–5 s regardless.
32. **Walls:** soldiers are pushed out of building footprints (0.6 m body radius) and then slide
    along the wall in one committed direction for 0.6 s (a regression test covers the "dither in
    front of the wall's middle" bug found while writing it). No pathfinding/navmesh (PLAN §7.11).
33. **Vehicles:** the road-blocked check looks `blockDistance` (13 m) plus braking distance ahead,
    so fast vehicles stop short of a queue (found by a test: a technical rear-ended a stopped
    truck). After 2 s stuck, a truck unloads and a gun vehicle opens fire right there. Technicals
    fire only when stopped; APCs on the move. Mounted-gun damage uses the same accuracy curve as
    rifles. Soldiers inside a destroyed vehicle bail out (50 %, panicked) or die (counted as kills).
34. **Vehicle pool of 12** (PLAN §11): when full, empty parked trucks are recycled first, then
    wrecks older than 60 s; never a vehicle still in the fight (the spawn then fails).
35. **Vehicles don't collide with soldiers or houses** (they only follow roads; the test roads
    avoid the houses). Wrecks aren't cover points yet (possible M6/M10 addition).
36. **Enemy approach paths are supported** (`spawnEnemy(..., { path })`) but the test scene
    doesn't use them; M6/M7 author them in `MapData`.

37. **Air support was added to the plan as M5+** (user request, 2026-11-05), built after the M5
    sign-off. User choices: generic aircraft with fictional callsigns (not real type names, to fit
    the fictional setting), and **unlimited use limited only by cooldowns** (Claude had suggested
    2 gun runs + 1 bomb per mission). Strike key is `T` because §7.18 reserves `G` for god mode.

38. **Every impact is now `Ordnance`** (guns and strikes share one type in `weaponDefs.ts`);
    `DamageSource`, armor tables and the `impact` / `dangerClose` / `friendlyKilledByPlayer`
    events take any `OrdnanceId` (`'25' | '40' | '105' | 'gunrun' | 'bomb'`). Air-strike kills
    count as the player's (`KIA`). APC armor vs the gun run is 0.6, vs the bomb 1.0.
39. **Gun-run tuning came from browser measurements:** with a 15 m panic radius per hit, soldiers
    ran out of the strip before the later rounds arrived (0 kills on a group of 9), so it is 6 m;
    30 hits × 120 damage killed ~30 % of soldiers in the strip, so it is now 40 × 200 (inner 1.5 m,
    blast 4.5 m) → ~65 %. Gun-run hits leave no craters (40 per run would flush the 60-crater pool).
40. **Air-support input:** `T` cycles the aiming mode; while aiming, the trigger and wheel belong to
    the strike (no gun fire, wheel turns the run); selecting a gun ends aiming. A strike on
    cooldown ignores the click and stays in aiming mode. The run starts pointing away from the
    aircraft. Strikes only advance while playing (they wait during pause and stop on failure).
    The preview is projected to screen pixels each frame and drawn as an SVG polygon in the HUD.

41. **The map is data** (`world/MapData.ts`, types in `mapTypes.ts`), checked by `validateMap`
    (inside the map, unique ids, one protected clinic in the village, routes joined in order,
    nothing on roads, no overlapping buildings/props, spawns and paths on open ground, vehicle
    paths on roads, a bridge wherever a road crosses the stream). `validateMap.test.ts` keeps the
    real map valid; break a rule and the message names the object and the point.
42. **Terrain comes from the map** (`terrainShape.ts`): hills 18 m (was 28), a valley rising
    140 m from 760 m out (the mountains outside the playable map), level flats under the OP,
    farmyard, village, crossroads and quarry, roads level across their width, the stream cut
    1.6 m deep except within ~12–24 m of the bridge (a culvert, so a squad wider than the 8 m
    deck doesn't wade: found in the browser, Ridgeback's leader walked 3 m off the deck's center).
    The 10 m terrain grid softens the stream channel; the water ribbon on top shows its course.
    `CONFIG.terrain.seed/hillHeight` only drive the plain noise terrain used in tests now.
43. **Everything on the map is instanced by kind** (boxes, rough boxes for hedges/rock/hay, hip
    roofs, trees) so the whole map is ~13 draw calls; barns use two tilted box planes as a gable
    roof. Quarry rock is warm (0.27) and its floor is a `gravel` field (warmest ground): at the
    first try the quarry was invisible against the soil.
44. **People walk on `WorldBuilder.surfaceAt`** (bridge deck over the stream); vehicles and
    effects use the bare terrain. Bridge decks are `walkable` collision boxes (shells hit them,
    they don't block walking or sight); the gas-station canopy only blocks shells (people stand
    under it).
45. **Debug tools ship in production behind `?debug=1`** (F2 overlay, P placer, F3 zone tour);
    `window.nightOrbit` stays dev-only. The PLAN §7.18 cheats (god mode, skip phase…) come with M7.
46. **Clinic protection is data only in M6**: `protected: true` in MapData and
    `WorldBuilder.protectedBoxes` (the clinic and its generator); the fail rule and FCO warning
    are M7 (PLAN §7.7, §8 phase 2).

47. **Stream crossing (user feedback):** `world/crossings.ts` checks whether a soldier's straight
    walk to its current goal crosses the stream; if so it walks to the near end of the nearest
    bridge (6 m beyond the deck), then the far end. Applied in every soldier move (both sides).
    No general pathfinding: houses are still handled by wall sliding (decision 32).
48. **Anti spawn-camping (user feedback):** the old spawner reused the same path start every
    time. Now: random site among path starts + spawn points 180–450 m from the team, excluding
    sites within 160 m of the sensor aim and sites used in the last 30 s (falls back to any
    unwatched site, then to a random bearing); groups scatter over 18 m and appear one soldier
    every ~0.7 s. Knobs in `CONFIG.testScene`. M7's scripted spawns should keep these rules.
49. **The village grew to 43 houses + a workshop** (user feedback) with a back street, a west
    lane and an east street, and the village zone/flat grew to match (radius 200 / 190 m). Three
    new approach paths (west lane, north-east, south lane) and extra spawn sites in every zone.

---

## 6. Manual test results / notes

_(Fill in after testing.)_

| Date       | Item                            | Result                                                                                                                                     | Action                                                                                                                         |
| ---------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-03 | M1 manual checklist             | User reported everything works                                                                                                             | None; M1 signed off                                                                                                            |
| 2026-11-03 | M2 look (Claude, Chrome)        | Thermal feed OK; HUD hard to read in black-hot; soil patches too strong                                                                    | Added dark HUD outline; softened soil patches                                                                                  |
| 2026-11-03 | M2 aiming (user)                | "Looking around feels a bit laggy"                                                                                                         | GPU was ~23 ms/frame; capped pixel ratio 1.5, MSAA off → ~7.5 ms; GPU ms added to F1                                           |
| 2026-11-03 | NV look (Claude, Chrome)        | Trees/walls rendered darker than the ground (sideways surfaces got too little sky light)                                                   | Flattened sky term, rebalanced moon/sky and albedos; regression test added                                                     |
| 2026-11-03 | M2 look test (user)             | "It looks well for now"                                                                                                                    | None; M2 signed off                                                                                                            |
| 2026-11-03 | NV look test (user)             | Approved ("mark it signed off")                                                                                                            | None; NV signed off                                                                                                            |
| 2026-11-03 | M3 tracers (Claude)             | First meters of each tracer drew as huge white blobs near the camera                                                                       | Skip < 150 m from sensor, cap 7 px; regression test                                                                            |
| 2026-11-03 | M3 smoke (Claude)               | 105 mm smoke too faint to read after the flash                                                                                             | Warmer, more opaque plume                                                                                                      |
| 2026-11-03 | M3 lead test (scripted)         | 25 mm 1.2 s bursts on walking soldiers: led 2/2 killed, unled 1/3 killed                                                                   | Leading matters as intended; 105 mm led on a truck destroyed it (burning)                                                      |
| 2026-11-04 | M3 feel test (user)             | "M3 seems to be working well"; signed off                                                                                                  | Not yet tried: sound, pause with shells in flight, roof hits, 2–3 min stress (GPU, crater cap), Firefox/Safari                 |
| 2026-11-04 | M4 scripted (Claude, Chrome)    | No player fire: enemies reach 60 alive, team 96 → 0 by ~70 s, `RIDGEBACK OVERRUN` screen                                                   | Works; difficulty to judge in the feel test (`CONFIG.enemyFire`, `unitDefs.ts`)                                                |
| 2026-11-04 | M4 fail/warn (Claude, Chrome)   | 105 mm 28 m from the team → DANGER CLOSE, nobody hurt; 40 mm on a member → `FRIENDLY FIRE` fail screen                                     | Works as designed                                                                                                              |
| 2026-11-04 | M4 look (Claude, Chrome)        | Team readable at 25 mm; strobes blink in WHT/BLK, bright in NV; NV tracers visible; 60 FPS, GPU 7.7–8.1 ms, 23–28 calls                    | None                                                                                                                           |
| 2026-11-05 | M4 feel test (user)             | "M4 feels good"; strobes in thermal and the difficulty accepted as they are                                                                | None; M4 signed off                                                                                                            |
| 2026-11-05 | M5 cover (Claude, Chrome)       | No enemy ever took cover: hills blocked the view from every corner to the team                                                             | Added corner-to-corner bounding (decision 29); then up to 18 soldiers at once held or ran to cover                             |
| 2026-11-05 | M5 convoy (Claude, Chrome)      | Convoy drove the west road, truck unloaded and parked, technical/APC fired heavy tracers; 105 mm on a truck → burning wreck, others queued | Works; 60 FPS, GPU ~7.9 ms, ≤ 35 draw calls, no console errors                                                                 |
| 2026-11-05 | M5 scripted (Claude, Chrome)    | No player fire: convoys + waves overran the team at ~75 s                                                                                  | Difficulty for the user's feel test; waves slowed 8 → 10 s                                                                     |
| 2026-11-05 | M5 feel test (user)             | "M5 feel test seems good"                                                                                                                  | None; M5 signed off                                                                                                            |
| 2026-11-05 | M5+ gun run (Claude, Chrome)    | 0 kills on a group of 9: first hits panicked them out of the strip; then ~30 % killed in the strip                                         | Panic radius 15 → 6 m, 30 × 120 → 40 × 200 damage: ~65 % (11 of 17) killed over 6 runs                                         |
| 2026-11-05 | M5+ bomb + HUD (Claude, Chrome) | Bomb killed a truck outright; flash, shockwave, whiteout, jet streak; strip/circle previews, INBOUND and REARM lines OK                    | Controls-table row was too long (squashed the key column): shortened. 60 FPS, GPU ~8 ms, no console errors                     |
| 2026-11-05 | M5+ feel test (user)            | "Feel test is good"                                                                                                                        | None; M5+ signed off                                                                                                           |
| 2026-11-05 | M6 look (Claude, Chrome)        | Village, roads, clinic generator, fields and stream read well; the quarry was invisible (rock ≈ soil heat)                                 | Rock 0.14 → 0.27 and a warm gravel quarry floor: walls and floor now stand out                                                 |
| 2026-11-05 | M6 bridge (Claude, Chrome)      | 3 of 4 Ridgeback members waded through the stream bed beside the 6 m bridge                                                                | Stream kept shallow around bridges, deck 6 → 8 m: nobody dips below the banks; regression test                                 |
| 2026-11-05 | M6 play (Claude, Chrome)        | 58 of 64 enemies spawned on approach paths, 26 heading for cover, a convoy queued into the village; 60 FPS, 30–34 calls                    | Works; no console errors. GPU 7–8 ms (~10 ms with the F2 overlay)                                                              |
| 2026-11-05 | M6 look test (user)             | "Enemies can be spawn killed (same point)", "village can be populated with more roads, houses", "enemies do not use the bridge"            | Anti-camping spawner, 43-house village on 5 streets, bridge detours (decisions 47–49); look test to repeat                     |
| 2026-11-05 | M6 fixes (Claude, headless)     | Chrome extension was not connected, so checked headless: a 3-min real-map scene run, every enemy stream crossing on the bridge             | Regression test `mapScene.test.ts` (fails without the detour: an enemy waded 185 m from the bridge). Not yet seen in a browser |
| 2026-11-05 | M6 fixes (Claude, Chrome)       | F3 tour of all 5 zones in WHT/BLK/NV at all zooms reads right; spawn camping: crosshair held on a spawn site, later groups 239–520 m away; 14 live enemy stream crossings, all ≤ 3.4 m from the bridge center (Ridgeback 1.6 m); bomb lands on its point; 60 FPS, GPU 7.6–8.2 ms (11.3 ms with F2), 30–38 calls; no console errors | Fixes confirmed in the browser; M6 look test (user) still to repeat |
| 2026-11-05 | M6 look test (user)             | "Look test seems nice"                                                                                                                       | None; M6 signed off                                                                                                            |

---

## 7. How to resume in a new session

Start Claude Code in this folder and say something like:

> "Read STATUS.md and PLAN.md. Let's continue (M6 look test, then M7)."

`CLAUDE.md` already tells Claude to read these files and follow the testing rules.
