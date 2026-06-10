/**
 * Procedural sound recipes — every SFX in the game is synthesized from
 * oscillators and filtered noise at play time. No audio assets.
 */

import type { BusName } from './AudioManager';

export interface SoundRecipe {
  bus: BusName;
  build: (ctx: AudioContext, out: AudioNode, volume: number) => void;
}

let noiseBuffer: AudioBuffer | null = null;

function getNoise(ctx: AudioContext): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** Filtered noise burst: the backbone of gunshots and impacts. */
function noiseBurst(
  ctx: AudioContext, out: AudioNode, volume: number,
  duration: number, filterFreq: number, filterQ: number, attack = 0.002,
): void {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq * (0.9 + Math.random() * 0.2);
  filter.Q.value = filterQ;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  src.connect(filter).connect(gain).connect(out);
  src.start();
  src.stop(ctx.currentTime + duration + 0.05);
}

/** Pitch-sweep tone: lasers, UI, level-ups. */
function sweep(
  ctx: AudioContext, out: AudioNode, volume: number,
  type: OscillatorType, from: number, to: number, duration: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(out);
  osc.start();
  osc.stop(ctx.currentTime + duration + 0.05);
}

/** Low thump: explosions, slams, heavy footfalls. */
function thump(ctx: AudioContext, out: AudioNode, volume: number, from = 120, duration = 0.5): void {
  sweep(ctx, out, volume, 'sine', from, 28, duration);
  noiseBurst(ctx, out, volume * 0.5, duration * 0.7, 220, 0.7);
}

export type SoundName =
  | 'pistol-fire' | 'shotgun-fire' | 'rifle-fire' | 'sniper-fire' | 'launcher-fire' | 'arc-fire'
  | 'reload-light' | 'reload-shell' | 'reload-mag' | 'reload-bolt' | 'reload-heavy' | 'reload-cell'
  | 'weapon-empty' | 'weapon-switch' | 'melee-swing'
  | 'enemy-hit' | 'enemy-die' | 'enemy-attack' | 'shield-break' | 'shield-deflect' | 'fuse-warning' | 'spit'
  | 'player-hurt' | 'player-die' | 'heartbeat'
  | 'explosion' | 'pickup' | 'levelup' | 'wave-start' | 'wave-clear' | 'boss-arrival'
  | 'ui-click' | 'ui-hover' | 'purchase' | 'achievement' | 'status-reaction';

