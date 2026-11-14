# NIGHT ORBIT — Project Status & Handoff

_Last updated: 2026-11-14_

This file says **where the project is right now**, **what needs testing**, and **what comes next**.
The full design and milestone list are in [`PLAN.md`](PLAN.md). Update this file at the end of
every session.

---

## 1. Where we are

| Milestone                               | State                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------- |
| **M0** Project setup                    | ✅ Done                                                                   |
| **M1** Gunship, sensor & terrain        | ✅ Done. Automated tests pass; manual test passed 2026-11-03 (§6)         |
| **M2** Thermal look                     | ✅ Done. Automated tests pass; manual look test passed 2026-11-03 (§6)    |
| **M2+** Night-vision sensor             | ✅ Done. Tests pass; look test passed 2026-11-03 (§6)                     |
| **M3** Weapons, ballistics & explosions | ✅ Done. Tests pass; feel test passed 2026-11-04 (§6)                     |
| **M4** Infantry & friendlies            | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                     |
| **M5** Enemy AI & vehicles              | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                     |
| **M5+** Air support                     | ✅ Done. Tests pass; feel test passed 2026-11-05 (§6)                     |
| **M6** The handcrafted map              | ✅ Signed off (look test passed, user, 2026-11-05)                        |
| **M7** Mission scripting & dialogue     | ✅ Signed off (play test passed, user, 2026-11-08)                        |
| **M8** UI screens & settings            | ✅ Signed off (user, 2026-11-09, with the M8+ A + B play test); committed |
| **M8+** Content & threat expansion      | ✅ Signed off (C–F play test passed, user, 2026-11-09); committed         |
| **M9** Audio                            | 🟨 Code-complete (2026-11-09); **user listen test pending (§3.0)**        |
| M10                                     | ⬜ Not started                                                            |

**Automated checks (last run):** `npm run check` all green (typecheck, lint, **640 tests in 73 files**).
`npm run build` works (≈780 kB JS, 216 kB gzipped).

**Git:** `https://github.com/aliemrepmk/night-orbit` (`main`). M0–M7 are pushed (M7 committed and pushed 2026-11-08 after its play test passed). M8, M8+ Phases A–F and M9 are committed locally (2026-11-09), **not pushed yet** (the user pushes manually). Commit-message rules are in `CLAUDE.md`.

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
                           groundFire, spawning, mission, radio, chatter, clinic,
                           helicopter, hud, fx)
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
    triggerGate.ts (+test) M8+: who owns the trigger: guns or the strike being aimed
    ballistics.ts (+test)  flight time, spread disc, spread across view, muzzle position
    Projectiles.ts (+test) pooled shells in flight; impact on exactly the right tick
  combat/
    Damage.ts (+test)      falloff, armor table, applyRadial
    AirDefense.ts (+test)  M8+: AA guns (targets) and trucks firing at the gunship, the hull
                           (engine out, shot down), MANPADS missiles, flares, strike threat
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
    InfantryRenderer.ts    soldiers as jointed figures: one InstancedMesh per body part (11 calls)
                           + IR strobe point layer (M8+ Phase C)
    soldierRig.ts (+test)  M8+: the soldier figure, pure: part placement per state (walk/run
                           strides, kneeling, shouldered rifle + recoil, flung/dead), kit (Ridgeback
                           helmet + NVG + plates, militia caps), per-part heat (skin, cloth, barrel)
    vehicleDefs.ts         ALL vehicle stats + box-part layouts (truck, technical, APC), data
    Vehicle.ts (+test)     one vehicle: road driving (corner slowdown, smooth turning), armor,
                           intact → smoking → burning wreck; recyclable
    VehicleManager.ts (+test) convoy spacing, wrecks block the road, unloading, mounted guns,
                           bail-outs; pool of 12
    VehicleRenderer.ts     ONE InstancedMesh of boxes for every vehicle part + smoke/fire emission
    UnitManager.ai.test.ts M5 enemy behavior: cover, line of sight, walls, panic, morale, paths
    spawning.ts (+test)    where enemies come from (was TestScene.ts): anti-camping groups at the
                           map's paths/spawns (≤ 60); `queueAt(site)` for the script, zone waves
                           (`auto`, `zone`); `journeyRoute`; the old free-running `ConvoySpawner`
    Helicopter.ts (+test)  Kestrel 6: scripted flight in → land → board → lift off → gone
    HelicopterRenderer.ts  ONE InstancedMesh of hot boxes + spinning rotors
    mapScene.test.ts       headless run of the real map scene (enemies cross only on the bridge)
  world/
    mapTypes.ts            the MapData types (roads, stream, bridges, fields, buildings, walls,
                           props, zones, routes, enemy/vehicle paths, spawns)
    MapData.ts             THE handcrafted Varesh Valley map (data; edit this to change the map)
    forest.ts (+test)      M8+: Black Pine Forest: point-in-forest (clearings excluded) and the
                           jittered tree placement (off roads, stream, buildings)
    explosives.ts (+test)  M8+: the fuel depot's tanks: damage from impacts, fuse, fireball
                           (TANK_BLAST, chains to neighbors), burning
    validateMap.ts (+test) authoring checks + 2D geometry helpers (rects, polylines, crossings)
    terrainShape.ts (+test) the map's height field: hills, valley walls, flats, level roads, stream
    Terrain.ts (+test)     heightmap mesh + exact heightAt() (takes a height field)
    groundHeat.ts (+test)  ground heat: soil patches, and per-field levels (plowed/grass/stubble/gravel)
    Collision.ts (+test)   raycast vs terrain + rotated building boxes (roofs before ground);
                           line of sight (houses + hills) and push-out of building footprints,
                           over a 32 m box grid (M7)
    Roads.ts (+test)       road ribbons draped over the terrain
    crossings.ts (+test)   stream crossings: walkers detour over the nearest bridge
    WorldBuilder.ts (+test) MapData → meshes (≈13 draw calls), collision boxes, cover, bridge surface
    InstancedSignature.ts  static InstancedMesh with a signature per instance
  mission/                 (M7, PLAN.md §7.14–7.15, §8)
    missionTypes.ts        the mission as data: phases → ordered steps (condition → actions)
    script.ts              the vocabulary: timeInPhase, teamReached, zoneEnemiesBelow, say, spawnWave, …
    twists.ts (+test)      M8+: seeded random events: one extraction twist + 2–4 side events,
                           conflicts, `?seed=` / `?twist=`, the end screen's EVENTS line
    landmarks.ts (+test)   M8+: named places and "north of the barn" radio callouts
    twistMechanics.test.ts M8+: mortar, wound, jam, fog, pilot, HVT, Kestrel abort, the bus
    missionDef.ts (+test)  THE Varesh Valley script: calibration, fields, village, vehicles, extraction
    Mission.ts (+test)     the runner: steps fire once in order, timeouts (safety valve), phases, timers
    MissionHost.ts (+test) runs the script on the real systems; radio, chatter, clinic rule, helo
    Radio.ts (+test)       subtitled radio: priority queue, cut-off of chatter, stale lines dropped
    Chatter.ts (+test)     reactive lines on events (kills, danger close, clinic, misses), cooldowns
    lines.ts               every reactive radio line (pools; story lines live in missionDef.ts)
    clinic.ts (+test)      protected-clinic rule: hit (fail) / near miss (warning) per ordnance
    battle.ts (+test)      M8: `createWorld()` (static, built once) + `createBattle()` (one run:
                           bus, units, vehicles, spawner, mission, stats); a restart = new battle
    headlessGame.ts        the whole game without a screen (auto-play, host tests, tuning runs)
    stats.ts (+test)       M8: kills, gun accuracy, damage taken, danger close, time; rating + grade
    briefing.ts            M8: the briefing screen's text
    autoplay.test.ts       a cheat-kill bot plays the whole mission to MISSION COMPLETE
  debug/
    cheats.ts (+test)      dev cheats: G god, N skip phase, K kill all, [ ] time scale; ?phase=
    mapOverlay.ts (+test)  overlay shapes from MapData; placer format; F3 zone-tour order
    DebugOverlay.ts        SVG overlay projected onto the sensor view (F2), placer mark
  render/
    AirRenderer.ts         M8+: strike jet models (attack jet, fast jet; hot engines) and AA
                           emplacements (sandbags, mount, barrels that track and heat up)
    models.ts              M8+: box-model specs (jets, sandbag ring) merged into one geometry
    Renderer.ts            WebGLRenderer + composer: heat (half-float, MSAA) → bloom → ThermalPass
    ThermalMaterial.ts     the one shader: signature (heat, albedo, glow) → heat or NV light
    ThermalPass.ts         post: barrel, refocus blur, curve, polarity, grain, scanlines, vignette, static
    thermalMath.ts (+test) pure sensor modes, polarity, curves, NV lighting, grain (spec for shaders)
    SensorFX.ts (+test)    weapon-switch static burst + refocus blur envelopes
    GpuTimer.ts (+test)    GPU ms per frame via WebGL timer query (F1 stats)
  audio/
    sounds.ts              synth sound definitions: noise + thump + click / rattle / tone layers (M9)
    mix.ts (+test)         M9: the buses (master → sfx, radio, ambience) and their gain math
    soundMap.ts (+test)    M9: which event plays which sound (pure), and the bus wiring
    AudioEngine.ts (+test) WebAudio player on the buses; silent no-op without WebAudio; engine drone, radio static
    engineDrone.ts (+test) M8+: drone mix per mode (off / on / muffled) and pitch + pan from the orbit
  ui/
    HUD.ts                 telemetry, reticles, gun status, team health, DANGER CLOSE, clock,
                           F1 stats (incl. KIA, live enemies EN, live vehicles VEH)
    hudFormat.ts (+test)   pure HUD text: gun status, team health, fail reasons, subtitles,
                           objective, countdowns
    hud.css                HUD + every screen's styles (title, briefing, pause, settings, end)
    screenFlow.ts (+test)  M8: the screen state machine (title → briefing → playing ⇄ paused …)
    Screens.ts             M8: the full-screen panels (DOM); buttons → Game
    settings.ts (+test)    M8: sensitivity, invert Y, volume, shake, subtitles; safe save/load
    edgeArrow.ts (+test)   M8: off-screen friendly arrow position on the screen edge
    briefingMap.ts (+test) M8: the briefing's map sketch from MapData (SVG)
    controls.ts            M8: the controls list (pause screen + H overlay)
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
`F` = sensor: white-hot → black-hot → night vision · `H` = controls overlay · `Esc` = pause (resume, restart, settings) ·
`F1` = FPS / GPU ms / draw calls / triangles / kills / live enemies / live vehicles. If pointer lock is unavailable, **hold the
right button and drag** to aim. Add `?debug=1` to the URL to start with stats on.
Map authoring (dev builds, or `?debug=1`): `F2` = map overlay · `P` = log the crosshair point as
`[x, z]` (console + clipboard) · `F3` = tour the orbit over each zone, then back to the team.
Cheats (dev builds, or `?debug=1`): `G` = god mode · `N` = skip to the next phase · `K` = kill all
enemies and vehicles · `[` / `]` = time ×0.25 / ×1 / ×4 · `?phase=fields|village|vehicles|extraction`
starts at that phase. F1 also shows the mission phase/step and active cheats.

