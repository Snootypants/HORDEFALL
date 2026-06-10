import type { StatusEffectConfig, StatusInteraction } from './types';

export const STATUS_EFFECTS: StatusEffectConfig[] = [
  { id: 'burning', name: 'Burning', duration: 3.0, dps: 12, speedMult: 1.0, immobilize: false, maxStacks: 3, color: 0xff7a2e },
  { id: 'freezing', name: 'Freezing', duration: 2.5, dps: 0, speedMult: 0.45, immobilize: false, maxStacks: 1, color: 0x9adcff },
  { id: 'poison', name: 'Poison', duration: 5.0, dps: 6, speedMult: 0.9, immobilize: false, maxStacks: 5, color: 0x86e83c },
  { id: 'shock', name: 'Shock', duration: 1.2, dps: 8, speedMult: 0.7, immobilize: false, maxStacks: 1, color: 0x7af2ff },
  { id: 'slow', name: 'Slowed', duration: 2.0, dps: 0, speedMult: 0.65, immobilize: false, maxStacks: 1, color: 0xb0b0d8 },
  { id: 'stun', name: 'Stunned', duration: 0.8, dps: 0, speedMult: 0, immobilize: true, maxStacks: 1, color: 0xfff06b },
  { id: 'bleed', name: 'Bleeding', duration: 4.0, dps: 9, speedMult: 1.0, immobilize: false, maxStacks: 4, color: 0xc42847 },
];

/**
 * Elemental combos: applying `b` to a target already affected by `a` (or vice
 * versa) consumes both and deals bonus damage.
 */
export const STATUS_INTERACTIONS: StatusInteraction[] = [
  { a: 'burning', b: 'freezing', result: 'shatter', bonusDamage: 45 },
  { a: 'poison', b: 'burning', result: 'ignite', bonusDamage: 30 },
  { a: 'shock', b: 'freezing', result: 'overload', bonusDamage: 35 },
];

export const statusById = (id: string): StatusEffectConfig | undefined =>
  STATUS_EFFECTS.find((s) => s.id === id);
