/**
 * Versioned persistence over a storage adapter (localStorage in the browser,
 * in-memory in tests). Handles v1→v2 migration, corrupted-save quarantine,
 * and JSON import/export.
 *
 * Versioning policy: bump SAVE_VERSION when the shape changes, add a step to
 * `migrateSave`, never mutate old steps. Unknown/future versions are backed
 * up to BACKUP_KEY and replaced with defaults — never silently destroyed.
 */

import { DEFAULT_KEYBINDS } from '../input/bindings';
import type { GameAction } from '../input/bindings';

export const SAVE_VERSION = 2;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface GraphicsSettings {
  quality: GraphicsQuality;
  shadows: boolean;
  particles: boolean;
  postProcessing: boolean;
  renderScale: number;
  maxDecals: number;
  maxCorpses: number;
  /** Live particle budget for effects (honored by ParticleSystem). */
  maxParticles: number;
}

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ui: number;
  weapons: number;
  enemies: number;
  ambient: number;
}

export interface SettingsData {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  mouseSensitivity: number;
  fov: number;
  invertY: boolean;
  keybinds: Record<GameAction, string>;
}

export interface HighScoreEntry {
  score: number;
  wave: number;
  dateIso: string;
  mapId: string;
}

export interface RunSummaryData {
  dateIso: string;
  mapId: string;
  seed: number;
  score: number;
  wave: number;
  timeSurvivedSec: number;
  kills: number;
  headshots: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  shotsHit: number;
  favoriteWeapon: string;
  level: number;
  upgradesChosen: string[];
  bossKills: number;
}

export interface SaveDataV2 {
  version: typeof SAVE_VERSION;
  settings: SettingsData;
  profile: {
    totalRuns: number;
    totalKills: number;
    totalPlaytimeSec: number;
    achievements: string[];
  };
  unlocks: {
    weapons: string[];
  };
  highScores: HighScoreEntry[];
  bestWave: number;
  runHistory: RunSummaryData[];
}

export function defaultSaveData(): SaveDataV2 {
  return {
    version: SAVE_VERSION,
    settings: {
      graphics: {
        quality: 'high',
        shadows: true,
        particles: true,
        postProcessing: true,
        renderScale: 1.0,
        maxDecals: 128,
        maxCorpses: 40,
        maxParticles: 2048,
      },
      audio: {
        master: 0.8,
        music: 0.5,
        sfx: 0.9,
        ui: 0.7,
        weapons: 0.9,
        enemies: 0.8,
        ambient: 0.6,
      },
      mouseSensitivity: 1.0,
      fov: 75,
      invertY: false,
      keybinds: { ...DEFAULT_KEYBINDS },
    },
    profile: {
      totalRuns: 0,
      totalKills: 0,
      totalPlaytimeSec: 0,
      achievements: [],
    },
    unlocks: {
      weapons: ['pistol'],
    },
    highScores: [],
    bestWave: 0,
    runHistory: [],
  };
}

interface SaveV1 {
  version: 1;
  highScore?: number;
  bestWave?: number;
  settings?: { volume?: number; sensitivity?: number };
  unlockedWeapons?: string[];
}

function migrateV1toV2(v1: SaveV1): SaveDataV2 {
  const out = defaultSaveData();
  if (typeof v1.highScore === 'number' && v1.highScore > 0) {
    out.highScores.push({
      score: v1.highScore,
      wave: v1.bestWave ?? 0,
      dateIso: 'migrated-v1',
      mapId: 'foundry',
    });
  }
  out.bestWave = v1.bestWave ?? 0;
  if (typeof v1.settings?.volume === 'number') {
    out.settings.audio.master = v1.settings.volume;
  }
  if (typeof v1.settings?.sensitivity === 'number') {
    out.settings.mouseSensitivity = v1.settings.sensitivity;
  }
  if (Array.isArray(v1.unlockedWeapons) && v1.unlockedWeapons.length > 0) {
    out.unlocks.weapons = [...v1.unlockedWeapons];
  }
  return out;
}

/**
 * Migrate any known historical save shape to the current version.
 * Returns null when the object is unrecognizable (treated as corrupt).
 */
export function migrateSave(raw: unknown): SaveDataV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const version = (raw as { version?: unknown }).version;
  if (version === 1) return migrateV1toV2(raw as SaveV1);
  if (version === SAVE_VERSION) {
    // Fill any missing fields from defaults (forward-compatible patching).
    const defaults = defaultSaveData();
    const data = raw as SaveDataV2;
    return {
      ...defaults,
      ...data,
      settings: {
        ...defaults.settings,
        ...data.settings,
        graphics: { ...defaults.settings.graphics, ...data.settings?.graphics },
        audio: { ...defaults.settings.audio, ...data.settings?.audio },
        keybinds: { ...defaults.settings.keybinds, ...data.settings?.keybinds },
      },
      profile: { ...defaults.profile, ...data.profile },
      unlocks: { ...defaults.unlocks, ...data.unlocks },
    };
  }
  return null;
}

export class SaveManager {
  static readonly KEY = 'horde.save';
  static readonly BACKUP_KEY = 'horde.save.backup';

  private readonly storage: StorageLike;
  private cache: SaveDataV2 | null = null;

  constructor(storage: StorageLike) {
    this.storage = storage;
  }

  load(): SaveDataV2 {
    if (this.cache) return this.cache;
    const raw = this.storage.getItem(SaveManager.KEY);
    if (raw === null) {
      this.cache = defaultSaveData();
      return this.cache;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.quarantine(raw);
      this.cache = defaultSaveData();
      return this.cache;
    }
    const migrated = migrateSave(parsed);
    if (!migrated) {
      this.quarantine(raw);
      this.cache = defaultSaveData();
      return this.cache;
    }
    this.cache = migrated;
    return this.cache;
  }

  private quarantine(raw: string): void {
    try {
      this.storage.setItem(SaveManager.BACKUP_KEY, raw);
    } catch {
      // Storage full or unavailable — defaults still work, nothing to do.
    }
  }

  save(data: SaveDataV2): void {
    this.cache = data;
    this.storage.setItem(SaveManager.KEY, JSON.stringify(data));
  }

  exportJson(): string {
    return JSON.stringify(this.load(), null, 2);
  }

  importJson(json: string): { ok: boolean; error?: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      return { ok: false, error: `Invalid JSON: ${(err as Error).message}` };
    }
    const migrated = migrateSave(parsed);
    if (!migrated) {
      return { ok: false, error: 'Unrecognized save format/version' };
    }
    this.save(migrated);
    return { ok: true };
  }
}