export const SOUND_RECIPES: Record<SoundName, SoundRecipe> = {
  'pistol-fire': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.7, 0.12, 1600, 1.2); sweep(c, o, v * 0.3, 'square', 480, 120, 0.08); } },
  'shotgun-fire': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.95, 0.28, 700, 0.8); thump(c, o, v * 0.5, 150, 0.3); } },
  'rifle-fire': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.6, 0.09, 1900, 1.4); sweep(c, o, v * 0.2, 'sawtooth', 700, 200, 0.06); } },
  'sniper-fire': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v, 0.4, 900, 0.9); thump(c, o, v * 0.6, 200, 0.45); } },
  'launcher-fire': { bus: 'weapons', build: (c, o, v) => { thump(c, o, v * 0.8, 90, 0.3); noiseBurst(c, o, v * 0.4, 0.2, 500, 1); } },
  'arc-fire': { bus: 'weapons', build: (c, o, v) => { sweep(c, o, v * 0.5, 'sawtooth', 2400, 700, 0.1); noiseBurst(c, o, v * 0.3, 0.08, 3200, 3); } },
  'reload-light': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.35, 0.06, 2600, 4, 0.001); sweep(c, o, v * 0.15, 'square', 900, 1400, 0.05); } },
  'reload-shell': { bus: 'weapons', build: (c, o, v) => noiseBurst(c, o, v * 0.4, 0.08, 1400, 3) },
  'reload-mag': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.4, 0.07, 1900, 3.5); noiseBurst(c, o, v * 0.3, 0.05, 2400, 4); } },
  'reload-bolt': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.45, 0.1, 1100, 2.5); sweep(c, o, v * 0.2, 'square', 500, 300, 0.09); } },
  'reload-heavy': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.5, 0.14, 700, 2); thump(c, o, v * 0.2, 100, 0.15); } },
  'reload-cell': { bus: 'weapons', build: (c, o, v) => sweep(c, o, v * 0.35, 'triangle', 600, 1800, 0.22) },
  'weapon-empty': { bus: 'weapons', build: (c, o, v) => noiseBurst(c, o, v * 0.3, 0.04, 3000, 6, 0.001) },
  'weapon-switch': { bus: 'weapons', build: (c, o, v) => noiseBurst(c, o, v * 0.3, 0.07, 2000, 3) },
  'melee-swing': { bus: 'weapons', build: (c, o, v) => { noiseBurst(c, o, v * 0.45, 0.12, 1200, 0.6); sweep(c, o, v * 0.25, 'triangle', 500, 180, 0.12); } },

  'enemy-hit': { bus: 'enemies', build: (c, o, v) => noiseBurst(c, o, v * 0.4, 0.08, 500, 1.5) },
  'enemy-die': { bus: 'enemies', build: (c, o, v) => { sweep(c, o, v * 0.4, 'sawtooth', 300, 60, 0.3); noiseBurst(c, o, v * 0.3, 0.25, 400, 1); } },
  'enemy-attack': { bus: 'enemies', build: (c, o, v) => sweep(c, o, v * 0.4, 'sawtooth', 180, 90, 0.18) },
  'shield-break': { bus: 'enemies', build: (c, o, v) => { noiseBurst(c, o, v * 0.6, 0.3, 2800, 2); sweep(c, o, v * 0.3, 'triangle', 1800, 400, 0.25); } },
  'shield-deflect': { bus: 'enemies', build: (c, o, v) => { noiseBurst(c, o, v * 0.35, 0.05, 3600, 6, 0.001); sweep(c, o, v * 0.2, 'triangle', 2400, 1600, 0.06); } },
  'fuse-warning': { bus: 'enemies', build: (c, o, v) => { sweep(c, o, v * 0.5, 'square', 900, 1400, 0.1); sweep(c, o, v * 0.35, 'square', 1400, 2100, 0.12); } },
  spit: { bus: 'enemies', build: (c, o, v) => sweep(c, o, v * 0.35, 'triangle', 700, 250, 0.15) },

  'player-hurt': { bus: 'sfx', build: (c, o, v) => { thump(c, o, v * 0.5, 180, 0.2); noiseBurst(c, o, v * 0.3, 0.12, 350, 1); } },
  'player-die': { bus: 'sfx', build: (c, o, v) => { thump(c, o, v, 160, 1.2); sweep(c, o, v * 0.5, 'sawtooth', 220, 35, 1.0); } },
  heartbeat: { bus: 'sfx', build: (c, o, v) => { thump(c, o, v * 0.5, 70, 0.18); } },

  explosion: { bus: 'sfx', build: (c, o, v) => { thump(c, o, v, 140, 0.7); noiseBurst(c, o, v * 0.7, 0.5, 380, 0.6); } },
  pickup: { bus: 'sfx', build: (c, o, v) => sweep(c, o, v * 0.4, 'sine', 700, 1500, 0.12) },
  levelup: { bus: 'ui', build: (c, o, v) => { sweep(c, o, v * 0.4, 'triangle', 520, 1040, 0.3); sweep(c, o, v * 0.3, 'triangle', 780, 1560, 0.4); } },
  'wave-start': { bus: 'ui', build: (c, o, v) => { sweep(c, o, v * 0.5, 'sawtooth', 90, 220, 0.5); thump(c, o, v * 0.3, 100, 0.4); } },
  'wave-clear': { bus: 'ui', build: (c, o, v) => { sweep(c, o, v * 0.35, 'triangle', 660, 990, 0.25); sweep(c, o, v * 0.3, 'triangle', 990, 1320, 0.35); } },
  'boss-arrival': { bus: 'ui', build: (c, o, v) => { thump(c, o, v, 60, 1.4); sweep(c, o, v * 0.5, 'sawtooth', 110, 55, 1.2); } },

  'ui-click': { bus: 'ui', build: (c, o, v) => sweep(c, o, v * 0.3, 'square', 900, 600, 0.05) },
  'ui-hover': { bus: 'ui', build: (c, o, v) => sweep(c, o, v * 0.12, 'sine', 1200, 1400, 0.04) },
  purchase: { bus: 'ui', build: (c, o, v) => { sweep(c, o, v * 0.35, 'sine', 880, 1320, 0.1); sweep(c, o, v * 0.3, 'sine', 1320, 1760, 0.12); } },
  achievement: { bus: 'ui', build: (c, o, v) => { sweep(c, o, v * 0.4, 'triangle', 523, 1046, 0.25); sweep(c, o, v * 0.35, 'triangle', 659, 1318, 0.35); } },
  'status-reaction': { bus: 'sfx', build: (c, o, v) => { noiseBurst(c, o, v * 0.5, 0.2, 3400, 2.5); sweep(c, o, v * 0.3, 'sine', 2000, 500, 0.2); } },
};
