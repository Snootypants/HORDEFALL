# HORDEFALL

A browser-based first-person horde survival game built with **Three.js + TypeScript + Vite**. No game engine, no paid assets — every mesh is procedural geometry, every sound is synthesized at runtime, every system is data-driven.

Fight procedurally composed waves of seven enemy archetypes (plus a phased boss every 5 waves) across three arena variants, level up through a 24-augment roguelite pool, buy weapon tiers between waves, and chase the leaderboard — at 60 FPS with 500+ live enemies.

---

## 1. Project Overview

| | |
|---|---|
| Stack | Three.js (r165), TypeScript (strict), Vite, Vitest |
| Sim model | Fixed 60 Hz timestep, headless-capable, seeded-deterministic |
| Scale target | 1000 concurrent enemies (SoA + instancing + spatial hash) |
| Content | 6 weapons, 8 enemy types (incl. boss), 24 upgrades, 7 status effects, 5 wave events, 3 maps |
| Persistence | Versioned localStorage saves with v1→v2 migration, import/export |
| Tests | 145 unit + integration tests (`vitest`), headless smoke mode |

## 2. Setup

```bash
npm install        # Node 18+ recommended (built on Node 24)
```

## 3. Run

```bash
npm run dev        # → http://localhost:5173
```

Click **Deploy**, then click the canvas to grab the mouse. Internet access is only used for Google Fonts (the UI gracefully falls back without it).

## 4. Build

```bash
npm run build      # typechecks (tsc --noEmit) then bundles to dist/
npm run preview    # serve the production bundle
```

## 5. Test

```bash
npm test           # full suite (195 tests)
npm run test:watch # watch mode
npm run smoke      # smoke-test mode: boots the entire simulation headless,
                   # plays several seconds of game, stress-ticks 500 enemies
npm run e2e        # browser E2E (Playwright/Chromium): boots the real app,
                   # deploys, checks HUD/renderer/menus/stress, fails on any
                   # page error. First run: npx playwright install chromium
```

Tests live in `tests/`. Pure logic (math, RNG, pools, spatial hash, damage, waves, scaling, status effects, revives, corpse budgets, boss phases, save migration, config validation, progression) is unit-tested; `tests/smoke.test.ts` is the integration net that runs the real `Simulation` with no DOM or renderer; `tests/simBoundary.test.ts` is an architecture guardrail that fails if `src/sim` ever imports Three.js/DOM/presentation modules; `e2e/smoke.spec.ts` is the in-browser runtime net.

## 6. Architecture Overview

The defining boundary: **the simulation never touches Three.js or the DOM.**

```
input  ──InputCommand──▶  sim  ──events──▶  render / ui / audio
                           │
                           └── snapshot state (typed arrays) read by render
```

