/**
 * Live tuning overrides — a validated layer over shipped config, owned by
 * the session (NOT the save file) and read by sim systems at application
 * points. Multipliers default to absent (= 1 / config value); source config
 * objects are never mutated.
 *
 * Live vs future-spawn: weapon damage, drop chance, pickup weights, and tier
 * disables apply immediately; enemy hp/speed/damage are baked at spawn, so
 * they affect FUTURE spawns only. The tuning console labels both.
 */

export interface TuningOverrides {
  /** ×damage per weapon id. LIVE. */
  weaponDamageMult: Record<string, number>;
  /** ×hp per enemy id. FUTURE SPAWNS. */
  enemyHpMult: Record<string, number>;
  /** ×move speed per enemy id. FUTURE SPAWNS. */
  enemySpeedMult: Record<string, number>;
  /** ×touch/projectile/explosion damage per enemy id. FUTURE SPAWNS. */
  enemyDamageMult: Record<string, number>;
  /** Global drop chance override, or null = shipped config. LIVE. */
  dropChance: number | null;
  /** ×drop weight per pickup id. LIVE. */
  pickupWeightMult: Record<string, number>;
  /** Disabled upgrade tier indices per weapon id. LIVE. */
  disabledTiers: Record<string, number[]>;
}

export const MULT_MIN = 0;
export const MULT_MAX = 100;

export function defaultTuning(): TuningOverrides {
  return {
    weaponDamageMult: {},
    enemyHpMult: {},
    enemySpeedMult: {},
    enemyDamageMult: {},
    dropChance: null,
    pickupWeightMult: {},
    disabledTiers: {},
  };
}

function validMult(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= MULT_MIN && v <= MULT_MAX;
}

function sanitizeMultMap(raw: unknown, field: string, errors: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object') {
    errors.push(`${field}: expected an object`);
    return out;
  }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (validMult(v)) out[k] = v;
    else errors.push(`${field}.${k}: must be a finite number in [${MULT_MIN}, ${MULT_MAX}]`);
  }
  return out;
}

/**
 * Validate/sanitize an untrusted tuning payload (imported JSON, UI edits).
 * Invalid fields are dropped to defaults and reported — never thrown.
 */
export function validateTuning(raw: unknown): { value: TuningOverrides; errors: string[] } {
  const errors: string[] = [];
  const value = defaultTuning();
  if (!raw || typeof raw !== 'object') {
    errors.push('tuning: expected an object');
    return { value, errors };
  }
  const r = raw as Record<string, unknown>;
  value.weaponDamageMult = sanitizeMultMap(r.weaponDamageMult, 'weaponDamageMult', errors);
  value.enemyHpMult = sanitizeMultMap(r.enemyHpMult, 'enemyHpMult', errors);
  value.enemySpeedMult = sanitizeMultMap(r.enemySpeedMult, 'enemySpeedMult', errors);
  value.enemyDamageMult = sanitizeMultMap(r.enemyDamageMult, 'enemyDamageMult', errors);

  if (r.dropChance === null || r.dropChance === undefined) value.dropChance = null;
  else if (typeof r.dropChance === 'number' && Number.isFinite(r.dropChance) && r.dropChance >= 0 && r.dropChance <= 1) {
    value.dropChance = r.dropChance;
  } else errors.push('dropChance: must be null or a number in [0, 1]');

  value.pickupWeightMult = sanitizeMultMap(r.pickupWeightMult, 'pickupWeightMult', errors);

  if (r.disabledTiers !== undefined && r.disabledTiers !== null) {
    if (typeof r.disabledTiers !== 'object') errors.push('disabledTiers: expected an object');
    else {
      for (const [k, v] of Object.entries(r.disabledTiers as Record<string, unknown>)) {
        if (Array.isArray(v) && v.every((t) => Number.isInteger(t) && t >= 0)) {
          value.disabledTiers[k] = [...(v as number[])];
        } else errors.push(`disabledTiers.${k}: must be an array of non-negative tier indices`);
      }
    }
  }
  return { value, errors };
}

export function serializeTuning(t: TuningOverrides): string {
  return JSON.stringify(t, null, 2);
}

export function parseTuningJson(text: string): { value: TuningOverrides; errors: string[] } {
  try {
    return validateTuning(JSON.parse(text));
  } catch (e) {
    return { value: defaultTuning(), errors: [`invalid JSON: ${String(e)}`] };
  }
}

/** Copy `from` into `into` in place (the sim holds one stable reference). */
export function applyTuning(into: TuningOverrides, from: TuningOverrides): void {
  into.weaponDamageMult = { ...from.weaponDamageMult };
  into.enemyHpMult = { ...from.enemyHpMult };
  into.enemySpeedMult = { ...from.enemySpeedMult };
  into.enemyDamageMult = { ...from.enemyDamageMult };
  into.dropChance = from.dropChance;
  into.pickupWeightMult = { ...from.pickupWeightMult };
  into.disabledTiers = Object.fromEntries(Object.entries(from.disabledTiers).map(([k, v]) => [k, [...v]]));
}
