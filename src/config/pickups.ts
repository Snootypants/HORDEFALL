import type { PickupConfig } from './types';

export const PICKUPS: PickupConfig[] = [
  { id: 'health-small', kind: 'health', amount: 20, magnetRadius: 2.5, lifetime: 25, color: 0xff4d6b, weight: 30 },
  { id: 'health-large', kind: 'health', amount: 50, magnetRadius: 2.5, lifetime: 25, color: 0xff2952, weight: 8 },
  { id: 'armor-shard', kind: 'armor', amount: 15, magnetRadius: 2.5, lifetime: 25, color: 0x4da3ff, weight: 18 },
  { id: 'ammo-box', kind: 'ammo', amount: 0.25, magnetRadius: 3.0, lifetime: 25, color: 0xffc46b, weight: 34 },
  { id: 'credits-small', kind: 'credits', amount: 10, magnetRadius: 4.0, lifetime: 30, color: 0xb8ff5e, weight: 25 },
  { id: 'credits-large', kind: 'credits', amount: 40, magnetRadius: 4.0, lifetime: 30, color: 0x86ff2e, weight: 6 },
  // Wave-clear reward only (weight 0 — never a random drop): unlocks the
  // cheapest still-locked gun on collection.
  { id: 'weapon-cache', kind: 'weapon', amount: 1, magnetRadius: 6.0, lifetime: 120, color: 0xffe14d, weight: 0 },
];
