/**
 * The game-wide event map. Sim systems emit these; render/UI/audio subscribe.
 * This is the only legal channel for sim → presentation communication, which
 * is what keeps the sim headless-testable and multiplayer-portable.
 */

import type { WaveEventId } from '../config/types';
import type { EventBus } from '../core/EventBus';

export interface GameEvents {
  // Weapons
  'weapon:fired': { weaponId: string };
  'weapon:reload-start': { weaponId: string; duration: number };
  'weapon:reload-done': { weaponId: string };
  'weapon:empty': { weaponId: string };
  'weapon:switched': { weaponId: string };
  'weapon:recoil': { pitchDeg: number; yawDeg: number };
  tracer: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; color: number };
  impact: { x: number; y: number; z: number; nx: number; ny: number; nz: number; surface: 'world' | 'enemy' };
  explosion: { x: number; y: number; z: number; radius: number };
  'arc:chain': { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };

  // Enemies
  'enemy:spawned': { idx: number; enemyId: string; elite: boolean };
  'enemy:hit': { idx: number; x: number; y: number; z: number; damage: number; isCrit: boolean; isHead: boolean };
  'enemy:died': { idx: number; enemyId: string; x: number; y: number; z: number; xp: number; score: number; currency: number; isBoss: boolean; killedByPlayer: boolean };
  'enemy:attack': { enemyId: string; x: number; z: number };
  'enemy:shield-break': { idx: number; x: number; y: number; z: number };
  'status:reaction': { result: string; x: number; y: number; z: number; bonusDamage: number };

  // Boss
  'boss:spawned': { idx: number; name: string; maxHp: number };
  'boss:phase': { phase: number };
  'boss:attack': { attack: string };
  'boss:died': { x: number; y: number; z: number };

  // Player
  'player:damaged': { amount: number; fromX: number; fromZ: number; health: number; armor: number };
  'player:armor-break': Record<string, never>;
  'player:healed': { amount: number };
  'player:died': Record<string, never>;
  'player:downed': { revivesLeft: number; delay: number };
  'player:revived': { revivesLeft: number; invulnSec: number };
  'player:levelup': { level: number };
  'player:killstreak': { streak: number };
  'player:low-health': Record<string, never>;

  // Pickups / economy
  'pickup:collected': { kind: string; amount: number };
  'pickup:spawned': { idx: number };
  'currency:changed': { total: number };

  // Waves
  'wave:start': { wave: number; eventId: WaveEventId; name: string; description: string };
  'wave:cleared': { wave: number; clearTimeSec: number };
  'wave:break': { duration: number };
  'run:started': { seed: number; mapId: string };
  'run:gameover': Record<string, never>;

  // Companions / props
  'turret:placed': { x: number; z: number };
  'companion:fired': { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };
  'barrel:exploded': { x: number; y: number; z: number; radius: number };

  // Meta
  'achievement:unlocked': { id: string; name: string };
  'damage-number': { x: number; y: number; z: number; amount: number; isCrit: boolean };

  [key: string]: unknown;
}

export type GameBus = EventBus<GameEvents>;
