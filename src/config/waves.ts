import type { WaveEventConfig } from './types';

/**
 * Wave event deck. The generator rolls one event per non-boss wave using
 * these weights (boss waves are forced every `bossEvery` waves). To add a
 * wave modifier: append an entry and handle its fields in WaveDirector.
 */
export const WAVE_EVENTS: WaveEventConfig[] = [
  {
    id: 'normal',
    name: 'Standard Assault',
    description: 'The horde advances.',
    minWave: 1,
    weight: 100,
    budgetMult: 1.0,
  },
  {
    id: 'swarm',
    name: 'Swarm',
    description: 'A flood of weak enemies.',
    minWave: 3,
    weight: 30,
    budgetMult: 1.35,
    swarmBias: true,
  },
  {
    id: 'elite',
    name: 'Elite Vanguard',
    description: 'Hardened enemies with boosted stats.',
    minWave: 5,
    weight: 25,
    budgetMult: 0.8,
    eliteChance: 0.45,
  },
  {
    id: 'fog',
    name: 'Rolling Fog',
    description: 'Visibility collapses. Listen carefully.',
    minWave: 4,
    weight: 20,
    budgetMult: 0.9,
    fogDensityMult: 4.0,
  },
  {
    id: 'ammo-scarce',
    name: 'Supply Drought',
    description: 'Ammo drops are rare this wave.',
    minWave: 6,
    weight: 18,
    budgetMult: 0.85,
    ammoDropMult: 0.25,
  },
  {
    id: 'boss',
    name: 'Apex Signal',
    description: 'Something enormous approaches.',
    minWave: 5,
    weight: 0, // never rolled; forced by bossEvery
    budgetMult: 0.5,
  },
];
