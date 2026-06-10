# HORDEFALL Round Two Benchmark Prompt

You are continuing an existing benchmark project, not starting over.

The repository already contains a playable Three.js + TypeScript + Vite first-person horde survival game called HORDEFALL. The original prompt asked for a complete AAA-style browser FPS horde survival vertical slice with serious architecture, real gameplay, performance-conscious systems, data-driven content, save/load, upgrades, enemies, waves, UI, debug tools, and documentation.

Your task is to take the existing codebase the rest of the way toward that original goal.

Do not rewrite the project. Do not replace the architecture. Do not create a parallel implementation. Read the codebase first, preserve the current simulation/render/UI/input/audio/config boundaries, and improve the game in-place.

## Operating Mode

Work like a senior autonomous game engineer.

- Inspect the repo before making changes.
- Treat the existing headless simulation boundary as sacred: `src/sim` must not depend on Three.js or the DOM.
- Prefer focused implementation over broad refactors.
- Add tests for changed logic.
- Use the existing data-driven config style.
- Keep the game browser-runnable.
- Push hard, but verify as you go.
- Do not claim something is complete unless the code and tests support it.
- If you find that one of the gap claims below is wrong, trust the code over the claim and adjust.

## First Step: Audit And Confirm

Before implementing, audit the current repo against the original prompt.

Confirm, refute, or refine these previously identified gaps:

1. `PlayerSim.respawn()` exists, but normal death appears to go straight to game over. There is no real playable respawn/revive flow.
2. Boss phase configs include `speedMult`, but enemy AI does not appear to apply it.
3. Wave scaling accounts for wave number, player level, and prior-wave performance, but not directly for time survived or weapon upgrade power.
4. UI click/hover sound recipes exist, but ordinary menu button interactions do not appear to play them.
5. Graphics settings include `maxCorpses`, but it does not appear wired to renderer/sim behavior. The original prompt also asked for texture/detail level and max ragdolls/decals/effects; decals are wired, but the rest appears partial or absent.
6. The project has headless smoke tests, but no browser E2E smoke test that loads the app, clicks Deploy, checks the canvas/HUD, opens menus, and verifies no console errors.
7. `vite.config.ts` uses `as any`; remove that type escape cleanly.
8. Run teardown/disposal may be incomplete. Audit Three.js geometries/materials/listeners/subscriptions and fix leaks where practical.
9. The current game has a lot of systems, but game feel and readability need a serious polish pass: weapon feel, enemy telegraphs, boss attacks, damage feedback, early-wave pacing, and upgrade/shop clarity.
10. Find anything else from the original prompt that is incomplete, fake, unverified, or implemented only as a stub.

Do not stop after the audit. Use it to drive implementation.

## Primary Goal

Finish the original benchmark goal: a complete working browser-based Three.js TypeScript FPS horde survival game that feels like a polished commercial vertical slice.

The game should run, compile, test, and be genuinely playable:

- The player can start a run.
- Controls work.
- The player can fight waves.
- Enemies spawn, navigate, attack, and scale.
- The player can level up and choose upgrades.
- The player can access the between-wave shop.
- The player can unlock and upgrade weapons.
- The player can survive, die, revive/respawn if that flow is added, and eventually reach game over.
- The game-over/run-summary experience is useful.
- Debug and stress tools work.
- Browser runtime errors are caught before finishing.

## Required Implementation Priorities

### 1. Browser E2E Verification

Add a real browser smoke/E2E test path.

Use Playwright or another appropriate browser test tool. The test should at minimum:

- Start or target the Vite app.
- Load the main page.
- Fail on uncaught page errors and serious console errors.
- Verify the main menu appears.
- Click Deploy.
- Verify the canvas exists and the HUD becomes visible.
- Verify a run starts.
- Open pause/settings or another menu and verify basic UI function.
- Exercise at least one debug/stress path if practical without making the test flaky.
- Verify the canvas is nonblank or that renderer state is active.

