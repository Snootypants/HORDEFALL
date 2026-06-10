import type { MapConfig } from './types';

/**
 * Map variants. Layout is generated from `seed` by sim/mapGen.ts — same seed,
 * same arena. Add a variant by appending an entry; the custom-seed option in
 * the menu clones the first entry with a player-provided seed.
 */
export const MAPS: MapConfig[] = [
  {
    id: 'foundry',
    name: 'Cinder Foundry',
    seed: 1337,
    size: 130,
    wallHeight: 6,
    crateCount: [26, 34],
    pillarCount: [10, 14],
    rampCount: [6, 8],
    platformCount: [5, 7],
    barrelCount: [10, 14],
    groundColor: 0x2a2226,
    wallColor: 0x3a2e30,
    propColor: 0x4d3b35,
    accentColor: 0xff7a2e,
    fogColor: 0x1a1114,
    fogDensity: 0.012,
    skyColor: 0x120a0d,
  },
  {
    id: 'ruins',
    name: 'Sunken Ruins',
    seed: 7741,
    size: 140,
    wallHeight: 6,
    crateCount: [20, 28],
    pillarCount: [16, 22],
    rampCount: [8, 10],
    platformCount: [6, 9],
    barrelCount: [6, 9],
    groundColor: 0x222b24,
    wallColor: 0x2e3a30,
    propColor: 0x3d4a3c,
    accentColor: 0x3ec9a7,
    fogColor: 0x0e1812,
    fogDensity: 0.016,
    skyColor: 0x081009,
  },
  {
    id: 'gridlock',
    name: 'Gridlock',
    seed: 9001,
    size: 120,
    wallHeight: 7,
    crateCount: [34, 44],
    pillarCount: [8, 10],
    rampCount: [5, 7],
    platformCount: [7, 10],
    barrelCount: [12, 16],
    groundColor: 0x1f2230,
    wallColor: 0x2b2f44,
    propColor: 0x383d57,
    accentColor: 0x7af2ff,
    fogColor: 0x0d0f1a,
    fogDensity: 0.010,
    skyColor: 0x070811,
  },
];

export const mapById = (id: string): MapConfig | undefined => MAPS.find((m) => m.id === id);
