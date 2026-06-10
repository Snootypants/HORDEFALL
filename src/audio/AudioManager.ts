/**
 * Centralized audio: one WebAudio context, a gain-node bus tree
 * (master → music/sfx/ui/weapons/enemies/ambient), and a registry of
 * synthesized sound recipes. Gameplay code NEVER plays sounds directly —
 * audioWiring.ts subscribes to game events and calls play() here.
 */

import type { AudioSettings } from '../save/SaveManager';
import { SOUND_RECIPES, type SoundName } from './synth';

export type BusName = 'music' | 'sfx' | 'ui' | 'weapons' | 'enemies' | 'ambient';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly buses = new Map<BusName, GainNode>();
  private settings: AudioSettings;
  private musicTimer: number | null = null;
  private musicStep = 0;
  /** Per-sound throttling so 500 enemies don't stack 500 identical sounds. */
  private readonly lastPlayed = new Map<string, number>();

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      for (const name of ['music', 'sfx', 'ui', 'weapons', 'enemies', 'ambient'] as BusName[]) {
        const gain = this.ctx.createGain();
        gain.connect(this.masterGain);
        this.buses.set(name, gain);
      }
      this.applySettings(this.settings);
      this.startMusic();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applySettings(s: AudioSettings): void {
    this.settings = s;
    if (!this.ctx || !this.masterGain) return;
    this.masterGain.gain.value = s.master;
    this.buses.get('music')!.gain.value = s.music;
    this.buses.get('sfx')!.gain.value = s.sfx;
    this.buses.get('ui')!.gain.value = s.ui;
    this.buses.get('weapons')!.gain.value = s.weapons;
    this.buses.get('enemies')!.gain.value = s.enemies;
    this.buses.get('ambient')!.gain.value = s.ambient;
  }

  /** Play a named synthesized sound on its bus, with throttling and volume. */
  play(name: SoundName, volume = 1, throttleMs = 35): void {
    if (!this.ctx) return;
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < throttleMs) return;
    this.lastPlayed.set(name, now);

    const recipe = SOUND_RECIPES[name];
    if (!recipe) return;
    const bus = this.buses.get(recipe.bus);
    if (!bus) return;
    try {
      recipe.build(this.ctx, bus, volume);
    } catch {
      // Audio failures must never break gameplay.
    }
  }

  /**
   * Procedural ambient music: a dark drone plus a slow minor-pentatonic
   * arpeggio, scheduled in steps. Zero assets.
   */
  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const ctx = this.ctx;
    const bus = this.buses.get('music')!;

    // Continuous low drone
    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 55; // A1
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 180;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.14;
    drone.connect(droneFilter).connect(droneGain).connect(bus);
    drone.start();
    const drone2 = ctx.createOscillator();
    drone2.type = 'sawtooth';
    drone2.frequency.value = 55.7; // slow beat-frequency shimmer
    drone2.connect(droneFilter);
    drone2.start();

    // Arpeggio: A minor pentatonic, sparse
    const scale = [110, 130.81, 146.83, 164.81, 196.0, 220];
    const step = (): void => {
      if (Math.random() < 0.6) {
        const freq = scale[this.musicStep % scale.length];
        this.musicStep += Math.random() < 0.3 ? 2 : 1;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq * (Math.random() < 0.2 ? 2 : 1);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.6);
        osc.connect(g).connect(bus);
        osc.start();
        osc.stop(ctx.currentTime + 1.7);
      }
    };
    this.musicTimer = window.setInterval(step, 700);
  }

  dispose(): void {
    if (this.musicTimer !== null) window.clearInterval(this.musicTimer);
    void this.ctx?.close();
    this.ctx = null;
  }
}