Add a package script for this test.

### 2. Complete Missing Prompt Requirements

Implement the confirmed missing or partial items:

- Real respawn/revive flow, or a clearly designed no-respawn survival rule with the unused API removed. Prefer adding a limited revive/respawn mechanic if it fits the game.
- Apply boss phase `speedMult` and make phase changes visibly meaningful.
- Wave scaling should consider time survived and weapon upgrade power, not just wave/player level/performance.
- Wire UI click/hover sounds centrally through existing UI helpers or UI manager patterns.
- Wire `maxCorpses` or replace it with a real effects/corpse budget setting that is honored.
- Add or properly define graphics detail/effects controls so the settings menu matches actual renderer behavior.
- Remove `as any` from Vite config using proper config typing.
- Harden renderer/run teardown and disposal.

### 3. Game Feel And Readability

Make the game feel substantially better.

Focus on changes a player can feel immediately:

- Improve weapon identity:
  - Pistol: reliable baseline.
  - Shotgun: punchy close-range burst and clear pump rhythm.
  - Rifle: sustained automatic pressure with controlled bloom.
  - Sniper: strong ADS/zoom payoff and heavy recoil.
  - Launcher: visible grenade arc/explosion clarity.
  - Arccaster: obvious chain-lightning feedback.
- Improve enemy readability:
  - Exploder fuse warning.
  - Spitter/ranged windup tell.
  - Shield enemy shield-facing clarity.
  - Support enemy aura/heal clarity.
  - Boss phase and special attack telegraphs.
- Improve damage feedback:
  - Directional damage indicator clarity.
  - Low-health feedback that is noticeable but not obnoxious.
  - Hit/kill feedback that scales well with hordes.
- Improve early wave pacing:
  - Wave 1 should start fast enough to be interesting but not chaotic.
  - Waves 2-5 should introduce enemy types and pressure cleanly.
  - Boss wave should feel like a distinct event.
- Improve shop/upgrade clarity:
  - Disabled purchase reasons.
  - Upgrade stack/current effect clarity.
  - Weapon unlock/tier clarity.

### 4. Content And Systems Polish

Add content only where it strengthens the vertical slice.

Good additions include:

- More boss attack polish or one new boss mechanic.
- More wave event clarity.
- Environmental hazard or stronger explosive barrel interactions.
- Upgrade synergy polish for fire/frost/shock/status interactions.
- Run-history/profile screen if it fits cleanly.
- Keybind conflict detection.
- First-run controls overlay before pointer lock.

Avoid adding shallow content that is not integrated, not tested, or not visible to players.

### 5. Architecture And Safety Rails

Add guardrails that make the project more maintainable:

- Add a dependency-boundary test that fails if `src/sim` imports Three.js, DOM globals, or render/UI modules.
- Add tests for any new wave scaling math, boss phase behavior, respawn/revive behavior, save migration changes, and settings behavior.
- Keep config validation updated for new fields.
- Keep save migration safe if save shape changes.
- Ensure stress tools still support 100, 250, 500, 750, and 1000 enemies.

## Verification Requirements

Before finishing, run:

```bash
npm test
npm run smoke
npm run build
```

Also run the new browser E2E script.

If any command fails, fix the issue and rerun the relevant command.

## Constraints

- Do not use paid assets.
- Do not introduce a game engine.
- Do not collapse the project into one giant file.
- Do not fake systems with empty placeholders.
- Do not remove existing major systems to make the task easier.
- Do not break deterministic/headless sim tests.
- Do not introduce avoidable per-frame allocations in hot paths.
- Do not make a marketing page; the game experience is the product.

## Acceptance Bar

The result should feel like a materially improved second pass, not a checklist patch.

The final codebase should be stronger in four ways:

1. More complete against the original prompt.
2. More fun and readable in actual browser play.
3. Better verified through automated tests, including browser runtime coverage.
4. Cleaner and safer to continue developing.