---

## 3. Manual checklists

### 3.0 M9 listen test (pending): "playing with eyes closed, you can tell which weapon is firing and when shells land"

Run `npm run dev`, use headphones or decent speakers, and check:

- [ ] Eyes closed, someone else (or you, at random) fires: the 25 mm (fast bright crackle), the
      40 mm (round thump with a click) and the 105 mm (deep boom, cabin rattle) are easy to tell apart.
- [ ] Each shell's impact is heard when it lands, after the flight time; 25 mm hits are audible.
- [ ] Radio: Ridgeback, Kestrel 6 and the strike pilot open with a squelch, have faint static under
      the line and close with a "kssht"; FCO and NAV lines are only a soft intercom click.
- [ ] Cockpit beeps: a short beep when you pick a gun; a two-note beep when a gun is ready again
      (the 105 mm with a metal clank first); a low buzz when you press X with no flares left.
- [ ] Menu buttons click. Pause and settings silence the radio static; it comes back on resume.
- [ ] SETTINGS has VOLUME, EFFECTS, RADIO and ENGINE: each one changes only its own sounds, and
      VOLUME changes all of them.
- [ ] Nothing is annoying after 15 minutes (beeps too loud or too frequent, static too strong).

### 3.0a M8+ Phases C–F play test (passed 2026-11-09, one full run): "no stretch feels empty; two runs feel different; AA and missiles are a threat you manage"

Run `npm run dev` and play two or three whole missions (each gets new random events; the end
screen lists them with the seed). Dev flags to force things: `?seed=1234`, `?twist=mortar,bus`,
`?phase=village` (extraction twists: `kestrelAbort`, `quarryOverrun`, `holdTheLine`; side events:
`clinicAssault`, `mortar`, `downedPilot`, `hvt`, `bus`, `wounded`, `fog`, `jam`, `manpadsAmbush`).

- [ ] **Soldiers (C):** jointed figures; walking, kneeling in cover, shouldered rifles, hot barrels.
- [ ] **Map (D):** Black Pine Forest and the sawmill clearing, the radio mast, hamlet, orchard,
      cemetery, wrecks, power line; the fuel depot goes up in a chain when hit.
- [ ] **Air defense (E):** AA guns (sandbag rings) open up phase by phase; HULL drops, kill them
      with the 40/105; MISSILE LAUNCH · FLARES (X) with a beep; a lost engine below 30 %; two AA
      guns near a strike target abort it. Is it fair? (`CONFIG.airDefense`)
- [ ] **Mission (F):** something to shoot on every walk; the twists play out (Kestrel abort → the
      forest push to LZ SAWMILL; LZ overrun; hold the line); side events (clinic assault, mortar,
      downed pilot, commander's car, civilian bus — don't hit it, wounded operator, fog, 105 jam,
      MANPADS ambush). Length 14–20 min?
- [ ] **Radio (F):** more varied lines, no repeats until a pool is used up, landmark callouts
      ("north of the barn"), crew banter in quiet moments.

### 3.0a M8+ Phases A + B play test (passed 2026-11-09; strikes made louder)

