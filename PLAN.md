# NIGHT ORBIT — Implementation Plan

> A browser-based 3D gunship-overwatch game built with Three.js.
> The player is the sensor operator/gunner aboard a circling gunship, protecting a
> ground team through one handcrafted night mission:
> **Fields → Village → Vehicles → Extraction.**
>
> This is an **original game**: its mechanics are inspired by the classic gunship
> mission, but its setting, characters, callsigns, dialogue, map and art are our own.

---

## Table of Contents

1. [Design Summary](#1-design-summary)
2. [Original Setting & Characters](#2-original-setting--characters)
3. [Tech Stack & Rationale](#3-tech-stack--rationale)
4. [World Scale & Core Numbers](#4-world-scale--core-numbers)
5. [Project Structure](#5-project-structure)
6. [Architecture Overview](#6-architecture-overview)
7. [System-by-System Design](#7-system-by-system-design)
   - 7.1 Game Loop & State
   - 7.2 Input & Controls
   - 7.3 Gunship Orbit
   - 7.4 Sensor Camera (Aiming)
   - 7.5 Thermal Rendering
   - 7.6 Weapons & Ballistics
   - 7.7 Damage & Explosions
   - 7.8 Units: Infantry
   - 7.9 Units: Friendlies
   - 7.10 Units: Vehicles
   - 7.11 AI & Navigation
   - 7.12 World / Map Building
   - 7.13 Effects & Particles
   - 7.14 Mission Scripting
   - 7.15 Dialogue / Radio Chatter
   - 7.16 HUD & UI Screens
   - 7.17 Audio
   - 7.18 Debug Tools
   - 7.19 Air Support (added during development)
8. [The Mission, Beat by Beat](#8-the-mission-beat-by-beat)
9. [Balance Tables](#9-balance-tables)
10. [Milestones & Acceptance Criteria](#10-milestones--acceptance-criteria)
11. [Performance Budget](#11-performance-budget)
12. [Testing Strategy](#12-testing-strategy)
13. [Risks & Mitigations](#13-risks--mitigations)
14. [Future: Endless Survival Mode](#14-future-endless-survival-mode)

---

## 1. Design Summary

| Aspect          | Decision                                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Genre           | Single-player gunship overwatch / shooting gallery with escort pressure                                                      |
| Perspective     | Gunship sensor camera looking down from a circling aircraft                                                                  |
| Platform        | Desktop browsers (Chrome, Firefox, Safari, Edge); mouse + keyboard                                                           |
| Visual style    | Monochrome thermal (FLIR) feed: grain, bloom, scanlines, HUD overlay                                                         |
| Session length  | One mission, ~12–15 minutes                                                                                                  |
| Core loop       | Spot heat signatures → pick the right weapon → lead the target → fire → confirm kill → keep the ground team alive and moving |
| Core tension    | Enemies get close to the friendlies, so big weapons become dangerous to use                                                  |
| Lose conditions | (1) You kill a friendly. (2) You hit the protected clinic. (3) The ground team is overrun (team health reaches 0).           |
| Win condition   | The ground team boards the extraction helicopter                                                                             |

### Design pillars

1. **Distance and delay.** Shells take time to land. Every shot is a prediction.
2. **The right tool.** Three weapons with clearly different jobs: precision, area, devastation.
3. **Restraint.** Friendlies, the protected clinic and blast radius force you to think before firing.
4. **The feed.** The thermal look and dry radio chatter carry the atmosphere.

---

## 2. Original Setting & Characters

All names are placeholders we can change at any time.

- **Setting:** The fictional **Varesh Valley**, a mountain border region in late autumn, at night. Cold ground makes warm bodies stand out clearly in thermal.
- **Gunship:** callsign **LANTERN 2-1**.
  - **Player:** the sensor operator / gunner (never named, never seen).
  - **FCO (Fire Control Officer):** clears you to fire, calls out threats, warns about danger-close shots.
  - **Pilot:** announces orbit shifts, gives dry commentary.
  - **Navigator:** gives positions and times ("Helo is six minutes out").
- **Ground team:** **RIDGEBACK**, a four-person recon team (Ridgeback 1–4). Their observation post was compromised, and they must cross the valley on foot to an extraction landing zone (LZ).
- **Enemy:** an unnamed militia: infantry, technicals (armed pickup trucks), cargo trucks and two armored personnel carriers (APCs).
- **Protected structure:** a **field clinic** in the village sheltering civilians. Firing on it fails the mission.
- **Extraction:** helicopter callsign **KESTREL 6**.

---

## 3. Tech Stack & Rationale

| Tool                  | Version (pin exact) | Why                                                                                     |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| **Vite**              | 8.3.4               | Instant dev server and hot reload; simple static build for deployment anywhere          |
| **TypeScript**        | 6.0.3               | The project has many interacting systems; types catch mistakes early                    |
| **Three.js**          | 0.186.1             | Mature WebGL engine with built-in post-processing (`EffectComposer`, `UnrealBloomPass`) |
| **simplex-noise**     | 4.0.3               | Terrain height and ground-heat variation                                                |
| **Vitest**            | 5.0.4               | Unit tests for pure logic (ballistics, damage, mission triggers)                        |
| **ESLint + Prettier** | 10.12.0 / 3.9.10    | Consistent code                                                                         |

**Deliberately NOT used:**

- **No physics engine.** We only need ray-vs-terrain/buildings and radius checks. A custom approach is simpler and faster.
- **No external 3D models.** All geometry is procedural and low-poly. In thermal view, silhouettes and heat matter far more than detail, and it avoids asset licensing entirely.
- **No audio files at first.** All sounds are synthesized with the Web Audio API. Recorded voice-over can come later.
- **No UI framework.** The HUD is plain HTML/CSS over the canvas. React would add weight for little gain.

---

## 4. World Scale & Core Numbers

- **1 world unit = 1 meter.** Y is up.
- **Map size:** 1,600 m × 1,600 m, centered on the origin.
- **Gunship orbit:** radius **900 m**, altitude **700 m**, period **120 s** per full circle (counter-clockwise, left-hand orbit like real gunships). Slant range to target is about 1,140 m.
- **Orbit center** is not fixed. Each mission phase sets a focus point, and the orbit center glides toward it (about 15 m/s) so the action always stays in view.

### Field of view per weapon (and what that means on screen)

| Weapon | Vertical FOV | Ground area visible (approx.) | 1.8 m soldier at 1080p |
| ------ | ------------ | ----------------------------- | ---------------------- |
| 25 mm  | 5°           | ~100 m wide                   | ~19 px tall            |
| 40 mm  | 12°          | ~240 m wide                   | ~8 px                  |
| 105 mm | 28°          | ~570 m wide                   | ~3–4 px (a bright dot) |

> **Readability note:** units are rendered at **1.3× real size** and get extra bloom
> so they remain visible in the 105 mm view. This is a standard game-feel cheat.

---

## 5. Project Structure

```
night-orbit/
├── PLAN.md                     ← this document
├── index.html                  ← canvas + HUD root elements
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   └── fonts/                  ← monospace HUD font (optional, self-hosted)
└── src/
    ├── main.ts                 ← entry: create Game, start loop
    ├── config.ts               ← all tunable numbers (one place for balancing)
    │
    ├── core/
    │   ├── Game.ts             ← owns every system, runs update/render order
    │   ├── GameState.ts        ← enum: Title, Briefing, Playing, Paused, Failed, Complete
    │   ├── Loop.ts             ← fixed-timestep update + variable render
    │   ├── Input.ts            ← pointer lock, mouse delta, key states, bindings
    │   ├── EventBus.ts         ← typed pub/sub (e.g. 'unitKilled', 'friendlyHit')
    │   ├── Pool.ts             ← generic object pool
    │   └── rng.ts              ← seeded random (repeatable map/AI behavior)
    │
    ├── render/
    │   ├── Renderer.ts         ← WebGLRenderer, resize handling, composer setup
    │   ├── ThermalMaterial.ts  ← custom ShaderMaterial driven by a "heat" value
    │   ├── ThermalPass.ts      ← post pass: polarity, contrast, grain, scanlines, vignette
    │   └── SensorFX.ts         ← zoom-change static, focus blur, image jitter
    │
    ├── world/
    │   ├── MapData.ts          ← HANDCRAFTED layout: buildings, roads, paths, spawns, zones
    │   ├── WorldBuilder.ts     ← turns MapData into meshes
    │   ├── Terrain.ts          ← heightmap mesh + heightAt(x, z)
    │   ├── Buildings.ts        ← procedural houses, barns, clinic, walls (+ rubble state)
    │   ├── Vegetation.ts       ← instanced trees, hedges, crops
    │   ├── Roads.ts            ← road ribbons from polylines
    │   └── Collision.ts        ← raycasts against terrain + building boxes
    │
    ├── gunship/
    │   ├── Gunship.ts          ← orbit motion, orbit-center glide
    │   ├── Sensor.ts           ← the camera: ground-stabilized aim point, zoom, slew
    │   ├── Weapons.ts          ← weapon state machine: ready / firing / reloading
    │   ├── weaponDefs.ts       ← stats for 25/40/105
    │   └── Projectiles.ts      ← in-flight shells (pooled), tracers, impact timing
    │
    ├── combat/
    │   ├── Damage.ts           ← radius damage with falloff; friendly-fire checks
    │   └── Explosions.ts       ← spawns FX + damage + craters for each impact
    │
    ├── units/
    │   ├── UnitManager.ts      ← owns all units; spatial grid for fast radius queries
    │   ├── Infantry.ts         ← data + state machine for one soldier
    │   ├── InfantryRenderer.ts ← ONE InstancedMesh draws every soldier
    │   ├── Friendly.ts         ← Ridgeback team members, IR strobes
    │   ├── Vehicle.ts          ← trucks/technicals/APCs: path following, HP, turret
    │   ├── VehicleRenderer.ts
    │   └── Helicopter.ts       ← extraction helo (scripted flight)
    │
    ├── ai/
    │   ├── Paths.ts            ← polyline paths and waypoint graph helpers
    │   ├── Steering.ts         ← seek, arrive, separation
    │   ├── CoverPoints.ts      ← cover positions per zone, reservation system
    │   └── EnemyBrain.ts       ← decision logic: advance, take cover, fire, flee
    │
    ├── fx/
    │   ├── Particles.ts        ← pooled GPU points: sparks, debris, smoke
    │   ├── Effects.ts          ← flash sprites, shockwave rings, fires, tracers
    │   └── Heat.ts             ← heat decay helpers (bodies cool, craters cool)
    │
    ├── mission/
    │   ├── Mission.ts          ← runs a MissionDef: phases, steps, objectives
    │   ├── missionDef.ts       ← THE handcrafted mission script (data)
    │   ├── conditions.ts       ← reusable conditions: zoneClear, timeElapsed, reached...
    │   ├── actions.ts          ← reusable actions: spawnWave, say, moveTeam, setObjective...
    │   └── Stats.ts            ← kills, shots, hits, accuracy, time, friendly damage
    │
    ├── dialogue/
    │   ├── Radio.ts            ← queue of subtitle lines with priority and cooldowns
    │   └── lines.ts            ← all chatter text, grouped by situation
    │
    ├── audio/
    │   ├── AudioEngine.ts      ← AudioContext, master/music/sfx buses
    │   └── synth.ts            ← procedural sounds: engine drone, guns, impacts, squelch
    │
    ├── ui/
    │   ├── HUD.ts              ← telemetry, reticles, ammo, reload, team status, objective
    │   ├── reticles.ts         ← SVG reticle shapes per weapon
    │   ├── Screens.ts          ← title, briefing, pause, settings, fail, complete
    │   └── hud.css
    │
    └── debug/
        ├── DebugOverlay.ts     ← F1: show paths/zones/cover/spawns; FPS; unit counts
        └── Placer.ts           ← click the ground to log coordinates (for map authoring)
```

**Rule of thumb:** `config.ts`, `weaponDefs.ts`, `MapData.ts`, `missionDef.ts` and `lines.ts`
are **data**. Balancing, map changes and new dialogue should rarely touch system code.

---

## 6. Architecture Overview

### Ownership

`Game` creates and owns every system and passes references explicitly (no global singletons
except the `EventBus`). This keeps dependencies visible and makes systems testable.

### Update order (every fixed tick, 60 Hz)

```
1.  Input.poll()
2.  Gunship.update(dt)          → aircraft position
3.  Sensor.update(dt)           → aim point, camera transform, zoom
4.  Weapons.update(dt)          → handle trigger, reloads, spawn projectiles
5.  Projectiles.update(dt)      → advance shells; on arrival → Explosions.detonate()
6.  Mission.update(dt)          → evaluate conditions, run actions (spawns, dialogue, moves)
7.  UnitManager.update(dt)      → AI decisions, steering, enemy fire, deaths, heat decay
8.  Vehicles.update(dt)
9.  Effects/Particles.update(dt)
10. Radio.update(dt), Audio.update(dt)
11. HUD.update()                → DOM writes batched once per frame
```

Then `Renderer.render()` runs once per animation frame.

### Communication

Systems talk through the typed **EventBus** for "something happened" messages:

```ts
type GameEvents = {
  shotFired: { weapon: WeaponId };
  impact: { pos: Vector3; weapon: WeaponId };
  unitKilled: { unit: Unit; by: WeaponId | 'ai' };
  friendlyKilledByPlayer: { unit: Friendly };
  protectedHit: { building: Building };
  dangerClose: { distance: number };
  phaseChanged: { phaseId: string };
  missionFailed: { reason: FailReason };
  missionComplete: {};
};
```

Examples: `Stats`, `Radio` and `Audio` subscribe to `unitKilled` independently.
Nobody needs to know who is listening.

### Fixed timestep

```ts
const STEP = 1 / 60;
let acc = 0;
function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25); // clamp to avoid spiral after tab switch
  last = now;
  while (acc >= STEP) {
    game.update(STEP);
    acc -= STEP;
  }
  game.render();
  requestAnimationFrame(frame);
}
```

A fixed step makes ballistics and AI behave identically on 60 Hz and 144 Hz screens.

---

## 7. System-by-System Design

### 7.1 Game Loop & State

States: `Title → Briefing → Playing ⇄ Paused → Failed | Complete`.

- `Playing` runs all updates. `Paused` freezes updates but keeps rendering (the HUD shows "PAUSED").
- `Failed` and `Complete` freeze the simulation, show a fullscreen screen with the reason or stats, and offer **Retry** (full mission restart; checkpoints are a stretch goal).
- Losing pointer lock (Esc) automatically pauses.

### 7.2 Input & Controls

| Action                       | Default binding                       |
| ---------------------------- | ------------------------------------- |
| Slew sensor (aim)            | Mouse movement (pointer lock)         |
| Fire                         | Left mouse (hold for 25 mm auto-fire) |
| Select 25 / 40 / 105         | `1` / `2` / `3`                       |
| Cycle weapon                 | Mouse wheel or `Q`                    |
| Toggle white-hot / black-hot | `F`                                   |
| Pause / settings             | `Esc`                                 |
| Help overlay                 | `H`                                   |
| Debug overlay (dev builds)   | `F1`                                  |

- Mouse sensitivity **scales with zoom**: slew speed is proportional to the current FOV, so a narrow zoom gives finer control automatically.
- Settings: sensitivity, invert Y, master/SFX/radio volume, subtitle size, reduce screen shake.

### 7.3 Gunship Orbit

```ts
// Gunship.ts
angle += ((2 * Math.PI) / ORBIT_PERIOD) * dt;
center.lerp(targetCenter, 1 - Math.exp(-dt / 4)); // smooth glide to phase focus
position.set(
  center.x + Math.cos(angle) * ORBIT_RADIUS,
  ORBIT_ALTITUDE + Math.sin(time * 0.3) * 4, // gentle altitude bob
  center.z + Math.sin(angle) * ORBIT_RADIUS,
);
```

- `targetCenter` is set by mission actions (`setOrbitFocus('village')`).
- Small turbulence noise (±0.05°) is applied to the **camera** later, not the orbit, for a hand-held sensor feel.

### 7.4 Sensor Camera (Aiming)

This is the most important feel system. Real gunship sensors are **ground-stabilized**: the
camera stays locked on a ground point while the aircraft moves. We do the same.

**State:** `aimPoint: Vector3` (on the ground), `weapon` (which sets the FOV).

**Each tick:**

1. Convert mouse delta to movement **in screen space** (so "mouse right" always moves the view right, whatever the orbit angle):
   ```ts
   const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
   const up = new Vector3().crossVectors(new Vector3(0, 1, 0), right).negate(); // forward on ground
   const metersPerPixel = (2 * slantRange * Math.tan(fovRad / 2)) / viewportHeight;
   aimPoint.addScaledVector(right, dx * metersPerPixel * sensitivity);
   aimPoint.addScaledVector(up, -dy * metersPerPixel * sensitivity);
   ```
2. Clamp `aimPoint` to within **450 m** of the orbit center (the "sensor gimbal limit").
3. Snap `aimPoint.y = terrain.heightAt(aimPoint.x, aimPoint.z)`.
4. `camera.position.copy(gunship.position)` and `camera.lookAt(aimPoint)`, then apply tiny jitter.
5. FOV smoothly animates to the weapon's FOV over 0.25 s, with a sensor-static flash during the change.

**Firing target:** a ray from the camera through the **screen center**, tested against
buildings and terrain (`Collision.raycast`), gives the exact impact point. Roofs block shots;
you can't hit soldiers inside buildings, only on rooftops or in the open. This rewards
waiting for enemies to come out.

### 7.5 Thermal Rendering

**Principle:** nothing in the scene has a "color". Every object has a **heat** value from 0
(cold) to 1 (hot). The shader turns heat into brightness; a post pass makes it look like a sensor.

#### Heat values

| Object                | Heat                  | Notes                                            |
| --------------------- | --------------------- | ------------------------------------------------ |
| Ground (cold soil)    | 0.08–0.18             | Varied with noise; plowed fields slightly warmer |
| Roads (asphalt)       | 0.25                  | Holds daytime heat                               |
| Trees / hedges        | 0.12                  | Cool, slightly noisy                             |
| Building walls        | 0.22                  | Windows 0.45 (lit, warm interiors)               |
| Building roofs        | 0.18                  | Chimneys 0.7                                     |
| Water (stream)        | 0.02                  | Darkest thing in the scene                       |
| Living soldier        | 0.95                  | Strongest bloom                                  |
| Dead soldier          | 0.95 → 0.35 over 60 s | Bodies visibly cool down                         |
| Vehicle body          | 0.40                  | Engine block 1.0, exhaust 0.9                    |
| Destroyed vehicle     | 1.0 burning           | Fire flickers 0.85–1.0 for 40 s                  |
| Fresh crater          | 0.8 → 0.2 over 30 s   | Shows where you've fired                         |
| Muzzle flash / tracer | 1.0                   | Short-lived                                      |

#### ThermalMaterial (one shared shader, per-object heat)

```glsl
// fragment (simplified)
uniform float uHeat;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vNormal;
varying vec3 vWorldPos;

void main() {
  float n = texture2D(uNoise, vWorldPos.xz * 0.05).r;   // surface variation
  float facing = 0.85 + 0.15 * clamp(vNormal.y, 0.0, 1.0); // tops slightly brighter
  float h = uHeat * facing + (n - 0.5) * 0.06;
  gl_FragColor = vec4(vec3(h), 1.0);
}
```

- **Instanced** meshes (soldiers, trees) take heat from a per-instance attribute (`instanceHeat`) instead of a uniform, so every soldier can cool independently.
- Terrain uses a heat texture painted from `MapData` (fields, roads, stream) plus noise.

#### ThermalPass (post-processing, applied in order)

1. **Bloom** (`UnrealBloomPass`, threshold ~0.7) so hot targets glow.
2. **Polarity:** `white-hot: c = h` / `black-hot: c = 1 - h`.
3. **Contrast/gamma curve** (adjustable; per-weapon slightly different for flavor).
4. **Sensor noise:** animated grain, stronger at narrow zoom.
5. **Scanlines** plus a faint rolling interlace band.
6. **Vignette** and a slight barrel distortion.
7. **Tint:** pure grayscale by default. (Night vision became its own sensor mode instead of a tint; see §10 M2+.)

`SensorFX` adds a 150 ms static burst and refocus blur on weapon switch, and a brief whiteout bloom when a 105 mm shell lands in the narrow view.

### 7.6 Weapons & Ballistics

#### Weapon state machine

```
READY ──(trigger)──► FIRING ──(clip empty)──► RELOADING ──(timer)──► READY
   ▲                   │
   └──(cooldown done)──┘
```

- 25 mm: hold to fire; uses a **barrel heat** bar instead of a clip. Overheating forces a 3 s cooldown.
- 40 mm: 5-round clip; rate-of-fire gate between shots.
- 105 mm: single shot, long reload. The HUD shows a clear "LOADING" countdown.

#### Ballistics: "aimed point + flight time"

We don't simulate full trajectories. On fire:

1. Raycast from the screen center → `impactPoint`.
2. `flightTime = distance(gunship, impactPoint) / weapon.shellSpeed` (≈1.2–2.0 s).
3. Push a projectile `{ from, to, t: 0, duration: flightTime }` into the pool.
4. Each tick, interpolate a **tracer** visual along the line (25 mm and 40 mm only; 105 mm is invisible until impact, like the real thing).
5. When `t >= duration` → `Explosions.detonate(impactPoint, weapon)`.

The impact point is fixed at fire time, so **moving targets must be led**. Add a small random
spread (25 mm: 1.5 m, 40 mm: 2.5 m, 105 mm: 4 m) so precision against single targets near
friendlies is risky.

### 7.7 Damage & Explosions

`Damage.applyRadial(center, weapon)`:

```ts
for (const unit of unitManager.queryRadius(center, weapon.blastRadius)) {
  const d = unit.position.distanceTo(center);
  const falloff = 1 - smoothstep(weapon.innerRadius, weapon.blastRadius, d);
  unit.takeDamage(weapon.damage * falloff, weapon.id, center);
}
```

- **Infantry** have 100 HP. **Vehicles** have armor: damage is multiplied by `weapon.vsArmor` (25 mm does very little to APCs).
- **Friendly fire:** if any friendly takes player damage ≥ their HP → `missionFailed('friendly_fire')`. Any friendly inside `blastRadius × 1.5` without being hurt triggers a `dangerClose` event (FCO warning line).
- **Protected clinic:** if `impactPoint` is inside the clinic's bounding box, or within its blast radius → `missionFailed('protected_structure')`. Before that, the FCO warns when the reticle hovers over it with the 105 mm selected.
- **Buildings:** a 105 mm hit on an ordinary house swaps it to a rubble mesh and kills enemies on its roof (stretch: kills enemies "inside" via a per-building occupant list).
- **Death reaction:** soldiers in the blast get flung away from the center with spin (simple ballistic arc, ~0.6 s), then lie flat. No ragdoll physics.

`Explosions.detonate()` also spawns: a flash sprite, debris particles, a smoke column, a shockwave ring, a crater decal, camera shake (scaled by weapon and distance to the aim point), and the sound.

### 7.8 Units: Infantry

Data per soldier (plain object, kept in an array, drawn by one `InstancedMesh`):

```ts
interface Infantry {
  id: number;
  team: 'enemy' | 'friendly';
  pos: Vector3;
  vel: Vector3;
  heading: number;
  hp: number;
  state: InfantryState;
  heat: number;
  path?: Path;
  pathIndex: number;
  cover?: CoverPoint;
  target?: Unit;
  fireCooldown: number;
  stateTimer: number;
}
type InfantryState = 'idle' | 'moving' | 'inCover' | 'firing' | 'fleeing' | 'flung' | 'dead';
```

- **Mesh:** a low-poly figure (capsule torso + sphere head + box legs). Two poses (standing, prone/dead) via separate instanced meshes, or a scale/rotation trick for "lying flat".
- **Animation:** a simple procedural walk bob (vertical sine + slight lean) is enough at this distance.
- **Enemy fire:** enemies don't trace real bullets. Each firing enemy deals `dps × accuracy × dt` to the Ridgeback team's shared health, and shows muzzle flashes and short hot tracers toward the friendlies (purely visual). This creates readable "these guys are hurting my team" feedback.

### 7.9 Units: Friendlies (Ridgeback)

- Four soldiers moving as a **squad** along scripted route segments (`moveTeam('route_fields_1')`).
- Each has an **IR strobe**: a small sprite that blinks at 2 Hz (members slightly out of step). It is at full brightness in night vision (where real IR strobes show) and kept **faintly visible in both thermal polarities** (`CONFIG.ridgeback.strobeThermalHeat`, 0 = NV-only), because soldiers of both sides look alike in thermal and strobes are the player's main safety cue.
- **Team health** (0–100) is shared and shown in the HUD (`RIDGEBACK ▮▮▮▮▮▮▮▮▯▯  82%  UNDER FIRE`). It drops from enemy fire and recovers +1/s once no enemy has fired for 4 s (the §9 rule; the earlier "within 80 m" idea was dropped). Reaching 0 fails the mission (overrun).
- Individual friendlies can't die from enemy fire (keeps the mission fair and the script simple). They **can** die from player fire → instant fail.
- When stopped, they take formation positions behind cover points and visually fire at the nearest enemies, killing them slowly (they help, but you're the main force).

### 7.10 Units: Vehicles

| Type                     | HP  | Armor (25/40/105 multiplier) | Behavior                                                             |
| ------------------------ | --- | ---------------------------- | -------------------------------------------------------------------- |
| Cargo truck              | 300 | 0.5 / 1.0 / 1.0              | Drives a road path, stops, unloads 6–8 infantry, drives off or parks |
| Technical (pickup + gun) | 200 | 0.6 / 1.0 / 1.0              | Drives to a firing spot, mounted gun damages the team heavily        |
| APC                      | 900 | 0.05 / 0.4 / 1.0             | Slow, turret fires at the team; **needs the 105 mm**                 |

- Path following: constant speed along a road polyline, with slowdown at corners (based on the angle between segments) and smooth heading interpolation.
- Visual: box-composite meshes. Engine block and exhaust are hot, wheels warm, body medium.
- **Damage states:** `intact → smoking (below 50% HP) → destroyed (burning, wreck mesh, infantry inside die or bail out burning-hot)`.
- Destroyed vehicles on the road **block it**; later vehicles stop behind them and unload early (emergent and fun).

### 7.11 AI & Navigation

Keep it simple and authored; no navmesh needed.

- **Paths:** hand-placed polylines in `MapData` (spawn → approach → cover area).
- **Cover points:** hand-placed positions per zone, each with a "facing" direction. A reservation system makes sure one soldier per point.
- **Steering:** `seek/arrive` toward the next waypoint plus `separation` from nearby soldiers (via the spatial grid) so groups don't stack.
- **EnemyBrain** (runs every 0.25 s per enemy, staggered for performance):
  ```
  if hp low or squad mostly dead nearby → 30% chance: flee along spawn path
  else if no cover and cover available in zone → move to cover
  else if friendlies within weapon range (≤ 250 m) and line of sight → fire
  else → advance along assigned path toward friendlies
  ```
- **Morale (light touch):** a big 105 mm hit near an enemy group makes survivors break and run for 3–5 s. Fleeing enemies are bright moving targets, which feels good to hit. Losses nearby (3 within 25 m) or being wounded trigger the 30 % flee roll once; a broken soldier runs back toward where it came from for 8–12 s, then rallies (STATUS.md §5 decision 31).
- **Spatial grid:** 20 m cells, rebuilt each tick, used for blast queries, separation and nearest-target lookups.

### 7.12 World / Map Building

The map is **handcrafted in data** (`MapData.ts`) and built procedurally:

```ts
export const MAP: MapData = {
  terrain: { size: 1600, seed: 1337, hills: [...] },
  roads: [ { id: 'main_road', width: 7, points: [[-780,-200],[ -300,-150 ], ...] } ],
  stream: { points: [...], width: 6 },
  fields: [ { polygon: [...], kind: 'plowed' }, ... ],
  treeLines: [ { points: [...], density: 0.6 } ],
  buildings: [
    { id: 'farm_house', kind: 'house', pos: [-520, -310], rot: 0.3, size: [10, 8], floors: 1 },
    { id: 'clinic', kind: 'clinic', pos: [40, 60], rot: 0, size: [18, 12], protected: true },
    ...
  ],
  zones: { fields: { center: [-450,-250], radius: 220 }, village: {...}, crossroads: {...}, lz: {...} },
  friendlyRoutes: { route_fields_1: [...], route_village_1: [...], ... },
  enemyPaths: { fields_treeline_a: [...], ... },
  coverPoints: { fields: [...], village: [...], crossroads: [...], lz: [...] },
  spawnPoints: { ... },
};
```

**Layout (west → east, the team's journey):**

```
 WEST                                                                  EAST
 [OP / start] ─► [FIELDS: hedgerows, farmhouse, barn, tree line]
                        │
                        ▼  (dirt track, small bridge over stream)
                 [VILLAGE: ~25 houses, narrow streets, square, CLINIC (protected)]
                        │
                        ▼  (main road)
                 [CROSSROADS: gas station, walls; convoy arrives from NORTH road]
                        │
                        ▼
                 [QUARRY LZ: open ground, rock walls, approaches from 3 sides]
```

- **Terrain:** gentle simplex hills, flattened under the village, roads and the LZ (`flattenAt()` while generating).
- **Buildings:** generator builds walls (box), pitched roof (extruded triangle), window quads (warm), chimney. Variations via seeded random: size, roof pitch, number of windows. All merged per building for few draw calls.
- **Vegetation:** instanced trees (cone + cylinder) placed along `treeLines` with jitter; hedges as long thin boxes; crops as a noise pattern in the terrain heat texture (zero geometry cost).

### 7.13 Effects & Particles

All pooled, all heat-based (bright = hot):

- **Flash:** additive billboard, scales up in 0.1 s and fades in 0.3 s.
- **Debris:** 20–80 hot points with gravity, cooling as they fly.
- **Smoke:** warm, slowly rising and expanding sprites that cool and fade over 8–15 s. Wind drift is constant per mission.
- **Shockwave:** expanding ring decal on the ground (105 mm only).
- **Fire:** flickering hot sprites on wrecks and burning buildings.
- **Craters:** ground decals with fading heat (cap at 60; oldest recycled).
- **Tracers:** thin hot line segments (25/40 mm player fire; enemy small-arms tracers toward friendlies).

### 7.14 Mission Scripting

The mission is **data**: an ordered list of phases. Each phase has steps, and each step is
`(condition) → actions`. The `Mission` runner checks conditions every tick.

```ts
// missionDef.ts (illustrative excerpt)
export const MISSION: MissionDef = {
  id: 'varesh_valley',
  phases: [
    {
      id: 'fields',
      objective: 'Cover Ridgeback across the fields',
      onEnter: [
        setOrbitFocus('fields'),
        say('FCO', 'Ridgeback is moving. You are cleared to engage anything without a strobe.'),
        spawnWave('fields_treeline_a', { count: 6 }),
      ],
      steps: [
        { when: timeInPhase(8), do: [moveTeam('route_fields_1')] },
        {
          when: teamReached('fields_wp2'),
          do: [spawnWave('farmhouse', { count: 8 }), say('NAV', 'Movement at the farmhouse.')],
        },
        {
          when: zoneEnemiesBelow('fields', 2),
          do: [
            moveTeam('route_fields_2'),
            say('FCO', 'Area looks clear. Ridgeback, push to the bridge.'),
          ],
        },
        { when: teamReached('bridge'), do: [nextPhase()] },
      ],
    },
    { id: 'village' /* ... see section 8 ... */ },
    { id: 'vehicles' /* ... */ },
    { id: 'extraction' /* ... */ },
  ],
};
```

**Conditions (reusable):** `timeInPhase(s)`, `teamReached(waypointId)`, `zoneEnemiesBelow(zone, n)`,
`vehiclesDestroyed(tag)`, `allOf(...)`, `anyOf(...)`, `flag(name)`.

**Actions (reusable):** `say(speaker, text)`, `setObjective(text)`, `setOrbitFocus(zone)`,
`spawnWave(spawnId, opts)`, `spawnVehicle(type, pathId, opts)`, `moveTeam(routeId)`,
`teamHold()`, `startTimer(id, seconds)`, `spawnHelicopter(pathId)`, `setFlag(name)`,
`nextPhase()`, `completeMission()`.

**Safety valve:** every "wait for zone clear" step also has a timeout (e.g. 90 s), after which
the remaining enemies flee. A hidden enemy can then never soft-lock the mission.

### 7.15 Dialogue / Radio Chatter

- `Radio` keeps a **priority queue** of lines: scripted story lines (priority 3) > warnings (2) > reactive chatter (1).
- Lines appear as subtitles: `[FCO] Splash. Good hits.` with a squelch sound at start and end.
- **Reactive chatter** fires on events with **cooldowns** (one kill-confirm line at most every 4 s), choosing randomly from pools without immediate repeats.
- All text lives in `lines.ts`, written by us. Example pools:
  ```ts
  kill:        ['Target down.', 'Splash. Good effect.', 'That one\'s not getting up.', 'Confirmed. Next target.'],
  multiKill:   ['That broke them up.', 'Whole group\'s gone.', 'Good effect on target, multiple down.'],
  dangerClose: ['Watch it. That was close to Ridgeback.', 'Danger close. Check your aim.'],
  miss:        ['Off target. Adjust.', 'Rounds long.'],
  clinicHover: ['That\'s the clinic. Do not engage it.'],
  vehicle:     ['Vehicle moving on the north road.', 'Truck stopping, they\'re dismounting.'],
  ```
- Later: optional recorded voice-over files keyed by line ID.

### 7.16 HUD & UI Screens

HTML/CSS overlay, monospace font, pure white/black to match the feed.

```
┌───────────────────────────────────────────────────────────────────────┐
│ LANTERN 2-1          ALT 0700   HDG 214   TGT RNG 1142        WHT HOT │
│                                                                       │
│ OBJ: COVER RIDGEBACK ACROSS THE FIELDS                                │
│                                                                       │
│                                 ┼                                     │
│                           ┌─         ─┐                               │
│                                 ·                ← per-weapon reticle │
│                           └─         ─┘                               │
│                                                                       │
│ RIDGEBACK ▮▮▮▮▮▮▮▮▯▯ 82%                                              │
│                                                                       │
│ [FCO] Movement at the farmhouse. Cleared hot.                         │
│ 25MM  40MM [105MM]   LOADING ▮▮▮▯▯   FOV 28.0                    00:04:12 │
└───────────────────────────────────────────────────────────────────────┘
```

- **Reticles** (SVG, scale with screen):
  - 25 mm: small crosshair with range ticks.
  - 40 mm: bracket box with center dot.
  - 105 mm: large brackets plus a **blast-radius circle** projected to screen size (helps judge danger-close).
- **Telemetry** (heading, altitude, range, sensor angles) uses real values from the simulation, making the feed look alive.
- **Friendly indicators:** when Ridgeback is off-screen, a small arrow on the screen edge points toward them.
- **Screens:** Title (game name, "Click to start" which requests pointer lock and starts audio), Briefing (map sketch + text), Pause (resume, settings, restart), Failed (reason + retry), Complete (stats + rating: kills, accuracy, friendly damage taken, danger-close count, time).

### 7.17 Audio

All synthesized with the Web Audio API (no files needed initially):

| Sound         | Recipe                                                                              |
| ------------- | ----------------------------------------------------------------------------------- |
| Engine drone  | Two detuned low sawtooth oscillators + low-pass filter + slow LFO; always on        |
| 25 mm         | Short noise bursts through a band-pass, rapid repeat                                |
| 40 mm         | Thump: sine pitch drop 120 → 40 Hz + noise click                                    |
| 105 mm        | Deep boom: sine 60 → 25 Hz with long decay + low-passed noise; a cabin rattle layer |
| Impacts       | Muffled distant boom, played when the shell lands (so you _hear_ the delay)         |
| Radio squelch | Short filtered white-noise burst + click                                            |
| UI            | Soft beeps for weapon switch, reload complete                                       |

Buses: `master → { sfx, radio, ambience }` with separate volume controls. The `AudioContext`
starts on the first click (browser autoplay rules).

### 7.18 Debug Tools

- **F1 overlay:** draws zones (circles), paths (lines), cover points, spawn points, friendly routes, plus FPS, draw calls, unit counts, and the current phase/step.
- **Placer:** in debug mode, click the ground to copy `[x, z]` to the clipboard, which makes authoring `MapData` fast.
- **Cheats (dev only):** `G` god mode for the team, `N` skip to next phase, `K` kill all enemies, time-scale ×0.25 / ×4.
- URL flags: `?phase=village` to start at a phase, `?debug=1`.

### 7.19 Air Support (added during development, milestone M5+)

Besides its own guns, the gunship crew can call in strikes from other aircraft on a point you mark
with the sensor. It's a timing-and-restraint tool, not a replacement for the guns: every strike
lands after a delay, and the same friendly-fire, danger-close and protected-clinic rules apply.
Aircraft are generic types with fictional callsigns (names are placeholders, like §2).

| Strike                          | Callsign (placeholder) | Delay after call | Footprint                                      | Good against                                  | Cooldown |
| ------------------------------- | ---------------------- | ---------------- | ---------------------------------------------- | --------------------------------------------- | -------- |
| **Gun run** (attack jet, 30 mm) | HAMMER 1-1             | ~7 s             | strip ~60 × 8 m along a chosen axis, ~2 s walk | infantry in the open, technicals, APCs (×0.6) | ~60 s    |
| **Bomb** (fast jet)             | SABRE 2-2              | ~18 s            | one blast, ~40 m radius, danger close ~100 m   | anything, including APCs                      | ~90 s    |

- **Unlimited use, cooldown only** (user decision, 2026-11-05): each strike can be called again as
  soon as its cooldown ends. If that makes the gunship's own guns feel redundant, the cooldowns
  (in `config.ts`) are the knob.
- **Controls:** `T` cycles air-support mode (GUN RUN → BOMB → off). In that mode the reticle
  shows the strike's footprint on the ground (gun-run strip, bomb radius) and the HUD shows
  readiness / cooldown; the wheel rotates the gun-run axis; left click calls the strike on the
  marked point (it locks to the ground point, not the screen). `T` ends the mode without calling.
  (Dev cheat `G` stays god mode, see §7.18.)
- **What you see:** a hot streak crossing the feed shortly before impact; for the gun run, a
  rapid line of small impacts walking along the strip; for the bomb, a 105 mm-style impact, but
  bigger. Sound arrives a little later (M9).
- **Rules:** damage goes through `Explosions.detonate` like the guns (a new weapon source per
  strike), so killing a friendly fails the mission, near misses raise danger close, and hitting
  the clinic (M6/M7) fails it too. Kills count as the player's. The FCO warns before confirming a
  strike whose footprint is within its danger-close distance of Ridgeback (radio lines in M7);
  until then the HUD shows `DANGER CLOSE` on the preview.
- **Code:** `gunship/airSupport.ts` (pure: strike definitions, cooldowns, footprint geometry,
  impact schedule along the strip) and an `AirSupport` system that schedules impacts into
  `Explosions`; strike stats live in data (`airSupportDefs.ts`).

---

## 8. The Mission, Beat by Beat

Target total duration: **12–15 minutes**. Enemy counts below are starting values for tuning.

### Phase 0 — Briefing & Calibration (~1 min)

- Briefing screen: Ridgeback's observation post was compromised; they must cross the Varesh Valley on foot to LZ QUARRY. LANTERN 2-1 provides overwatch.
- In-game: the orbit starts over the OP. The FCO walks through controls as **prompted steps**: slew the sensor, switch to each weapon, toggle polarity. Each prompt completes when the player does it.
- **Teaches:** controls, how to spot strobes.

### Phase 1 — Fields (~3 min)

- **Terrain:** open farmland, hedgerows, a tree line to the north, a farmhouse and barn.
- **Beats:**
  1. 6 enemies in the tree line, far from the team (safe practice with all weapons).
  2. The team advances; 8 enemies emerge from the farmhouse and barn. Medium range from the team.
  3. A small group flanks along a hedgerow, closer to friendlies. **First danger-close lesson:** use the 25 mm.
  4. The team reaches the bridge → phase ends.
- **Teaches:** leading targets, choosing weapons, danger close.

### Phase 2 — Village (~5 min, the centerpiece)

- **Terrain:** ~25 houses, a square, narrow streets, the **field clinic** (protected) on the square.
- **Beats:**
  1. FCO: _"Be advised, the building with the generator heat on the square is a clinic. Do not engage it under any circumstances."_ The clinic is marked on screen for 5 s.
  2. The team enters the west edge. Enemies on rooftops and in streets in groups of 3–5, appearing from doorways (spawn points at building doors).
  3. Enemies **near the clinic**: the player must use the 25 mm carefully or wait until they move away.
  4. The team gets pinned in the square (holds position). Waves come from the north and east streets (~20 enemies total in this sub-beat).
  5. A technical drives into the village (first vehicle, killable with 40 mm).
  6. The zone is cleared → the team moves to the east edge.
- **Teaches:** restraint, rooftop targets, pressure on the team.

### Phase 3 — Vehicles (~3 min)

- **Terrain:** a crossroads east of the village, gas station, walls; a long north road visible from above.
- **Beats:**
  1. NAV: _"Multiple vehicles on the north road, heading your way."_ The orbit shifts north.
  2. **Convoy:** 2 cargo trucks + 1 technical + 1 APC. **The 105 mm becomes essential.** Killing the lead vehicle blocks the road.
  3. Trucks that reach the crossroads unload 8 infantry each.
  4. A second APC arrives from the east road a little later, closer to the team (danger-close 105 mm decision).
  5. All vehicles destroyed and the zone near-clear → the team moves to the LZ.
- **Teaches:** armor, using the 105 mm, timing reloads.

### Phase 4 — Extraction (~3 min)

- **Terrain:** an open quarry with rock walls and three approach paths.
- **Beats:**
  1. The team takes positions at the LZ. NAV: _"Kestrel 6 is three minutes out."_ A **countdown timer** appears in the HUD (180 s).
  2. Escalating waves from all three approaches; 1–2 technicals; the final minute is the most intense.
  3. At 30 s left, Kestrel 6 appears (a very hot helicopter crossing the map). Enemies try to rush the LZ.
  4. The helicopter lands, the team boards (they walk to it), the helicopter lifts off.
  5. FCO: _"Ridgeback is wheels up. Nice work, Lantern. Heading home."_ → mission complete screen.

### Rating (complete screen)

- **Grades** from accuracy, team health remaining, danger-close count and time.
- Show: total kills, kills per weapon, shots fired, accuracy, vehicles destroyed, team damage taken, time.

---

## 9. Balance Tables

All values live in `config.ts` / `weaponDefs.ts` and **will** be tuned in playtesting.

### Weapons

| Stat                       | 25 mm                                     | 40 mm           | 105 mm  |
| -------------------------- | ----------------------------------------- | --------------- | ------- |
| FOV (vertical)             | 5°                                        | 12°             | 28°     |
| Fire mode                  | Auto (hold)                               | Semi            | Single  |
| Rate                       | 10 shots/s                                | 1 shot / 0.45 s | —       |
| Capacity                   | Heat bar (overheat after ~4 s continuous) | 5-round clip    | 1       |
| Reload / cooldown          | 3 s on overheat                           | 2.2 s           | 5.0 s   |
| Shell speed                | 900 m/s                                   | 750 m/s         | 600 m/s |
| Flight time @1,140 m       | ~1.3 s                                    | ~1.5 s          | ~1.9 s  |
| Spread                     | 1.5 m                                     | 2.5 m           | 4 m     |
| Damage                     | 70                                        | 200             | 1,500   |
| Inner radius (full damage) | 0.8 m                                     | 3 m             | 8 m     |
| Blast radius               | 2.5 m                                     | 8 m             | 22 m    |
| vs APC multiplier          | 0.05                                      | 0.4             | 1.0     |
| Danger-close warning       | 4 m                                       | 12 m            | 33 m    |

### Enemies

| Unit           | HP  | DPS vs team | Range | Notes                   |
| -------------- | --- | ----------- | ----- | ----------------------- |
| Rifleman       | 100 | 0.6         | 200 m | Most common             |
| Machine gunner | 100 | 1.5         | 250 m | 1 in 6; slower movement |
| Technical      | 200 | 3.0         | 300 m | Priority target         |
| APC            | 900 | 4.0         | 350 m | Needs 105 mm            |

Team health: 100, regenerating +1/s when no enemy has fired in the last 4 s.

---

## 10. Milestones & Acceptance Criteria

Each milestone ends with something **playable and testable**. Rough effort estimates assume
focused part-time work. Live progress (what is done, tested and next) is tracked in
[`STATUS.md`](STATUS.md) §1; the ✅ marks on the headings below only show sign-off.

### M0 — Project Setup (0.5 day) — ✅ signed off

- Vite + TypeScript + Three.js; ESLint/Prettier; Vitest; `git init`.
- A spinning cube on screen; `npm run dev`, `npm run build`, `npm test` all work.
- 🧪 **Tests:** a smoke test proving the test runner works; `npm run check` script wired up.
- ✅ **Done when:** the production build runs from `dist/` with no console errors.

### M1 — Gunship, Sensor & Terrain (1–2 days) — ✅ signed off

- Placeholder terrain (noise heightmap), a few boxes as buildings.
- Gunship orbit, ground-stabilized sensor, pointer lock, mouse slew, zoom levels per weapon key.
- 🧪 **Tests:** seeded RNG determinism; fixed-step loop (step count, clamp); terrain `heightAt` matches mesh vertices; orbit radius/altitude/direction/period and center glide; sensor slew direction at 0°/90°/180°/270° orbit angles; gimbal clamp; aim stays fixed while orbiting; camera looks exactly at the aim point; zoom converges to weapon FOV; heading math.
- ✅ **Done when:** the aim point stays locked on a ground spot while the orbit moves; slewing feels consistent at every orbit angle and every zoom; 60 FPS.

### M2 — Thermal Look (1–2 days) — ✅ signed off

- `ThermalMaterial`, heat values on all objects, `ThermalPass` (bloom, polarity, grain, scanlines, vignette), `F` toggle, weapon-switch static.
- 🧪 **Tests:** heat table values within 0–1; polarity function; heat decay curves (bodies, craters) over time.
- ✅ **Done when:** a screenshot reads instantly as "gunship thermal feed"; hot objects pop in both polarities.

### M2+ — Night-Vision Sensor (added during development) — ✅ signed off

- A separate image-intensifier sensor (reflected moon/sky light + IR glow, green phosphor), not just a tint. `F` cycles WHT HOT → BLK HOT → NV. Lit windows glow only in NV; IR strobes glow at full strength in NV and faintly in thermal (M4, see §7.9). See STATUS.md §5 decision 14.

### M3 — Weapons, Ballistics & Explosions (2 days) — ✅ signed off

- Weapon state machines, projectiles with flight time, tracers, impact FX, craters, camera shake, placeholder sounds.
- HUD v1: weapon list, ammo/heat/reload, reticles.
- 🧪 **Tests:** weapon state machines (fire rate, clip, overheat, reload timing); flight time = distance / speed; impact on the correct tick; spread stays within its radius; raycast hits roofs before ground.
- ✅ **Done when:** each weapon feels distinct; you can hit a moving target only by leading it.

### M4 — Infantry & Friendlies (2–3 days) — ✅ signed off

- Instanced infantry, walk animation, damage, fling-death, cooling bodies.
- Ridgeback team with strobes, route following, shared team health, enemy fire effects.
- Friendly fire → fail screen (also team overrun → fail screen). Danger-close warning on the HUD.
- Enemy AI is deliberately simple here (advance on the nearest friendly, stop inside range, fire); cover, morale and fleeing are M5.
- The test scene is temporary (`units/TestScene.ts`): Ridgeback walks a back-and-forth route around the placeholder village while enemy groups keep arriving (up to 60 alive); the orbit follows the team. M6/M7 replace it with the real map and mission script.
- 🧪 **Tests:** radial damage falloff; friendly-fire detection → fail event; danger-close event; team health damage and regeneration; spatial grid radius queries match brute force.
- ✅ **Done when:** a test scene with 60 enemies attacking a moving team is fun for 2 minutes and runs at 60 FPS.

### M5 — Enemy AI & Vehicles (2–3 days) — ✅ signed off

- Paths, cover points, EnemyBrain, separation, morale break.
- Trucks (unloading), technicals, APCs, damage states, wrecks blocking roads.
- As built: line of sight (houses + hills) gates enemy and Ridgeback fire; soldiers slide around houses; cover is taken if it has a view of the target **or** brings the soldier ≥ 15 m closer (corner-to-corner bounding on hilly ground); crouched soldiers take less 25/40 mm damage. Until M6 the cover points are generated at house corners and convoys use four temporary test roads (`units/TestScene.ts`).
- 🧪 **Tests:** cover reservation (one soldier per point); EnemyBrain decisions for given situations; path following reaches the end; vehicle armor multipliers and damage states; wreck blocks road.
- ✅ **Done when:** enemies visibly take cover, advance and flee; a convoy arrives, unloads and burns convincingly.

### M5+ — Air Support (added during development, 1–2 days)

- Gun run and bomb strikes called on a sensor-marked point (§7.19): footprint preview, delay, cooldowns, a hot jet streak, impacts through `Explosions` (friendly fire, danger close).
- 🧪 **Tests:** cooldown and readiness; gun-run impacts spaced evenly along the chosen axis and strip length; impacts land after the configured delay at the locked ground point; strike damage uses the same friendly-fire / danger-close path (a strike killing a friendly fails the mission); footprint danger-close preview.
- ✅ **Done when:** calling a strike feels like a deliberate, risky decision, the delay makes you predict where enemies will be, and the guns still matter.

### M6 — The Handcrafted Map (2–3 days)

- Full `MapData`: fields, farmhouse, stream and bridge, village (~25 buildings + clinic), crossroads, north road, quarry LZ, tree lines.
- Debug overlay + Placer tool built **first**, to speed up authoring.
- 🧪 **Tests:** MapData validation (all referenced ids exist, paths inside the map, no buildings on roads, clinic marked protected).
- ✅ **Done when:** flying the orbit over each zone shows a believable, readable place.

### M7 — Mission Scripting & Dialogue (2–3 days)

- Mission runner, conditions/actions library, all four phases + calibration, timeouts, helicopter extraction.
- Radio system with subtitles, priorities, cooldowns; all lines written.
- Protected clinic logic and warnings.
- 🧪 **Tests:** mission runner (conditions fire actions once, timeouts, phase advance); every fail path; radio priority queue and cooldowns; a headless "auto-play" test that runs the whole mission with a cheat-kill bot and asserts it completes.
- ✅ **Done when:** the mission plays start-to-finish with no soft-locks, through both win and every fail path.

### M8 — UI Screens & Settings (1–2 days)

- Title, briefing, pause, settings, fail, complete with stats and rating. Off-screen friendly arrows. Help overlay.
- 🧪 **Tests:** stats/rating calculation; settings save/load with storage unavailable.
- ✅ **Done when:** a new player can start, understand the controls and finish without outside help.

### M9 — Audio (1–2 days)

- Synth engine drone, weapons, delayed impacts, squelch, UI sounds; volume buses wired to settings.
- 🧪 **Tests:** volume bus math; sound-event mapping (each event triggers the right sound id). Audio output itself is checked manually.
- ✅ **Done when:** playing with eyes closed, you can tell which weapon is firing and when shells land.

### M10 — Polish, Balance & Performance (2–3 days)

- Playtest sessions → tune numbers; performance pass (see §11); browser testing; deploy (GitHub Pages / Netlify / Vercel).
- 🧪 **Tests:** add regression tests for every bug found in playtesting; CI workflow green.
- ✅ **Done when:** the target duration is met, no critical bugs, 60 FPS on a mid-range laptop, and it's fun.

**Total estimate:** about 3–4 weeks of focused part-time work.

---

## 11. Performance Budget

| Item          | Budget                                       |
| ------------- | -------------------------------------------- |
| Frame time    | ≤ 16.6 ms (60 FPS) on integrated laptop GPUs |
| Draw calls    | ≤ 150                                        |
| Live infantry | ≤ 120 (one InstancedMesh per pose)           |
| Particles     | ≤ 4,000 points (pooled, single buffer)       |
| Vehicles      | ≤ 12 live + wrecks                           |
| Craters       | ≤ 60 (recycled)                              |

**Techniques:** instancing for soldiers/trees; merging building geometry; object pools (no
per-shot allocations); spatial grid queries; AI "thinks" staggered at 4 Hz; shadows disabled
(not needed in thermal); render resolution scale setting (0.75× option for slow machines);
pause rendering when the tab is hidden.

---

## 12. Testing Strategy

### 12.1 Continuous testing workflow (applies to EVERY milestone)

Tests are written **alongside** the code, not at the end. The rules:

1. **Logic lives in pure, DOM-free modules** (math, state machines, rules), so it can be tested
   in Node without a browser. Rendering/DOM code stays thin and calls into those modules.
2. **Every new system ships with its tests in the same change.** A file `src/x/Foo.ts` gets
   `src/x/Foo.test.ts` next to it.
3. **Every bug fix adds a test** that would have caught it (regression test).
4. **Tests are updated, not deleted,** when behavior changes on purpose; the test change is
   reviewed like code.
5. **When tests run:**
   - While developing: `npm run test:watch` (re-runs affected tests on every save).
   - Before finishing any task: `npm run check` (typecheck + lint + all tests) must be green.
   - Milestone sign-off: `npm run check`, `npm run build`, and the manual checklist below.
   - Once the repo is on GitHub: a CI workflow runs `npm run check` and `npm run build` on every push.
6. **Each milestone in §10 lists the tests it must add** (🧪 lines). A milestone is not done
   until those exist and pass.

### 12.2 Automated (Vitest), for pure logic

- Sensor math: screen-space slew direction correct at orbit angles 0°, 90°, 180°, 270°.
- Ballistics: flight time = distance / speed; impact fires at the right tick.
- Damage falloff: full damage inside the inner radius, zero at the blast radius, monotonic in between.
- Friendly-fire and protected-structure detection.
- Mission runner: conditions fire actions exactly once; timeouts trigger; phases advance.
- Radio queue: priority ordering and cooldowns.

### 12.3 Manual playtest checklist (run before every milestone sign-off)

- [ ] Complete the mission using mostly 25 mm.
- [ ] Complete it relying heavily on 105 mm (danger-close should feel risky but possible).
- [ ] Trigger each fail state: friendly fire, clinic hit, team overrun.
- [ ] Pause/resume, lose focus, resize the window, switch tabs mid-mission.
- [ ] Test Chrome, Firefox, Safari; test a trackpad.
- [ ] Watch FPS in the busiest moment (village square, final LZ wave).

---

## 13. Risks & Mitigations

| Risk                                       | Impact                     | Mitigation                                                                                                                                    |
| ------------------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Thermal look ends up flat or muddy         | The whole game feels cheap | Do M2 early; tune heat values and bloom against reference stills; keep all parameters in config with a debug slider panel (lil-gui, dev only) |
| Targets unreadable in the 105 mm view      | Frustration                | 1.3× unit scale, bloom, contrast curve per weapon                                                                                             |
| Aiming feels floaty or disorienting        | Core feel broken           | Ground-stabilized aim, screen-space slew, FOV-scaled sensitivity; tune in M1 before anything else                                             |
| Mission soft-locks (enemy stuck somewhere) | Can't finish               | Timeouts on every "clear zone" step; enemies flee after timeout; debug skip                                                                   |
| Too many enemies overwhelms performance    | Stutter at climax          | Instancing, pools, staggered AI, hard caps per wave                                                                                           |
| Scope creep                                | Never finishes             | Strict milestone order; stretch items (building occupants, voice-over, civilians, checkpoints) parked until after M10                         |
| Browser audio autoplay rules               | Silent game                | Start the AudioContext on the title-screen click                                                                                              |
| Pointer lock quirks (Safari)               | Can't aim                  | Fallback: drag-to-aim mode when pointer lock is unavailable                                                                                   |

---

## 14. Future: Endless Survival Mode

The architecture already supports it with little new code:

- Reuse the **same map, units, weapons, rendering**.
- Replace `missionDef.ts` with a **Director** that spawns waves procedurally: difficulty rises over time, mixing infantry and vehicles from random spawn points around a fixed defend position (e.g. the quarry LZ).
- New scoring: survival time, kill-streak multipliers, a local high-score table (localStorage).
- Optional rotating zones: the team relocates every N waves, moving the orbit focus.

**Stretch ideas after that:** civilians (non-targets) in the village, enemy anti-aircraft fire with flares, checkpoints, recorded voice-over, gamepad support, a replay ("kill cam" from the feed).

---

### Next step

Start **M0 (setup)** and **M1 (gunship + sensor)**. The aiming feel is the foundation that
everything else sits on, so it gets tuned before any content is built.
