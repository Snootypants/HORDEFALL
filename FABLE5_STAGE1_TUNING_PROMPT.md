# HORDEFALL Fable 5 Stage 1 Prompt

We are benchmarking your ability to safely evolve an existing codebase.

Do only this stage. Do not implement deterministic replay, multiplayer, mod support, objective systems, behavior-tree AI, accessibility overhaul, or later benchmark stages yet.

This is not a rewrite. Read the repo first, preserve the existing architecture, and improve the game in place.

## Context

HORDEFALL is an existing Three.js + TypeScript + Vite first-person horde survival game.

The repo already appears to have:

- A mostly headless gameplay simulation in `src/sim`
- Command-object input
- Simulation boundary tests
- Headless smoke tests
- Config-driven weapons, enemies, waves, pickups, upgrades, maps, and balance
- Existing developer console/menu tools

Do not blindly "extract the simulation" if the code already does it. First audit whether the headless split is real, then harden what is missing.

## Operating Rules

- Inspect the repo before changing files.
- Preserve existing browser gameplay.
- Preserve the `src/sim` boundary: simulation code must not depend on Three.js, DOM APIs, browser input APIs, renderer code, UI code, or audio code.
- Use the existing data-driven config style.
- Keep changes focused and test-backed.
- Do not create a parallel implementation.
- Do not fake gameplay tests with mocks that bypass real gameplay logic.
- If an assumption in this prompt is wrong, trust the code over the prompt and explain the correction.

## Stage 1 Goal

Harden the existing headless simulation architecture and add the tuning/gameplay tools needed to make HORDEFALL easier to balance.

This stage has five parts:

1. Headless simulation hardening
2. Live tuning console
3. Adaptive drop system
4. Melee weapon
5. Enemy collision and hitbox fixes

## Part A: Headless Simulation Hardening

Audit and strengthen the existing headless simulation.

Requirements:

- Confirm the simulation can run in Node/Vitest without Three.js, DOM APIs, browser input APIs, renderer code, UI code, or audio dependencies.
- Keep rendering, UI, and audio subscribed to simulation state/events instead of owning gameplay state.
- Keep input as serializable command objects.
- Weapons, enemies, waves, upgrades, damage, pickups, status effects, and save/load must work without the renderer.
- Add or strengthen tests proving a real 10-wave run can execute headlessly.
- Add or strengthen tests proving same seed + same input command stream produces the same final simulation checksum.
- Add or strengthen an architecture boundary test that fails if `src/sim` imports Three.js, DOM/browser globals, renderer modules, UI modules, browser input modules, or audio modules.
- Do not remove existing browser gameplay.
- Do not fake this with mocks that bypass real gameplay logic.

## Part B: Live Tuning Console

Add a live tuning console to the existing F8 developer menu.

The goal is to tune gameplay without editing TypeScript config and restarting the app.

Requirements:

- Add runtime sliders/inputs for weapon damage per weapon.
- Add runtime sliders/inputs for enemy HP per enemy type.
- Add runtime sliders/inputs for enemy movement speed per enemy type.
- Add runtime sliders/inputs for enemy touch/projectile/explosion damage per enemy type.
- Add runtime controls for global drop chance.
- Add runtime controls for per-pickup drop weights.
- Add checkboxes to unlock/lock each gun.
- Add checkboxes to enable/disable each weapon upgrade tier.
- Add buttons for:
  - Unlock all guns
  - Max all weapon tiers
  - Refill health
  - Refill armor
  - Refill ammo
  - Reset tuning to defaults
  - Export tuning preset JSON
  - Import tuning preset JSON
- Tuning overrides must stay separate from normal player save data.
- Tuning changes should apply live during a run where reasonable.
- The UI must clearly show whether a value affects existing spawned entities or only future spawns.
- Add validation for tuning values.
- Add tests for tuning validation and application.

Implementation guidance:

- Prefer a small tuning-overrides layer over mutating source config objects directly.
- Preserve config validation for shipped defaults.
- Avoid making the tuning console depend on renderer internals.

## Part C: Adaptive Drop System

Make resource drops respond to the player's current needs.

Current behavior appears to be a fixed global drop chance followed by weighted pickup selection. Keep that base structure, but make the effective weights resource-aware.

Requirements:

- Low ammo increases ammo drop weight.
- Low armor increases armor drop weight.
- Low health increases health drop weight.
- Low armor also gives a small increase to health drop chance.
- Clamp adaptive multipliers so drops do not become absurd.
- Keep wave modifiers such as ammo-scarce compatible with adaptive drops.
- Add a debug/tuning readout showing current effective drop odds.
- Add tests for:
  - Full resources
  - Low ammo
  - Low armor
  - Low health
  - Combined low-resource cases
  - Clamp behavior

## Part D: Melee Weapon

Add a melee weapon as a no-ammo fallback.

Requirements:

- Press `0` to equip melee.
- Add input binding/settings support for weapon slot 0.
- Melee auto-equips when all guns are fully out of ammo.
- Melee has:
  - Damage
  - Range
  - Arc or cone hit detection
  - Cooldown
  - Hit feedback
  - Miss feedback if practical
  - Knockback or stagger if it fits the existing combat model
- Melee must work in the headless simulation.
- Melee must not consume ammo.
- Melee should participate cleanly in stats where appropriate.
- Add tests for:
  - Switching to melee with `0`
  - Auto-equip when all guns are empty
  - Hit detection
  - Cooldown behavior
  - No-ammo fallback behavior

## Part E: Enemy Collision And Hitbox Fixes

Fix the current feel issues around enemy collision and hittability.

Known issues to investigate:

- Enemies may not collide with some field objects.
- Enemies appear to push out of static collision, but barrels and other sim props may not block them.
- The first enemy's visible body appears wider than its hittable volume.
- The first enemy's head may not be included reliably in the hitbox.

Requirements:

- Audit which field objects should block enemies.
- Make intended field objects collide with enemies, or document clearly why they do not.
- Fix enemy hitboxes so visible enemy bodies are hittable.
- Fix the first enemy so its full visible body and head can be hit.
- Debug hitbox visualization must match the real raycast/hit volumes.
- Add tests for enemy ray hits, headshots, and obstacle collision with intended blocking objects.

Implementation guidance:

- Do not simply inflate every hitbox blindly if that makes combat unfair or breaks headshots.
- Prefer making render geometry, debug hitboxes, and actual raycast volumes agree.
- Keep performance in mind for large hordes.

## Part F: Verification

Before finishing, run:

```bash
npm run build
npm test
npm run e2e
```

If a command fails, fix the issue and rerun the relevant command.

Also run any new focused tests you add.

## Final Response Required

After finishing, provide:

1. What changed
2. Files changed
3. Tests added
4. Tests passing/failing
5. Remaining risks
6. Exact commands to verify

## Explicit Non-Goals For This Stage

Do not implement these yet:

- Deterministic replay system
- Browser replay viewer
- Benchmark harness
- Multiplayer architecture conversion
- Mod support
- Save migration hell beyond what this stage directly requires
- Objective system
- Behavior-tree AI rewrite
- Full accessibility/settings overhaul
- Senior audit top-10 repair loop

Those are later stages. This pass should make the current game more tunable, more testable, and more honest about its headless architecture.
