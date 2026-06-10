/**
 * The ONLY place game events become sounds. Subscribes the AudioManager to
 * the sim's event bus; returns an unsubscribe-all for run teardown.
 */

import type { GameBus } from '../sim/events';
import type { AudioManager } from './AudioManager';
import type { SoundName } from './synth';
import { weaponById } from '../config/weapons';

export function wireAudio(bus: GameBus, audio: AudioManager): () => void {
  const subs: (() => void)[] = [];

  subs.push(bus.on('weapon:fired', (e) => {
    const cfg = weaponById(e.weaponId);
    audio.play((cfg?.fireSound ?? 'pistol-fire') as SoundName, 1, 25);
  }));
  subs.push(bus.on('weapon:reload-start', (e) => {
    const cfg = weaponById(e.weaponId);
    audio.play((cfg?.reloadSound ?? 'reload-light') as SoundName);
  }));
  subs.push(bus.on('weapon:reload-done', () => audio.play('reload-light', 0.7)));
  subs.push(bus.on('weapon:empty', () => audio.play('weapon-empty')));
  subs.push(bus.on('weapon:switched', () => audio.play('weapon-switch')));

  subs.push(bus.on('enemy:hit', () => audio.play('enemy-hit', 0.8, 60)));
  subs.push(bus.on('enemy:died', () => audio.play('enemy-die', 0.9, 70)));
  subs.push(bus.on('enemy:attack', () => audio.play('enemy-attack', 0.8, 90)));
  subs.push(bus.on('enemy:shield-break', () => audio.play('shield-break')));
  subs.push(bus.on('status:reaction', () => audio.play('status-reaction')));

  subs.push(bus.on('player:damaged', () => audio.play('player-hurt', 1, 150)));
  subs.push(bus.on('player:died', () => audio.play('player-die')));
  subs.push(bus.on('player:revived', () => audio.play('levelup')));
  subs.push(bus.on('player:low-health', () => audio.play('heartbeat', 1, 800)));
  subs.push(bus.on('player:levelup', () => audio.play('levelup')));

  subs.push(bus.on('explosion', () => audio.play('explosion', 1, 60)));
  subs.push(bus.on('pickup:collected', () => audio.play('pickup', 0.9, 80)));
  subs.push(bus.on('wave:start', (e) => audio.play(e.eventId === 'boss' ? 'boss-arrival' : 'wave-start')));
  subs.push(bus.on('wave:cleared', () => audio.play('wave-clear')));
  subs.push(bus.on('boss:spawned', () => audio.play('boss-arrival')));
  subs.push(bus.on('achievement:unlocked', () => audio.play('achievement')));

  return () => subs.forEach((unsub) => unsub());
}