- [x] **Strike aiming:** press `T`, hold the left button to call the strike and keep holding:
      the guns stay silent; release and press again: they fire. Clicking a strike that is still
      rearming does nothing.
- [x] **Title:** green CLICK TO BEGIN, SETTINGS lower down.
- [x] **Briefing:** the map is as tall as the text and shows fields, houses and tree lines.
- [x] **Engine:** silent on the title and briefing; fades in after DEPLOY (~3 s); a steady
      four-engine drone with a propeller throb that drifts a little in pitch and pans as the
      aircraft circles; muffled while paused or on the end screens. Settings → ENGINE changes it.
      Too loud, too quiet, too buzzy? (Tunables: `CONFIG.engineSound`.)
- [x] If all good: **M8 is signed off** too.

### 3.0a M8 new-player test (played 2026-11-08; feedback → M8+, §6): "a new player can start, understand the controls and finish without outside help"

Run `npm run dev`. Ideally clear the saved settings first (DevTools → Application → Local Storage →
delete `night-orbit.settings.v1`) and play as if you had never seen the game.

- [ ] **Title:** NIGHT ORBIT, click anywhere to begin; SETTINGS opens settings and BACK returns.
- [ ] **Briefing:** the map sketch (route OP → LZ, zones, roads, stream, clinic cross) and the
      situation / rules text read clearly; DEPLOY starts the mission with the mouse captured.
- [ ] **Help:** `H` shows the controls over the feed and hides them again.
- [ ] **Arrows:** zoom in (25 mm) and look away from Ridgeback: an arrow on the screen edge points
      to them with the distance; Kestrel 6 gets one too while it is flying.
- [ ] **Pause (Esc):** RESUME, RESTART MISSION, SETTINGS and the controls list; nothing from the
      HUD's middle (reticle, subtitles) covers the menu. Right after Esc, Chrome may refuse the
      mouse for ~1 s: RESUME then says to click again (it no longer drops you into drag mode).
- [ ] **Settings:** sensitivity, invert Y, volume, screen shake and subtitles act at once and are
      still set after a page reload.
- [ ] **Restart:** RESTART / RETRY / PLAY AGAIN start a clean run right away (OP, calibration,
      full health, no enemies, stats at zero) without reloading the page.
- [ ] **Fail screen:** the reason, then kills, accuracy, damage taken, danger close and time.
- [ ] **Complete screen:** grade letter, label and score, plus the same stats. Does the grade
      feel fair for how the run went? (Tunables: `CONFIG.rating`.)

### 3.1 M7 play test (passed 2026-11-08): "the mission plays start-to-finish with no soft-locks, through both win and every fail path"

Run `npm run dev`, click to begin, and play the whole mission (about 12–15 min; Claude's perfect
bot took 14.5). Use `?phase=…`, `N` and `]` (×4) to revisit a part quickly.

- [x] **Calibration:** the FCO asks you to slew, then press 1, 2, 3 and F; each prompt completes
      when you do it (or moves on by itself after ~20 s).
- [x] **Fields:** a group in the north tree line, then the farmhouse and barn; a flank up the
      south hedgerow close to Ridgeback (25 mm lesson); Ridgeback crosses the bridge.
- [x] **Village:** the clinic briefing and a blinking outline on the clinic (~6 s); groups in the
      west streets; enemies next to the clinic; Ridgeback pinned in the square with waves from
      north and east; a technical on the east road; then the east edge.
- [x] **Vehicles:** the orbit shifts to the crossroads; a convoy (2 trucks, technical, APC) on the
      north road; a second APC on the east road; then Ridgeback walks to the LZ.
- [x] **Extraction:** `KESTREL 6  03:00` counts down; waves from all three approaches and two
      technicals on the quarry track; Kestrel 6 (a very hot helicopter) flies in at 0:30, lands,
      Ridgeback walks over and boards, it lifts off → MISSION COMPLETE with kills, time, health.
- [x] **Fail paths:** a round on the clinic → `YOU FIRED ON THE PROTECTED CLINIC`; a round
      next to it → FCO "Check fire!"; friendly fire and overrun still fail as before; a round
      next to the landed Kestrel 6 → `FRIENDLY FIRE: YOU HIT KESTREL 6`; leaving the LZ to the
      enemy → tracers climb at the helicopter, `KESTREL 6 … UNDER FIRE`, Kestrel's calls for
      help, then `KESTREL 6 WAS SHOT DOWN` (Claude checked: an undefended LZ loses it).
- [x] **Radio:** subtitles `[FCO] …` low in the view; reactive calls on kills ("Splash", "whole
      group's gone"), danger close, misses, hovering on the clinic, Ridgeback under fire; never a
      flood, never the same line twice in a row.
- [x] **Pacing:** does each phase feel the right length, and is anything too hard or too empty?
- [x] **Play-test fixes (2026-11-06), to re-check:**
  - **Vehicles:** destroy the lead convoy truck. The vehicles behind should swerve around the wreck and still reach Ridgeback.
  - **Pressure:** many more soldiers on foot, and about half of the riflemen push in to 30–70 m of Ridgeback. Is it still fair?
  - **Village:** about 3× bigger (143 houses, two new outer lanes). Do the streets still read, and does the frame rate hold?

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
- [ ] **Village:** 143 houses (decision 59) and a workshop on seven streets and two outer lanes (main road, north street, back
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

1. **M9 listen test by the user** (§3.0): M9 is code-complete and committed (2026-11-09, not
   pushed). Tune levels from the feedback (all in `src/audio/sounds.ts` and `CONFIG.mix`),
   then sign off M9.
2. Then **M10** (polish, balance, performance, deploy). Carry over from M8+: the air-defense
   numbers in `CONFIG.airDefense` and the twist mix were only played once; tune them in M10
   play sessions.
3. M8+ A–F are committed locally (2026-11-09), not pushed; the user pushes manually.
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
25. **Retry reloads the page** (`location.reload()`). _Superseded in M8: a real restart, decision 60._
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
    every ~0.7 s. Knobs in `CONFIG.spawning (was testScene)`. M7's scripted spawns should keep these rules.
49. **The village grew to 43 houses + a workshop** (user feedback) with a back street, a west
    lane and an east street, and the village zone/flat grew to match (radius 200 / 190 m). Three
    new approach paths (west lane, north-east, south lane) and extra spawn sites in every zone.
50. **The mission is data with ordered steps** (M7): a phase's steps run in order (step k is
    only checked after k−1 fired), which is how the §8 beat sheet reads; conditions and actions
    are plain tagged objects (`script.ts` builders), so `missionDef.test.ts` checks every site,
    route and vehicle path against the map. Added `timeInStep`, `timerBelow`, `helicopter(stage)`,
    `zoneWaves`, `routZone`, `boardHelicopter` and `markClinic` to §7.14's vocabulary.
51. **Safety valves everywhere** (M7): every step that waits on the world has a timeout; "zone
    clear" steps rout the zone's last enemies (and drop queued ones) when it runs out; walk steps
    time out at 2× the route's walking time + 30 s (`walkTimeout`). Zone counts include soldiers
    still trickling in, so a wave is never "clear" before it appears.
52. **The test scene is gone** (M7): `units/TestScene.ts` → `units/spawning.ts`, `CONFIG.testScene`
    → `CONFIG.spawning`. The script asks for groups at named sites (`queueAt`: an enemy path id,
    or `zone:index` for a spawn point) with the same trickle; background waves only run when the
    script turns them on for a zone (the extraction). Ridgeback walks one way (`Squad.walk`).
53. **Clinic rule** (M7): an impact whose full-damage radius (min 1.5 m) reaches the clinic or its
    generator fails the mission (`clinic_hit`); one whose blast reaches within 15 m is a near
    miss (FCO "Check fire!"). Same rule for guns and air strikes. The marker outlines the clinic,
    the biggest protected box (bug found in Chrome: it outlined the generator).
54. **Radio** (M7): story lines never go stale; warnings wait up to 10 s (longer than the longest
    briefing line, bug found by a test: a near-miss warning was lost behind the clinic briefing);
    chatter 2.5 s. A new phase drops the old phase's unplayed lines (bug found in Chrome: calibration
    prompts still played in the village). Story lines and warnings cut off chatter on air.