- `src/sim/` is a complete headless game: player, weapons, enemies, waves, pickups, status effects, companions, collision. It runs in Node (that's how the smoke test works) and is what a future authoritative server would execute.
- Cross-cutting reactions (sounds, particles, hitmarkers, score popups) flow through one typed **event bus** (`src/sim/events.ts`). Sim systems emit; presentation subscribes. No sim code ever calls a renderer/UI/audio function.
- The **render layer** reads sim state directly (positions live in `Float32Array`s — zero copies) and owns all Three.js objects.
- **Input** is collected into a serializable `InputCommand` struct per frame — the only thing the sim receives from the outside world.
- Everything balance-related lives in `src/config/` and is validated at startup (`validation.ts` prints a report to the console and dev console).

High-volume entities (enemies, projectiles, particles, pickups, decals, damage numbers) use **structure-of-arrays storage with free-lists** — an ECS-style data layout chosen over a generic ECS framework because the entity archetypes are fixed and the hot loops want contiguous typed arrays.

Determinism hooks: one seeded `Rng` per run, forked into named streams (`waves`, `combat`, `enemy-ai`, …) so systems can't perturb each other; fixed timestep; daily-challenge seeds derive from the UTC date. Replays would need input recording only.

## 7. Folder Structure

```
src/
├── core/        Engine primitives: EventBus, ObjectPool, SpatialHashGrid,
│                StateMachine, Rng (seeded), FixedTimestepLoop, Logger,
│                Profiler, math (zero-alloc intersection tests)
├── config/      ALL balance data + types + runtime validation
├── sim/         Headless simulation (no three/DOM imports — enforced by review)
│   ├── combat/      damage math, on-hit ability effects, combat context
│   ├── enemies/     SoA EnemyManager, AI (think/strike/boss), queries, scaling
│   ├── progression/ XP/levels/combo/streaks, upgrade → stat-sheet resolution
│   ├── waves/       procedural wave generator, WaveDirector + spawn policy
│   └── …            playerSim, weapons, projectiles, pickups, barrels,
│                    companions, status (SoA), collision, mapGen, Simulation
├── render/      Three.js only: instanced enemy/projectile/pickup renderers,
│                particles/tracers/decals, camera rig, viewmodel, post-FX,
│                world meshes, debug draw
├── input/       InputManager (rebindable), gamepad, bindings
├── audio/       AudioManager (bus tree), synthesized SFX recipes, event wiring
├── ui/          HUD, minimap, damage numbers, menu screens, styles
├── save/        SaveManager: versioning, migration, quarantine, import/export
├── debug/       Dev console, performance overlay
└── game/        Game orchestrator, screen registry, dev actions, persistence
tests/           Vitest suites incl. the headless smoke test
```

## 8. Controls (all rebindable in Settings → Controls)

| Action | Default | Action | Default |
|---|---|---|---|
| Move | WASD | Fire / Aim | LMB / RMB |
| Sprint | L-Shift | Reload | R |
| Crouch | L-Ctrl | Weapons | 1–6 / wheel |
| Jump | Space | Shop (during break) | B |
| Pause | Esc | Dev console | ~ |
| Perf overlay | F3 | Developer menu | F8 |

Gamepad (standard mapping): sticks move/look, RT fire, LT aim, A jump, B crouch, X reload, LB/RB cycle weapons, L3 sprint.

## 9. Data-Driven Configuration

Every number a designer would want to touch lives in `src/config/`:

- `weapons.ts` — damage, RPM, spread/bloom, recoil, mags, falloff, pierce, projectile specs (gravity/explosive/chain), upgrade tiers, prices
- `enemies.ts` — stats, roles, AI parameters, shields/auras/explosions, boss phases, wave-budget cost/weight/minWave
- `waves.ts` + `balance.ts` — wave events, budget curve, spawn policy, boss cadence
- `upgrades.ts` — stat mods (`StatKey`) and ability grants (`AbilityFlag`)
- `statusEffects.ts` — durations, DPS, slows, stacking, elemental interactions
- `pickups.ts`, `maps.ts`, `achievements.ts`

`validation.ts` checks every entry at startup (duplicate ids, broken cross-references, nonsense ranges) and prints a report; `npm test` fails if shipped configs are invalid.

## 10. How to Add a New Weapon

1. Append an entry to `WEAPONS` in `src/config/weapons.ts` with a unique `id` and an unused `slot` (7+ requires adding a `weapon7` binding in `src/input/bindings.ts`).
2. Pick `kind: 'hitscan'` or `'projectile'` (projectiles need a `projectile` spec — validation enforces this).
3. Point `fireSound`/`reloadSound` at a recipe in `src/audio/synth.ts` (or add a new recipe).
4. Optional: add a silhouette case in `buildGunMesh()` (`src/render/ViewModel.ts`) — unknown ids get a generic body.

Done. The weapon appears in the loadout, HUD slots, shop (unlock + tiers), and validation automatically.

## 11. How to Add a New Enemy

1. Append to `ENEMIES` in `src/config/enemies.ts`. Choose a `role` (`melee`/`ranged`/`exploder`/`support`/`boss`) — behavior is fully driven by the role plus optional specs (`projectile`, `explode`, `shield`, `aura`, `boss`).
2. Set `minWave`, `cost`, and `weight` so the wave generator can budget it.
3. Choose a `shape` (capsule/sphere/box/cone/crystal) + `color` + `scale` — the instanced renderer batches it automatically.

A new *behavior* (not covered by existing roles/specs) means a new case in `src/sim/enemies/enemyAI.ts` `think()`.

## 12. How to Add a New Upgrade

1. Append to `UPGRADES` in `src/config/upgrades.ts`.
2. Numeric effects: reference an existing `StatKey` (`mods: [{ stat, add?, mult? }]`). New stat keys go in `src/config/types.ts` and get consumed wherever relevant (most read from the computed sheet in `upgradeEffects.ts` automatically).
3. Behavioral effects: add an `AbilityFlag` and handle it in the relevant system (`src/sim/combat/onHit.ts` for on-hit effects, `Simulation.ts` for auras/novas, `companions.ts` for deployables).

Wave modifiers: append to `WAVE_EVENTS` in `src/config/waves.ts` and handle any new fields in `WaveDirector`.

## 13. Performance Strategy

Verified: **~60 FPS with 506 live enemies in software-rendered headless Chromium** (enemy AI: 0.6 ms/frame) — real GPUs have far more headroom. Stress test up to 1000 via the F8 menu or `stress 1000` in the console.

- **SoA everywhere hot**: enemies, projectiles, particles, pickups, statuses are parallel typed arrays with free-lists/ring cursors. No per-entity objects, no allocation in any per-frame loop (scratch arrays + stamp-based dedupe instead of Sets).
- **Spatial hash grid** (XZ, 4 m cells) answers every proximity question: separation steering, hitscan corridors, explosion/chain/aura/magnet queries.
- **Instanced rendering**: the entire horde is ~6 draw calls (one `InstancedMesh` per archetype shape) with per-instance color carrying hit-flash/elite/status tints. World props, projectiles, pickups, tracers, decals, debug shapes — all instanced. Particles are one `THREE.Points`.
- **AI LOD**: enemies *think* (steering, target logic, LOS) on a distance-banded cadence — 10 Hz near, 4 Hz mid, 2 Hz far, de-synchronized by index — while integration stays per-tick. Static-collision pushout alternates ticks. Ranged LOS checks ride the think cadence.
- **Fixed-step sim / rAF render split** keeps simulation cost flat under display-rate changes.
- **Graphics tiers** (low→ultra) gate shadows, bloom, particle density, render scale, decal caps; post chain collapses to a single pass at low.

The F3 overlay shows FPS, frame/sim/AI/render ms, draw calls, triangles, entity/pool counts, and JS heap.

## 14. Known Limitations

- **Enemy navigation is steering-based, not pathfinding.** Enemies seek + separate + slide around obstacles; deep concave pockets can briefly pen them. Fine for arena layouts by design; a flow-field would be the upgrade.
- **Enemies don't climb platforms** — verticality is the player's escape valve (they'll wait below; spitters will still hit you).
- **Ramps are stepped colliders** (visual staircase matches collision, but smooth-slope sliding is approximated).
- **Run restarts rebuild the renderer on the same canvas.** Teardown deep-disposes every geometry/material/texture, the composer, and the per-run resize listener (`render/disposeUtils.ts`); Three.js's internal program cache is the only thing intentionally kept warm. A page refresh fully resets.
- Hit volumes are spheres (fast, fair at horde scale) rather than per-limb capsules; the headshot zone is a height band.
- Shadow-toggle changes mid-run rebuild materials lazily; full effect on next run.
- Audio is intentionally lo-fi synthesis; throttling caps identical sounds per 35–150 ms window.

## 15. Future Multiplayer Architecture Plan

The codebase was shaped for an authoritative-server future:

**Already in place**
- The sim is headless and Three-free (`Simulation` runs in Node today — the smoke test proves it).
- Input is a flat serializable `InputCommand`; look angles are part of the command (client-authoritative aim, server-authoritative everything else).
- Fixed 60 Hz timestep with named, forked RNG streams per system.
- All presentation hangs off the event bus — a network layer can replay remote events into local renderers unchanged.

**What would need to change**
1. **Multi-player state**: `PlayerSim`/`WeaponSim` are singletons per `Simulation`; promote to arrays keyed by player id, and `CombatContext.playerPos`/`damagePlayer` become per-target lookups.
2. **Snapshot serialization**: add `serialize()/deserialize()` over the SoA arrays (they're already typed arrays — this is mostly `structuredClone`-shaped work) for join-in-progress and reconciliation.
3. **Client prediction**: the render layer already reads sim state each frame; insert an interpolation buffer (the `FixedTimestepLoop.alpha` hook exists) and rewind/replay for the local player.
4. **Event routing**: bus events gain a `playerId` origin; server filters which events each client receives.
5. **Lockstep alternative**: because the sim is seed-deterministic, a cheaper co-op path is deterministic lockstep — ship inputs only, with periodic checksum validation. Float determinism across browsers is the risk; the authoritative-snapshot path is safer.

---

### Developer Tools Cheat Sheet

- **~** dev console: `help`, `god`, `noclip`, `give credits 5000`, `give xp 1000`, `spawn tank 5`, `stress 750`, `wave 10`, `skipwave`, `forceboss`, `unlockall`, `killall`, `upgrade lifesteal`, `validate`, `seed`
- **F8** developer menu: stress buttons (100/250/500/750/1000), per-type spawns, god/noclip, hitbox/AI-state/steering/spawn-point visualization, AI-throttle toggle, wave skip, force boss
- **F3** performance overlay
- `window.HORDEFALL` exposes the orchestrator in the browser console
