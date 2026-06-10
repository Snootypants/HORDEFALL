import { describe, expect, test } from 'vitest';
import { SaveManager, SAVE_VERSION, defaultSaveData, migrateSave } from '../src/save/SaveManager';
import type { StorageLike } from '../src/save/SaveManager';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const V1_SAVE = {
  version: 1,
  highScore: 42_000,
  bestWave: 11,
  settings: { volume: 0.7, sensitivity: 1.4 },
  unlockedWeapons: ['pistol', 'shotgun'],
};

describe('SaveManager', () => {
  test('load with empty storage returns current-version defaults', () => {
    const sm = new SaveManager(new MemoryStorage());
    const data = sm.load();
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.unlocks.weapons).toContain('pistol');
  });

  test('save/load roundtrip preserves data', () => {
    const storage = new MemoryStorage();
    const sm = new SaveManager(storage);
    const data = sm.load();
    data.profile.totalKills = 1234;
    data.highScores.push({ score: 999, wave: 3, dateIso: '2026-06-10', mapId: 'foundry' });
    sm.save(data);
    const again = new SaveManager(storage).load();
    expect(again.profile.totalKills).toBe(1234);
    expect(again.highScores[0].score).toBe(999);
  });

  test('migrates v1 saves preserving meaningful fields', () => {
    const storage = new MemoryStorage();
    storage.setItem(SaveManager.KEY, JSON.stringify(V1_SAVE));
    const sm = new SaveManager(storage);
    const data = sm.load();
    expect(data.version).toBe(SAVE_VERSION);
    expect(data.highScores.length).toBe(1);
    expect(data.highScores[0].score).toBe(42_000);
    expect(data.highScores[0].wave).toBe(11);
    expect(data.unlocks.weapons).toEqual(['pistol', 'shotgun']);
    expect(data.settings.audio.master).toBeCloseTo(0.7);
    expect(data.settings.mouseSensitivity).toBeCloseTo(1.4);
  });

  test('migrateSave is a pure function usable on raw objects', () => {
    const out = migrateSave(V1_SAVE);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(SAVE_VERSION);
    expect(out!.highScores[0].score).toBe(42_000);
  });

  test('corrupted JSON falls back to defaults and writes a backup', () => {
    const storage = new MemoryStorage();
    storage.setItem(SaveManager.KEY, '{not valid json!!!');
    const sm = new SaveManager(storage);
    const data = sm.load();
    expect(data.version).toBe(SAVE_VERSION);
    expect(storage.getItem(SaveManager.BACKUP_KEY)).toContain('not valid');
  });

  test('save from an unknown future version is backed up and replaced with defaults', () => {
    const storage = new MemoryStorage();
    storage.setItem(SaveManager.KEY, JSON.stringify({ version: 99, alien: true }));
    const data = new SaveManager(storage).load();
    expect(data.version).toBe(SAVE_VERSION);
    expect(storage.getItem(SaveManager.BACKUP_KEY)).toContain('"version":99');
  });

  test('exportJson produces parseable JSON at the current version', () => {
    const sm = new SaveManager(new MemoryStorage());
    sm.load();
    const json = sm.exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(SAVE_VERSION);
  });

  test('importJson accepts a valid export and persists it', () => {
    const a = new SaveManager(new MemoryStorage());
    const data = a.load();
    data.profile.totalRuns = 77;
    a.save(data);
    const exported = a.exportJson();

    const storageB = new MemoryStorage();
    const b = new SaveManager(storageB);
    const result = b.importJson(exported);
    expect(result.ok).toBe(true);
    expect(b.load().profile.totalRuns).toBe(77);
  });

  test('importJson rejects garbage without destroying existing data', () => {
    const storage = new MemoryStorage();
    const sm = new SaveManager(storage);
    const data = sm.load();
    data.profile.totalRuns = 5;
    sm.save(data);
    const result = sm.importJson('o hai');
    expect(result.ok).toBe(false);
    expect(sm.load().profile.totalRuns).toBe(5);
  });

  test('importJson migrates a v1 export', () => {
    const sm = new SaveManager(new MemoryStorage());
    const result = sm.importJson(JSON.stringify(V1_SAVE));
    expect(result.ok).toBe(true);
    expect(sm.load().highScores[0].score).toBe(42_000);
  });

  test('defaultSaveData starts with sane settings', () => {
    const d = defaultSaveData();
    expect(d.settings.audio.master).toBeGreaterThan(0);
    expect(d.settings.graphics.quality).toBeDefined();
    expect(Object.keys(d.settings.keybinds).length).toBeGreaterThan(5);
  });
});
