/**
 * Named tuning presets: persisted under their OWN storage key, completely
 * separate from player progression (SaveManager). Every import runs through
 * validateTuning — bad payloads are reported and sanitized, and failed
 * imports never destroy existing presets. Duplicate names auto-suffix
 * ("Name (2)"). The clock is injectable so tests stay deterministic.
 */

import type { StorageLike } from './SaveManager';
import { defaultTuning, validateTuning, type TuningOverrides } from '../sim/tuning';

export interface TuningPreset {
  name: string;
  createdAt: string;
  updatedAt: string;
  tuning: TuningOverrides;
}

export class TuningPresetStore {
  static readonly KEY = 'hordefall-tuning-presets-v1';

  constructor(
    private readonly storage: StorageLike,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  /** All presets; a corrupt store reads as empty (next save rewrites it). */
  list(): TuningPreset[] {
    const raw = this.storage.getItem(TuningPresetStore.KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap((p) => {
        const entry = p as Partial<TuningPreset>;
        if (typeof entry?.name !== 'string') return [];
        const { value } = validateTuning(entry.tuning);
        return [{
          name: entry.name,
          createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : this.now(),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : this.now(),
          tuning: value,
        }];
      });
    } catch {
      return [];
    }
  }

  private write(presets: TuningPreset[]): void {
    this.storage.setItem(TuningPresetStore.KEY, JSON.stringify(presets));
  }

  /** "Name" → "Name (2)" → "Name (3)" until free. */
  private freeName(presets: TuningPreset[], wanted: string): string {
    if (!presets.some((p) => p.name === wanted)) return wanted;
    for (let n = 2; ; n++) {
      const candidate = `${wanted} (${n})`;
      if (!presets.some((p) => p.name === candidate)) return candidate;
    }
  }

  save(name: string, tuning: TuningOverrides): TuningPreset {
    const presets = this.list();
    const { value } = validateTuning(tuning);
    const stamp = this.now();
    const preset: TuningPreset = {
      name: this.freeName(presets, name.trim() || 'preset'),
      createdAt: stamp,
      updatedAt: stamp,
      tuning: value,
    };
    presets.push(preset);
    this.write(presets);
    return preset;
  }

  /** Validated copy of a preset's tuning, or null. */
  load(name: string): TuningOverrides | null {
    const preset = this.list().find((p) => p.name === name);
    if (!preset) return null;
    const fresh = defaultTuning();
    const { value } = validateTuning(preset.tuning);
    Object.assign(fresh, value);
    return fresh;
  }

  /** Returns the final (possibly suffixed) new name, or null if not found. */
  rename(oldName: string, newName: string): string | null {
    const presets = this.list();
    const preset = presets.find((p) => p.name === oldName);
    if (!preset) return null;
    preset.name = this.freeName(presets.filter((p) => p !== preset), newName.trim() || oldName);
    preset.updatedAt = this.now();
    this.write(presets);
    return preset.name;
  }

  delete(name: string): boolean {
    const presets = this.list();
    const next = presets.filter((p) => p.name !== name);
    if (next.length === presets.length) return false;
    this.write(next);
    return true;
  }

  exportOne(name: string): string | null {
    const preset = this.list().find((p) => p.name === name);
    return preset ? JSON.stringify(preset, null, 2) : null;
  }

  /** Import a single preset JSON; reports validation errors, never throws. */
  importOne(json: string): { name: string | null; errors: string[] } {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return { name: null, errors: [`invalid JSON: ${String(e)}`] };
    }
    const entry = raw as Partial<TuningPreset>;
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') {
      return { name: null, errors: ['preset: expected an object with a name'] };
    }
    const { value, errors } = validateTuning(entry.tuning);
    const saved = this.save(entry.name, value);
    return { name: saved.name, errors };
  }

  exportAll(): string {
    return JSON.stringify(this.list(), null, 2);
  }

  /** Merge a preset-array JSON in; invalid entries are skipped + reported. */
  importAll(json: string): { added: number; errors: string[] } {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch (e) {
      return { added: 0, errors: [`invalid JSON: ${String(e)}`] };
    }
    if (!Array.isArray(raw)) return { added: 0, errors: ['expected a JSON array of presets'] };
    const errors: string[] = [];
    let added = 0;
    for (const item of raw) {
      const entry = item as Partial<TuningPreset>;
      if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') {
        errors.push('skipped a preset without a name');
        continue;
      }
      const { value, errors: tuningErrors } = validateTuning(entry.tuning);
      errors.push(...tuningErrors.map((e) => `${entry.name}: ${e}`));
      this.save(entry.name, value);
      added++;
    }
    return { added, errors };
  }
}
