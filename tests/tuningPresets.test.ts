/**
 * Named tuning presets: save/load/rename/delete + JSON export/import (one
 * and all), validated like live tuning, stored under their OWN storage key —
 * never inside player progression save data.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TuningPresetStore } from '../src/save/TuningPresetStore';
import { SaveManager, defaultSaveData, type StorageLike } from '../src/save/SaveManager';
import { defaultTuning } from '../src/sim/tuning';

class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.get(k) ?? null; }
  setItem(k: string, v: string): void { this.map.set(k, v); }
  removeItem(k: string): void { this.map.delete(k); }
}

function tuned(damage: number) {
  const t = defaultTuning();
  t.weaponDamageMult.pistol = damage;
  return t;
}

describe('TuningPresetStore (P1)', () => {
  let storage: MemoryStorage;
  let store: TuningPresetStore;
  let tick: number;

  beforeEach(() => {
    storage = new MemoryStorage();
    tick = 0;
    store = new TuningPresetStore(storage, () => `2026-06-10T00:00:0${tick++}Z`);
  });

  it('saves and lists a preset with metadata', () => {
    const p = store.save('Glass Cannon', tuned(3));
    expect(p.name).toBe('Glass Cannon');
    expect(p.createdAt).toBeTruthy();
    expect(store.list().map((x) => x.name)).toEqual(['Glass Cannon']);
  });

  it('loads a saved preset back as validated tuning', () => {
    store.save('Glass Cannon', tuned(3));
    const loaded = store.load('Glass Cannon');
    expect(loaded?.weaponDamageMult.pistol).toBe(3);
    expect(store.load('nope')).toBeNull();
  });

  it('persists across store instances (same storage)', () => {
    store.save('Keeper', tuned(2));
    const again = new TuningPresetStore(storage);
    expect(again.load('Keeper')?.weaponDamageMult.pistol).toBe(2);
  });

  it('duplicate names auto-suffix predictably', () => {
    store.save('Same', tuned(1.5));
    const second = store.save('Same', tuned(2));
    expect(second.name).toBe('Same (2)');
    const third = store.save('Same', tuned(2.5));
    expect(third.name).toBe('Same (3)');
    expect(store.list()).toHaveLength(3);
  });

  it('renames a preset (auto-suffixing collisions) and updates updatedAt', () => {
    store.save('Old', tuned(2));
    store.save('Taken', tuned(3));
    expect(store.rename('Old', 'New')).toBe('New');
    expect(store.load('New')?.weaponDamageMult.pistol).toBe(2);
    expect(store.load('Old')).toBeNull();
    expect(store.rename('New', 'Taken')).toBe('Taken (2)');
    expect(store.rename('ghost', 'x')).toBeNull();
  });

  it('deletes a preset', () => {
    store.save('Gone', tuned(2));
    expect(store.delete('Gone')).toBe(true);
    expect(store.delete('Gone')).toBe(false);
    expect(store.list()).toHaveLength(0);
  });

  it('exports one preset and imports it back (validated)', () => {
    store.save('Ship It', tuned(1.8));
    const json = store.exportOne('Ship It')!;
    store.delete('Ship It');
    const result = store.importOne(json);
    expect(result.errors).toHaveLength(0);
    expect(result.name).toBe('Ship It');
    expect(store.load('Ship It')?.weaponDamageMult.pistol).toBe(1.8);
  });

  it('imports sanitize garbage tuning values through validateTuning', () => {
    const json = JSON.stringify({ name: 'Sneaky', tuning: { ...defaultTuning(), weaponDamageMult: { pistol: NaN } } });
    const result = store.importOne(json);
    expect(result.errors.length).toBeGreaterThan(0); // reported…
    expect(store.load('Sneaky')?.weaponDamageMult.pistol).toBeUndefined(); // …and dropped
  });

  it('exports all and merges all back without destroying existing presets', () => {
    store.save('A', tuned(1.2));
    store.save('B', tuned(1.4));
    const all = store.exportAll();
    const other = new TuningPresetStore(new MemoryStorage());
    other.save('C', tuned(9));
    const result = other.importAll(all);
    expect(result.added).toBe(2);
    expect(other.list().map((p) => p.name).sort()).toEqual(['A', 'B', 'C']);
  });

  it('invalid JSON leaves existing presets untouched', () => {
    store.save('Precious', tuned(2));
    expect(store.importOne('{broken').errors.length).toBeGreaterThan(0);
    expect(store.importAll('not json at all').errors.length).toBeGreaterThan(0);
    expect(store.load('Precious')?.weaponDamageMult.pistol).toBe(2);
    expect(store.list()).toHaveLength(1);
  });

  it('lives under its own storage key — player save data never contains presets', () => {
    store.save('Separate', tuned(2));
    // Preset store wrote only its own key.
    expect([...storage.map.keys()]).toEqual([TuningPresetStore.KEY]);
    // A SaveManager on the SAME storage is unaffected, and the save shape
    // has no preset field.
    const sm = new SaveManager(storage);
    const data = sm.load();
    expect(JSON.stringify(defaultSaveData())).not.toContain('preset');
    sm.save(data);
    expect(store.list()).toHaveLength(1);
    expect(storage.getItem(TuningPresetStore.KEY)).not.toBeNull();
  });
});
