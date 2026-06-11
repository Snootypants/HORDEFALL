/**
 * Golden replay corpus: four committed fixtures replay headlessly and must
 * verify to their recorded final checksums. A failure here means sim
 * behavior or game config changed since recording — if that change was
 * intentional, regenerate the corpus with:
 *
 *   REGEN_FIXTURES=1 npx vitest run tests/replayFixtures.test.ts
 *
 * and review the diff. NEVER loosen the assertion instead.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { neutralInput } from '../src/sim/inputCommand';
import { ReplayRecorder } from '../src/sim/replay/ReplayRecorder';
import { ReplayPlayer } from '../src/sim/replay/ReplayPlayer';
import { applyShopPurchase } from '../src/sim/shopLogic';
import { runDevAction, type DevAction } from '../src/sim/devActions';
import { defaultTuning } from '../src/sim/tuning';
import { scriptedCommand, aimAtNearestEnemy } from './helpers/simHarness';
import type { ReplayV1 } from '../src/sim/replay/replayTypes';

const DIR = join(__dirname, 'fixtures', 'replays');
const DT = 1 / 60;

interface FixtureSpec {
  name: string;
  seed: number;
  ticks: number;
  /** Decisions to inject at tick boundaries while recording. */
  at?: Record<number, (sim: Simulation, rec: ReplayRecorder) => void>;
  /** Weapon slot the script holds (fixture 4 fires the launcher). */
  holdSlot?: number;
}

function dev(sim: Simulation, rec: ReplayRecorder, action: DevAction): void {
  rec.recordDecision('dev', JSON.stringify(action));
  runDevAction(sim, action);
}

const SPECS: FixtureSpec[] = [
  // 1. Plain wave-1 combat: aimed scripted fire, no decisions.
  { name: 'wave1-combat', seed: 101, ticks: 1800 },
  // 2. Upgrade choice: force kills (XP) then pick an upgrade.
  {
    name: 'upgrade-choice',
    seed: 202,
    ticks: 1500,
    at: {
      400: (sim, rec) => dev(sim, rec, { kind: 'killall' }),
      500: (sim, rec) => dev(sim, rec, { kind: 'skipwave' }),
      1000: (sim, rec) => dev(sim, rec, { kind: 'killall' }),
      1300: (sim, rec) => {
        // Two waves of kill XP guarantee a pending level-up here.
        if (sim.progression.consumePendingLevelUp()) {
          rec.recordDecision('upgrade', 'juggernaut');
          sim.applyUpgrade('juggernaut');
        }
      },
    },
  },
  // 3. Shop purchase + the wave-2 weapon-cache acquisition.
  {
    name: 'shop-and-cache',
    seed: 303,
    ticks: 3600,
    at: {
      600: (sim, rec) => dev(sim, rec, { kind: 'killall' }),
      900: (sim, rec) => dev(sim, rec, { kind: 'skipwave' }),
      1500: (sim, rec) => dev(sim, rec, { kind: 'killall' }),
      1800: (sim, rec) => {
        rec.recordDecision('shop', 'armor');
        applyShopPurchase(sim, 'armor');
      },
    },
  },
  // 4. Projectile/explosion run: unlock everything, hold the launcher.
  {
    name: 'explosion-launcher',
    seed: 404,
    ticks: 1500,
    holdSlot: 5,
    at: { 1: (sim, rec) => dev(sim, rec, { kind: 'unlockall' }) },
  },
];

function record(spec: FixtureSpec): ReplayV1 {
  const sim = new Simulation({ mapConfig: MAPS[0], seed: spec.seed });
  sim.startRun();
  const rec = new ReplayRecorder(
    { mapId: MAPS[0].id, seed: spec.seed, unlockedWeapons: [], tuning: defaultTuning() },
    300,
  );
  const cmd = neutralInput();
  for (let t = 0; t < spec.ticks; t++) {
    spec.at?.[t]?.(sim, rec);
    scriptedCommand(t, cmd);
    if (spec.holdSlot !== undefined && t === 10) cmd.weaponSlot = spec.holdSlot;
    if (aimAtNearestEnemy(sim, cmd)) {
      cmd.fire = true;
      cmd.firePressed = t % 8 === 0;
    }
    sim.tick(DT, cmd);
    rec.afterTick(sim, cmd);
  }
  return rec.finalize(sim);
}

describe('golden replay corpus', () => {
  if (process.env.REGEN_FIXTURES) {
    it('regenerates the corpus', () => {
      for (const spec of SPECS) {
        const replay = record(spec);
        writeFileSync(join(DIR, `${spec.name}.json`), JSON.stringify(replay));
        expect(new ReplayPlayer(replay).run().ok).toBe(true);
      }
    });
    return;
  }

  for (const spec of SPECS) {
    it(`${spec.name} replays to its recorded checksum`, () => {
      const replay = JSON.parse(readFileSync(join(DIR, `${spec.name}.json`), 'utf8')) as ReplayV1;
      const result = new ReplayPlayer(replay).run();
      expect(result.message).toContain('verified');
      expect(result.ok).toBe(true);
      expect(result.ticksRun).toBe(spec.ticks);
    });
  }

  it('fixtures exercise distinct content (decisions, projectiles, caches)', () => {
    const load = (n: string): ReplayV1 => JSON.parse(readFileSync(join(DIR, `${n}.json`), 'utf8'));
    expect(load('upgrade-choice').decisions.some((d) => d.kind === 'upgrade')).toBe(true);
    expect(load('shop-and-cache').decisions.some((d) => d.kind === 'shop')).toBe(true);
    expect(load('explosion-launcher').decisions.some((d) => d.kind === 'dev')).toBe(true);
    expect(load('wave1-combat').decisions).toHaveLength(0);
  });
});
