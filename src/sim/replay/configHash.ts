/**
 * Stable hash over every gameplay-affecting config table. A replay recorded
 * under one config refuses validation under another — silent "success"
 * against changed balance data would be a lie.
 */

import { WEAPONS } from '../../config/weapons';
import { ENEMIES } from '../../config/enemies';
import { WAVE_EVENTS } from '../../config/waves';
import { UPGRADES } from '../../config/upgrades';
import { PICKUPS } from '../../config/pickups';
import { MAPS } from '../../config/maps';
import { BALANCE } from '../../config/balance';
import { STATUS_EFFECTS, STATUS_INTERACTIONS } from '../../config/statusEffects';
import { fnv1a } from './digest';

/** JSON.stringify with recursively sorted object keys (order-independent). */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

export function configHash(): string {
  return fnv1a(stableStringify({
    weapons: WEAPONS,
    enemies: ENEMIES,
    waveEvents: WAVE_EVENTS,
    upgrades: UPGRADES,
    pickups: PICKUPS,
    maps: MAPS,
    balance: BALANCE,
    statusEffects: STATUS_EFFECTS,
    statusInteractions: STATUS_INTERACTIONS,
  }));
}