55. **Kestrel 6** (M7) is a real friendly target, with 400 HP and its own armor row (`ARMOR.helicopter`).
    - **Your fire:** the gunship's blasts hurt it by 3D distance, so ground impacts can't touch it while
      it flies high. One 105 mm next to it destroys it and fails the mission
      (`helicopter_friendly_fire`). Near misses raise danger close.
    - **Enemy fire:** while it is low (under 25 m: landing, on the pad, climbing out), soldiers in
      range and in sight shoot it. Those closer to it than to the team switch to it, plus every
      other one of the rest. Their damage is dps × accuracy × `CONFIG.enemyFire.vsAircraft`
      (18; at 12 an undefended LZ still let it escape with 19%, Chrome).
    - **Losing it:** being shot down fails the mission (`helicopter_lost`).
    - **HUD and radio:** the HUD shows `KESTREL 6 ▮▮▮… %  UNDER FIRE`, and Kestrel calls for help
      (heloUnderFire, heloHurt).
    - **Cheats:** god mode (`G`) covers it.
    - **Landing and boarding:** it lands at [582, 296] on the quarry floor. Ridgeback walks beside it,
      and `units.boarded` takes the team off the ground (no targeting, no strobes). It leaves the
      way it came.
    - **Technicals:** a new map vehicle path, `lz_technical`, brings technicals up the quarry track.
56. **Mission complete screen is minimal until M8**: kills, time and Ridgeback's health; click =
    reload (as for the fail screen). _Superseded in M8: stats + rating screens (decision 62) and a
    real restart (decision 60); subtitles hide behind every menu._
57. **Vehicles swerve around wrecks** (M7 play test: "destroyed vehicles can block the roads").
    - A vehicle with a wreck or a stopped vehicle in its lane picks the side away from it. It slides up to `swerveMax` 7 m off the centerline at 2.5 m/s, and drives at most 6 m/s while alongside. Once past, it returns to the road.
    - It still queues behind moving vehicles.
    - With no room to pass (two wrecks side by side), it stops and unloads as before.
    - The swerve can graze a roadside house or prop; accepted.
58. **Assaulters** (M7 play test: "a lot more enemies on foot can approach Ridgeback").
    - `enemyFire.assaultChance` 0.45 of riflemen get a standoff of 0.15–0.35 × range, which is 30–70 m.
    - Their cover must be within (standoff + 0.1) × range of the team, so they bound in instead of stopping in far cover.
    - Machine gunners never assault.
    - Scripted waves are about 1.6× bigger, with extra groups at more sites. The crossroads gets 4 foot groups; LZ background waves come every 18 s, then every 9 s (were 24 s, then 12 s).
59. **The village has 143 houses** (M7 play test: "make the village a lot bigger").
    - 100 more houses (`OUTER_VILLAGE` in `MapData.ts`) were placed by a one-off script along every village street and two new lanes, `north_row` and `south_row`. `south_lane` was extended to meet `south_row`.
    - Placement rules: 14 m between houses, off the roads, and clear of routes, approach paths and spawn points. The square stays open.
    - The village flat is now radius 215 with a 30 m falloff (was 190 + 80), so it stops short of the stream. The zone radius is now 240 (was 200).
    - Memory was never the limit. The CPU cost was `Collision`'s loop over every box on each line-of-sight and wall check, so boxes are now filed in a 32 m grid. Tests check the grid gives the same answers as the full loop.
    - Chrome: 60 FPS, GPU 3.3–3.6 ms, 36–38 draw calls.
60. **Restart rebuilds the run, not the page** (M8). `Game` keeps the static world (terrain,
    houses, collision, cover), renderer, screens and input for the whole page; `newRun()` makes a
    new `createBattle()` (bus, units, vehicles, spawner, mission, stats) plus new guns, shells, air
    support and sensor FX, clears the effects, frees every cover reservation and resets the orbit
    and sensor. A test checks a restarted run plays exactly like a first run on a fresh world.
61. **Screens are a pure state machine** (M8, `ui/screenFlow.ts`). Aiming starts play: DEPLOY,
    RESUME and RETRY request pointer lock and `lockGained` moves to `playing`. A restart lands on
    `paused` so a refused lock still leaves a RESUME button. A refused lock after it worked once
    (Chrome's cooldown after Esc) shows a hint instead of switching to drag mode for good. While a
    menu is up, the HUD keeps its edges but hides the reticle, alerts, subtitles and arrows.
62. **Rating** (M8, `CONFIG.rating`): 100 − damage taken × 0.15 (max 40) − 4 per danger close
    (max 20) − 2 per minute over 15 min (max 10) ± accuracy vs a 30 % par × 50 (max ±15).
    Accuracy counts gun impacts that hurt at least one enemy (the `impact` event now carries
    `enemiesHit`); air strikes don't count. Grades S ≥ 95, A ≥ 85, B ≥ 70, C ≥ 55, else D.
    Untuned: high accuracy can cancel a lot of damage taken (Claude's Chrome check: 60 damage,
    1 danger close, 80 % accuracy → S 100).
63. **Trigger ownership** (M8+ Phase A, `gunship/triggerGate.ts`): while a strike is aimed the
    left button belongs to the strike; after a call (or if aiming ends with the button down) the
    guns stay locked until it is released. A click on a rearming strike does nothing.
64. **Briefing sketch fills its frame** (M8+ Phase A): the frame stretches to the text column's
    height and `fitViewBox` widens the view to the frame's shape (never cropping a zone or the
    route), with field, building, tree-line and wall outlines drawn in the extra space.
