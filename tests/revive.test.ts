/**
 * Revive flow: the first lethal hit downs the player and consumes a revive
 * token after a short delay; the run only ends when tokens are exhausted.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { Simulation } from '../src/sim/Simulation';
import { MAPS } from '../src/config/maps';
import { BALANCE } from '../src/config/balance';
import { neutralInput } from '../src/sim/inputCommand';

const DT = 1 / 60;

describe('revive flow', () => {
  let sim: Simulation;
  let events: string[];

  beforeEach(() => {
    sim = new Simulation({ mapConfig: MAPS[0], seed: 123 });
    events = [];
    sim.bus.on('player:downed', () => events.push('downed'));
    sim.bus.on('player:revived', () => events.push('revived'));
    sim.bus.on('run:gameover', () => events.push('gameover'));
    sim.startRun();
  });

  function tick(n: number): void {
    const input = neutralInput();
    for (let i = 0; i < n; i++) sim.tick(DT, input);
  }

  function killPlayer(): void {
    sim.player.invulnUntil = -Infinity;
    sim.player.applyDamage(99_999, 0, 0, sim.time);
  }

  it('starts a run with the configured revive tokens', () => {
    expect(BALANCE.player.revives).toBeGreaterThan(0);
    expect(sim.revivesLeft).toBe(BALANCE.player.revives);
  });

  it('downs instead of game-over while tokens remain', () => {
    tick(1);
    killPlayer();
    tick(1);
    expect(events).toContain('downed');
    expect(events).not.toContain('gameover');
    expect(sim.player.alive).toBe(false);
    expect(sim.revivesLeft).toBe(BALANCE.player.revives - 1);
  });

  it('revives at the spawn point with temporary invulnerability', () => {
    tick(1);
    killPlayer();
    tick(Math.ceil((BALANCE.player.reviveDelaySec + 0.1) / DT));
    expect(events).toContain('revived');
    expect(sim.player.alive).toBe(true);
    expect(sim.player.health).toBe(sim.player.maxHealth);
    expect(sim.player.x).toBeCloseTo(sim.map.playerSpawn.x);
    expect(sim.player.z).toBeCloseTo(sim.map.playerSpawn.z);
    // Invulnerable right after revive: damage does not land.
    const dealt = sim.player.applyDamage(50, 0, 0, sim.time);
    expect(dealt).toBe(0);
    expect(events).not.toContain('gameover');
  });

  it('game-overs when tokens are exhausted', () => {
    tick(1);
    killPlayer();
    tick(Math.ceil((BALANCE.player.reviveDelaySec + 0.1) / DT));
    expect(sim.player.alive).toBe(true);
    // Burn past revive invulnerability, then kill again.
    tick(Math.ceil((BALANCE.player.respawnInvulnSec + 0.2) / DT));
    killPlayer();
    tick(2);
    expect(events).toContain('gameover');
    expect(sim.player.alive).toBe(false);
  });

  it('does not double-consume tokens while downed', () => {
    tick(1);
    killPlayer();
    tick(3); // several ticks inside the downed window
    expect(sim.revivesLeft).toBe(BALANCE.player.revives - 1);
    expect(events.filter((e) => e === 'downed')).toHaveLength(1);
  });
});