65. **Settings** (M8) live in localStorage under `night-orbit.settings.v1`; every read and write
    is wrapped, so private windows or blocked storage just use defaults (and the settings screen
    says they won't be kept). Sensitivity multiplies `CONFIG.sensor.sensitivity`.
66. **Engine drone** (M8+ Phase B, `CONFIG.engineSound`): four detuned saws (54 Hz) through a
    420 Hz low-pass, a faint gearbox whine and band-passed airflow noise, all throbbing at 17 Hz
    (blade pass), then a muffle filter, its own ENGINE volume and a stereo panner. Pitch drifts
    ±1.2 % (twice per orbit plus a slow wander) and pan swings ±0.18 with the orbit. Off on the
    title / briefing, full while playing, muffled (40 %, 160 Hz) behind menus.
67. **Air strikes are loud** (M8+ A + B play test): gun-run and bomb impacts are the loudest
    sounds after the 105 mm, and `impactVolume` keeps strikes at ≥ 0.8 however far from the
    crosshair they land (guns still fade to 0.25). A `DynamicsCompressor` limiter (−6 dB, 12:1)
    on the master bus stops a bomb on top of a gun run from clipping. Round 5: the
    real cause of "the bomb cuts off" was the noise buffer (1 s, not looped): every long sound lost
    its noise after 0.5–1 s. It loops now. The bomb is a bigger 105 mm blast, brighter at the start
    so it carries on small speakers, audible ~4 s; the gun run is about half its loudest; a quiet
    0.5 s falling air sweep (`WHISTLE`, `whistleSeconds`) is cued by
    `AirSupport.update` once per bomb and played by `AudioEngine.playWhistle`.
68. **Calibration prompts check what the player really did** (M8+ fix). The sensor starts
    `calibrationLookAway` (~290 m) off Ridgeback; "found" is the crosshair within `locateRadius`
    (45 m) of the team (MissionHost sets `located`). Each prompt clears its flag when shown
    (`clearFlag`), and Game reports the selected gun every frame, so "select the 40 mm" completes
    while the 40 mm is selected. Player prompts have no timeout (decision 51's safety valve is
    for steps that wait on the world): they repeat their hint every 18 s (`Step.remind`).
69. **The bomb's look** (M8+ play test): impacts can override the shake reach (`shakeReach`) and
    duration (`shakeSeconds`, a decay time constant the sensor keeps until the shake dies down),
    and add a low dust ring (`dust`, `dustSpeed`) that rolls out along the ground. Only the bomb
    uses them: 0.8° shake felt within ~560 m, rumbling ~2.5 s, a wide hanging cloud, and an 18 m crater (craters fit the slope across their own size).
70. **Soldier figures** (M8+ Phase C): `soldierRig.ts` places 15–18 parts per soldier relative to
    the hips (pure, tested); `InfantryRenderer` draws one InstancedMesh per part type (11 draw
    calls) and composes each part with the root from `infantryPose`. The legs counter the root
    lean so feet stay under a leaning soldier. `crouchDrop` 0.45 → 0.75 so a crouched soldier
    kneels. `Infantry.sinceShot` (set when a soldier fires) drives recoil and a barrel that is
    hot for ~10 s. Ridgeback's strobes sit on the helmet.
71. **Black Pine Forest and the fuller map** (M8+ Phase D): `MapData.forests` (polygon, spacing,
    clearings) is filled by `forestTrees` (~2,100 pines, one instanced draw call); new zone
    `forest` (LZ SAWMILL clearing at [598, −385]); logging road, forest track and relay track;
    the radio relay (mast + compound), a farm hamlet, an orchard, a cemetery, burnt-out wrecks
    and a power line. `route_lz_sawmill` is a **branch**: not in `routeOrder` (the journey and
    the briefing stay OP → LZ QUARRY); validateMap accepts a route that starts where a journey
    route ends. Trees don't block line of sight or shells; instead enemy fire at Ridgeback under
    the trees is ×0.55 (`CONFIG.forest.concealment`, `UnitWorld.concealment`).
72. **Fuel depot** (M8+ Phase D): three `explosive` tanks at the crossroads. `Explosives` (per
    run, in `createBattle`) takes damage from every impact (`damageAt` to the tank wall; 250 HP:
    one 40 mm direct hit is not enough, two are; the 25 mm needs ~4); a tank then goes up after
    0.3 s as `TANK_BLAST` (id `bomb`, so kills are the player's), which is itself an impact and
    sets neighbors off, and burns for 90 s.
73. **Instanced pools count what they drop** (bug found in Phase D): `InstancedSignature.add`
    silently ignored instances past its capacity; the hip-roof pool held 80, so since M7 most
    village houses had no roof. Capacity 400, `dropped` is counted, and a test asserts the map
    drops nothing and every house has a roof.
74. **Enemy air defense** (M8+ Phase E, `combat/AirDefense.ts`, `CONFIG.airDefense`): five AA
    emplacements (`MapData.aaSites`), dormant until the mission's `activateAA`; they are blast
    targets (`ARMOR.aaGun`) even while dormant. A gun fires only while within 470 m of the orbit
    center (the area the sensor can reach), with a hit chance that rises with tracking time and
    falls with slant range; each hit costs 3 hull. AA trucks (`aaa`, `antiAir`) count as shooters.
    MANPADS soldiers (`INFANTRY.manpads`, `launcher`) kneel and aim 2 s, then launch (missile 300
    m/s, 30 hull); X drops flares (6), which decoy every missile at least 0.8 s out. The hull never
    repairs: below 30 an engine is lost (orbit ×0.8, more jitter, one engine silent), at 0 the
    mission fails (`gunship_lost`). Strikes: 2+ shooters within 650 m of the target abort it (back
    on cooldown); 1 shooter gives a 40 % chance the jet is hit (a radio call). Jets and AA guns
    are drawn by `render/AirRenderer.ts` (7 draw calls).
75. **Random twists** (M8+ Phase F, `mission/twists.ts`): each run's seed rolls one extraction
    twist (Kestrel abort 45 %, LZ overrun 35 %, hold the line 20 %) and 2–4 side events (each its
    own chance; fog ↔ jam and HVT ↔ bus never together). `buildMission(roll)` builds the script
    from it; the default roll for headless tests is "hold the line", no side events. A sawmill
    twist adds a `forest` phase (`route_lz_sawmill`, LZ SAWMILL pad [586, −364]); after a Kestrel
    abort the forest AA must die (`aaDown:aa_forest` flag) before Kestrel returns. RESTART/RETRY
    replay the seed, PLAY AGAIN rolls a new one; dev `?seed=` and `?twist=`.
76. **Twist mechanics** (M8+ Phase F, `CONFIG.twists`): mortar crews (`INFANTRY.mortar`, rounds
    walk in from 60 m to 8 m, `enemyShell` → visuals + team damage); a wounded operator (team ×0.75
    speed, ×1.3 damage); a 105 mm jam (`WeaponState.jam`); fog (`uHaze`, `fogEnvelope`); a downed
    pilot (hold 70 s with no enemy within 20 m for 3 s → bonus); the commander's SUV (`hvt_escape`;
    bonus if destroyed); the civilian bus (`bus_route`, side `civilian`: any hit fails
    `civilian_hit`). Bonuses add 5 rating points each.
77. **Pacing and radio** (M8+ Phase F): background patrols (every 26 s) on every walking leg,
    switched off on arrival so "zone clear" steps still fire; Ridgeback walks 20 % faster
    (2.65 m/s). Auto-play (an instant-kill bot) covers all twists in 3 runs: no quiet stretch over
    70 s, 15–20 min. Chatter uses a shuffle bag (no repeats until a pool is used up), pools are ~3×
    longer, background groups get landmark callouts (`landmarks.ts`), and the crew banters after
    30 s of calm radio silence; callouts and banter are low-priority chatter.
78. **Audio design (M9).** The mixer is `master → { sfx, radio, ambience }` (`mix.ts`, trims in
    `CONFIG.mix`); the old ENGINE slider became the ambience bus and two sliders were added
    (EFFECTS, RADIO). Saves from before M9 load with the new defaults. What plays for which event
    lives in one pure table (`soundMap.ts EVENT_SOUNDS`); Game only adds sounds that are not
    events (AA bursts, the bomb whistle, the missile beep, menu clicks). Impacts play when the
    shell lands (the flight time is the delay), not after an extra speed-of-sound delay: that
    would make "when shells land" harder to hear. The radio is text only, so its sound is the
    key: outside-net speakers (Ridgeback, Kestrel, the strike pilot) get squelch and static,
    the crew (FCO, NAV) an intercom click. Levels were set by rendering every sound offline in
    Chrome (`OfflineAudioContext`) and comparing peaks: band-passed sounds need about 3× the
    gain of low-passed ones (a 25 mm hit used to peak at 0.002 and was inaudible).

---

## 6. Manual test results / notes

_(Fill in after testing.)_

| Date       | Item                                           | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-03 | M1 manual checklist                            | User reported everything works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | None; M1 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-03 | M2 look (Claude, Chrome)                       | Thermal feed OK; HUD hard to read in black-hot; soil patches too strong                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Added dark HUD outline; softened soil patches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-03 | M2 aiming (user)                               | "Looking around feels a bit laggy"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | GPU was ~23 ms/frame; capped pixel ratio 1.5, MSAA off → ~7.5 ms; GPU ms added to F1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-03 | NV look (Claude, Chrome)                       | Trees/walls rendered darker than the ground (sideways surfaces got too little sky light)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Flattened sky term, rebalanced moon/sky and albedos; regression test added                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-03 | M2 look test (user)                            | "It looks well for now"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None; M2 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-03 | NV look test (user)                            | Approved ("mark it signed off")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | None; NV signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-03 | M3 tracers (Claude)                            | First meters of each tracer drew as huge white blobs near the camera                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Skip < 150 m from sensor, cap 7 px; regression test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-03 | M3 smoke (Claude)                              | 105 mm smoke too faint to read after the flash                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Warmer, more opaque plume                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-03 | M3 lead test (scripted)                        | 25 mm 1.2 s bursts on walking soldiers: led 2/2 killed, unled 1/3 killed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Leading matters as intended; 105 mm led on a truck destroyed it (burning)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-04 | M3 feel test (user)                            | "M3 seems to be working well"; signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Not yet tried: sound, pause with shells in flight, roof hits, 2–3 min stress (GPU, crater cap), Firefox/Safari                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-04 | M4 scripted (Claude, Chrome)                   | No player fire: enemies reach 60 alive, team 96 → 0 by ~70 s, `RIDGEBACK OVERRUN` screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Works; difficulty to judge in the feel test (`CONFIG.enemyFire`, `unitDefs.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-04 | M4 fail/warn (Claude, Chrome)                  | 105 mm 28 m from the team → DANGER CLOSE, nobody hurt; 40 mm on a member → `FRIENDLY FIRE` fail screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Works as designed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-04 | M4 look (Claude, Chrome)                       | Team readable at 25 mm; strobes blink in WHT/BLK, bright in NV; NV tracers visible; 60 FPS, GPU 7.7–8.1 ms, 23–28 calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | None                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-05 | M4 feel test (user)                            | "M4 feels good"; strobes in thermal and the difficulty accepted as they are                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | None; M4 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-05 | M5 cover (Claude, Chrome)                      | No enemy ever took cover: hills blocked the view from every corner to the team                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Added corner-to-corner bounding (decision 29); then up to 18 soldiers at once held or ran to cover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 2026-11-05 | M5 convoy (Claude, Chrome)                     | Convoy drove the west road, truck unloaded and parked, technical/APC fired heavy tracers; 105 mm on a truck → burning wreck, others queued                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Works; 60 FPS, GPU ~7.9 ms, ≤ 35 draw calls, no console errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-05 | M5 scripted (Claude, Chrome)                   | No player fire: convoys + waves overran the team at ~75 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Difficulty for the user's feel test; waves slowed 8 → 10 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-05 | M5 feel test (user)                            | "M5 feel test seems good"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | None; M5 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-05 | M5+ gun run (Claude, Chrome)                   | 0 kills on a group of 9: first hits panicked them out of the strip; then ~30 % killed in the strip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Panic radius 15 → 6 m, 30 × 120 → 40 × 200 damage: ~65 % (11 of 17) killed over 6 runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2026-11-05 | M5+ bomb + HUD (Claude, Chrome)                | Bomb killed a truck outright; flash, shockwave, whiteout, jet streak; strip/circle previews, INBOUND and REARM lines OK                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Controls-table row was too long (squashed the key column): shortened. 60 FPS, GPU ~8 ms, no console errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-05 | M5+ feel test (user)                           | "Feel test is good"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | None; M5+ signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-05 | M6 look (Claude, Chrome)                       | Village, roads, clinic generator, fields and stream read well; the quarry was invisible (rock ≈ soil heat)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Rock 0.14 → 0.27 and a warm gravel quarry floor: walls and floor now stand out                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-05 | M6 bridge (Claude, Chrome)                     | 3 of 4 Ridgeback members waded through the stream bed beside the 6 m bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Stream kept shallow around bridges, deck 6 → 8 m: nobody dips below the banks; regression test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-05 | M6 play (Claude, Chrome)                       | 58 of 64 enemies spawned on approach paths, 26 heading for cover, a convoy queued into the village; 60 FPS, 30–34 calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Works; no console errors. GPU 7–8 ms (~10 ms with the F2 overlay)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-11-05 | M6 look test (user)                            | "Enemies can be spawn killed (same point)", "village can be populated with more roads, houses", "enemies do not use the bridge"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Anti-camping spawner, 43-house village on 5 streets, bridge detours (decisions 47–49); look test to repeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-05 | M6 fixes (Claude, headless)                    | Chrome extension was not connected, so checked headless: a 3-min real-map scene run, every enemy stream crossing on the bridge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Regression test `mapScene.test.ts` (fails without the detour: an enemy waded 185 m from the bridge). Not yet seen in a browser                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-11-05 | M6 fixes (Claude, Chrome)                      | F3 tour of all 5 zones in WHT/BLK/NV at all zooms reads right; spawn camping: crosshair held on a spawn site, later groups 239–520 m away; 14 live enemy stream crossings, all ≤ 3.4 m from the bridge center (Ridgeback 1.6 m); bomb lands on its point; 60 FPS, GPU 7.6–8.2 ms (11.3 ms with F2), 30–38 calls; no console errors                                                                                                                                                                                                                                                                                                                                                                                                                     | Fixes confirmed in the browser; M6 look test (user) still to repeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-05 | M6 look test (user)                            | "Look test seems nice"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | None; M6 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-11-05 | M7 auto-play (Claude, headless)                | Cheat-kill bot (reach 900 m) plays calibration → fields (4 s) → village (200 s) → vehicles (409 s) → extraction (668 s) → complete at 868 s (14.5 min); no step needed its timeout; Ridgeback never hurt. A 60 m-reach bot also finishes (safety valves)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | First runs timed out the vehicles phase: walk timeouts now scale with the route (`walkTimeout`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-05 | M7 Kestrel 6 as a target (Claude, Chrome)      | 4+ soldiers fire on it while it lands; HUD `KESTREL 6 69% UNDER FIRE`, tracers, Kestrel's calls. At `vsAircraft` 12 an undefended LZ (51 enemies) still let it escape with 19%; at 18 it is shot down → `KESTREL 6 WAS SHOT DOWN`, burning wreck. 60 FPS, GPU 7.6–7.8 ms                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | `vsAircraft` 12 → 18; the perfect-bot auto-play still completes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-05 | M7 (Claude, Chrome)                            | Calibration prompts advance on real key presses; village clinic briefing + marker; 105 mm on the clinic → `YOU FIRED ON THE PROTECTED CLINIC`; extraction at ×4: countdown, Kestrel 6 lands, team boards, lift-off, MISSION COMPLETE screen; 60 FPS, GPU 7.3–8.1 ms, 28–29 calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Fixed: marker on the generator, stale calibration lines in the village, sensor not following a phase skip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-06 | M7 play test (user)                            | "Destroyed vehicles can block the roads so vehicles behind never get close to Ridgeback", "a lot more enemies on foot can approach Ridgeback, mission feels easy", "make the village a lot bigger"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Swerving vehicles, assaulters + bigger waves, 143-house village with a collision grid (decisions 57–59); play test to repeat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-09 | M8+ Phase F (Claude, Chrome)                   | `?twist=mortar`: a two-man crew sets up when Ridgeback reaches the farmhouse, rounds walk in, the NAV call says to find the tube flash; landmark callouts ("Heat signatures north-east of the barn"); fog: the feed washes to flat gray; Kestrel abort: Kestrel breaks off, the forest phase starts ("Get Ridgeback to LZ SAWMILL"), the forest AA goes active; complete screen with BONUS and EVENTS · SEED; PLAY AGAIN rolls a new seed, RESTART keeps it; the downed pilot's strobe east of the crossroads. No console errors                                                                                                                                                                                                                       | Tuned: the ridge AA took the hull to 55 % in ~70 s and two MANPADS + the village gun downed the gunship in 40 s without flares; AA hit chance ~halved (≈15 % hull a minute per ignored gun) and missiles 30 → 22 damage, reload 25 → 35 s                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2026-11-09 | M8+ Phase E (Claude, Chrome)                   | Fields phase: the ridge AA gun opens up as Ridgeback moves (tracer streams climbing at the camera; hull 94% after ~10 s); at 25 mm the sandbag ring and gun read clearly; one 105 mm shell destroyed it ("Triple-A destroyed"), and it burns. A MANPADS soldier: MISSILE LAUNCH · FLARES (X) alert, beep, a smoke trail climbing at the camera; X → a white-hot flare cloud and the missile decoyed (hull 100%, 5 flares left); ignored, repeated launches took the hull to 40% and ENGINE OUT. Attack-jet model seen up close (straight wings, twin hot engines). Bomb under two AA guns → "Strike aborted", back on cooldown. Hull to 0 → "LANTERN 2-1 SHOT DOWN". Vehicles phase with the AA truck: 60 FPS, GPU 7.4 ms, 57 calls; no console errors | Fixed: AA kills were called "Vehicle destroyed" (now "Triple-A destroyed")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-11-09 | M8+ Phase D (Claude, Chrome)                   | Briefing shows Black Pine Forest. F3 to the forest: a dense pine stand with the logging road and forest track meeting in the open sawmill clearing; 60 FPS, GPU 8.4 ms, 51 calls, 260K tris. One 105 mm shell on a depot tank: all three tanks went up in a chain (3 fireballs), then burned under the smoke. Radio relay mast and compound on the hill. Village at 105 mm: 60 FPS, GPU 7.9 ms, 50 calls                                                                                                                                                                                                                                                                                                                                               | Found and fixed: the hip-roof pool held 80 roofs, so since M7's 143-house village most houses had no roof (pools now count drops; a test asserts none). Briefing label "LZ SAWMILL" → "BLACK PINE" (no spoiler)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-11-09 | M8+ Phase C (Claude, Chrome)                   | Soldiers are jointed figures: walking militia read as people at 25 mm (~20 px tall); a close-up (FOV narrowed in the console) shows walking strides, Ridgeback's helmets, NVGs, plate carriers and shouldered rifles, kneeling militia firing from cover with a hot barrel. 72 enemies + Ridgeback: 60 FPS, GPU ~8 ms, 48 draw calls (soldiers 11)                                                                                                                                                                                                                                                                                                                                                                                                     | The kneeling pose is the roughest from above (the forward thigh can read as an arm); for the C + D play test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-09 | Bomb crater (user)                             | "We can also make the crater it left bigger"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Bomb crater radius 9 → 18 m. Craters now take the slope across their own size and sit on the higher of the center and the average rim height (+1 % of the radius), so a big disc never sinks into a slope or a dip (test on a 15 % slope and a bowl). Chrome: a ~36 m warm scorch on the field, still visible 20 s later                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-11-09 | Bomb sound + look (user)                       | "Everything seems good, we can just lower the bomb sound just a little bit … and also we can make the impact shake and fog bigger for the bomb"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Bomb ~2 dB quieter (noise 1 → 0.82, thump 1 → 0.85). Shake 0.45° → 0.8°, felt within ~560 m of the crosshair (was 240 m) and rumbling ~2.5 s (a per-ordnance shake time, `shakeSeconds` 0.75). Smoke 18 → 40 puffs, 36 → 60 m, plus a new low dust ring (64 puffs, 30 m/s, rolling out ~60–80 m and hanging 12–20 s). Chrome: shake 0.69° → 0.21° at 1 s → 0.03° at 2.5 s; the cloud about twice as wide; 60 FPS, GPU 7.4 ms                                                                                                                                                                                                                                                                                                                                         |
| 2026-11-09 | Strike sounds round 5 (user)                   | "Let's make the whistle 0.5s, a short sweep, and gun run feels louder than the bomb so we need to make the bomb louder, and bomb sounds duration still feels too short"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Root cause found:** every sound's noise layer used a 1 s noise buffer that was not looped (and started up to 0.5 s in), so any longer sound lost its noise after 0.5–1 s, leaving only sub-bass; the bomb's energy was also mostly below 150 Hz, which small speakers barely play. Fixed: the noise loops (regression test with a fake AudioContext); the bomb is a bigger 105 mm blast, brighter at the start (noise 1.0 from 1,200 → 180 Hz, thump 60 → 19 Hz, 12 s envelope); whistle 0.5 s. Chrome (energy ≥ 150 Hz): bomb peak −32 dB vs gun run −42 dB and total +7 dB over it; audible 3.9 s after impact (was 0.6 s), fading ~7 dB/s; whistle starts 0.49 s before impact                                                                                  |
| 2026-11-09 | Strike sounds round 4 + calibration bug (user) | "Whistle can be quieter and faster, I didn't like the bomb sound at all. I like how 105mm blast sounds … similar … longer duration and louder." Bug: "at the start … it does not check whether player really located the ridgeback or chose the said weapon but captions still goes on"                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Bomb = the 105 mm blast recipe, louder (noise 0.6, thump 1.0) and 3.6 s (was a rolling rumble); whistle 0.7 s, peak level about half. Calibration causes: "find Ridgeback" completed after 400 px of any mouse movement (and the sensor started on them); an early key press counted; every prompt moved on after 20–25 s. Now: the sensor starts ~290 m off Ridgeback and "found" = crosshair within 45 m of them; each prompt clears its flag when shown; a weapon prompt completes while that gun is selected; no timeouts, the FCO repeats the hint every 18 s. Chrome: early 2 and 800 px of mouse away didn't advance; crosshair on Ridgeback did; then 1, 2, 3, F one prompt each. Bomb RMS 0.19 → silent at ~2.5 s vs 105 mm 0.05 → ~1 s; whistle peak 0.007 |
| 2026-11-09 | Strike sounds, round 3 (user)                  | "Gun run sounds good, but bombs sound cuts off immediately instead of lowering and whistle sounds funny and not realistic, it should sound fast and sweep … around 1-1.2 seconds"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Cause of the cut-off: the bomb's tail slid to 11 Hz (thump) / 28 Hz (noise), below what speakers play. Now it ends at 32 Hz / 220 Hz with a slower decay (τ 2.8 s, 8 s). Whistle: 1.1 s, mostly band-passed air (Q 3.5) with a faint tone, no wobble, sweeping 2,600 → 650 Hz. Chrome (energy above 60 Hz): bomb −22 dB → −38 at 3 s → −47 at 4 s → −58 at 5 s (was −45 at 3 s); whistle heard 1.1 s before impact sweeping 2,595 → 668 Hz                                                                                                                                                                                                                                                                                                                           |
| 2026-11-09 | Strike sounds, round 2 (user)                  | "Make gun run a little quieter, and bomb should sound longer, also can we add a dropping whistle on bomb like real life?"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Gun-run hit noise 0.4 → 0.3, thump 0.28 → 0.2 (40-crack run peaks ~0.043 RMS, was 0.089 at its loudest). Bomb rumble rolls on: 7 s with a slow decay (τ 1.5 s; still 1/10 of its peak at 4 s, was ~gone at 3 s). New falling whistle: starts 3.2 s before the bomb lands, slides ~1,650 → 420 Hz with an air-rush layer and gets louder until the blast cuts it. Chrome: whistle heard from 3 s before impact, 1,378 → 495 Hz, RMS 0.006 → 0.035, then the boom (0.2)                                                                                                                                                                                                                                                                                                |
| 2026-11-09 | M8+ A + B play test (user)                     | "Play test seems good, only thing to fix is can we make gun run and bomb louder?"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Gun-run hit noise 0.05 → 0.55, thump 0.03 → 0.4 (longer), then back to 0.4 / 0.28 after "a little quieter" (~30 % lower); bomb noise 0.4 → 0.75, thump 0.7 → 1.0, 3.2 s; strikes never quieter than 0.8 however far from the crosshair; a limiter on the master bus. Chrome (pre-limiter RMS): 40-crack gun run 0.028 → 0.089 (peaks 0.32, like a 105 mm impact), bomb 0.26 vs 105 mm impact 0.15, bomb on a gun run peaks 0.59 (no clipping). M8 signed off                                                                                                                                                                                                                                                                                                         |
| 2026-11-09 | M8+ Phase B (Claude, Chrome)                   | Measured on the master bus: briefing RMS 0 (engine off); after DEPLOY 0.003 → 0.009 → 0.023 at 0.3 / 1.5 / 3.5 s; paused 0.0047 (muffled); resumed 0.023. For scale: a 25 mm burst peaks ~0.025, a 105 mm shot ~0.2. No console errors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Phase B done; user play test of A + B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-09 | M8+ Phase A (Claude, Chrome)                   | Gun run aimed with the 25 mm selected, called with a click held 1 s: 1 strike, 0 shots; a fresh press after release fires the 25 mm; a click while the strike rearms (53 s): 0 shots, 0 strikes, still aiming. Title: green CLICK TO BEGIN, SETTINGS lower. Briefing: the map frame is as tall as the text and filled (fields, houses, tree lines, walls). No console errors                                                                                                                                                                                                                                                                                                                                                                           | Phase A done; play test after Phase B                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 2026-11-08 | M8 play test (user)                            | Ten requests: engine sound; A-10/F-16-style strike jets; guns fire while aiming a strike (bug); mission feels empty (too much waiting, too few enemies and vehicles, no plot twist); enemy AA that can shoot the gunship and jets; map feels empty (e.g. a forest); green CLICK TO BEGIN and SETTINGS lower; briefing map and text don't match in height; more varied radio lines; soldiers look like tubes                                                                                                                                                                                                                                                                                                                                            | Planned as milestone M8+ (PLAN.md §10), approved 2026-11-09: AA can shoot the gunship down, MANPADS + flares, seeded random twists; radio commands go to the backlog                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-11-08 | M8 (Claude, Chrome)                            | Title → briefing (map + text) → DEPLOY → playing; H help overlay; 25 mm looking away shows `RIDGEBACK 381 M ▶` on the right edge; Esc → pause menu; settings apply at once and survive a reload; RESTART → phase 0, clock 0, 100%, 105 mm; fail (clinic) and complete screens with stats and grade; retry zeroes the stats. 60 FPS, GPU 8.6 ms; no console errors                                                                                                                                                                                                                                                                                                                                                                                      | Fixed: title wrapped onto two lines; reticle and alerts showed through the menus                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-11-08 | M7 play test (user)                            | "Play test passed" (after the swerve, assaulter and bigger-village fixes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | M7 signed off                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-11-06 | M7 fixes (Claude, Chrome)                      | Convoy at ×4, lead truck destroyed at s≈508: the truck, technical and APC behind swerved past (lateral up to 3 m) and stopped 51–59 m from Ridgeback. Village phase with no player fire: team 100 → 48% in 2 min. Bigger village: 60 FPS, GPU 3.3–3.6 ms, 36–38 calls                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Works; auto-play bot still completes with no timeouts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

---

| 2026-11-09 | M8+ C–F play test (user) | One full run played; it went well | None; M8+ signed off. AA/missile numbers and twist mix to be revisited in M10 play sessions |
| 2026-11-09 | M9 audio check (Claude, Chrome) | Every sound rendered offline and measured: 25 mm shot peaked at 0.025 and its hit at 0.007 (too quiet), squelch and clicks also faint. In game: firing, landing, the 105 mm breech and ready beep, the select beep, flares, intercom clicks, outside-net squelch and static all played; pause and settings muted the static and resume restored it; the RADIO slider set the radio bus to 0 and saved | Raised the band-passed sounds about 3× (`fix(audio)` commit); listening is left to the user (§3.0) |

## 7. How to resume in a new session

Start Claude Code in this folder and say something like:

> "Read STATUS.md and PLAN.md. Let's continue (M9 listen test feedback, then M10)."

`CLAUDE.md` already tells Claude to read these files and follow the testing rules.
