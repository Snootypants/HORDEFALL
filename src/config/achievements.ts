import type { AchievementConfig } from './types';

export const ACHIEVEMENTS: AchievementConfig[] = [
  { id: 'first-blood', name: 'First Blood', description: 'Kill your first enemy', stat: 'kills', threshold: 1 },
  { id: 'centurion', name: 'Centurion', description: 'Kill 100 enemies in one run', stat: 'kills', threshold: 100 },
  { id: 'legion-slayer', name: 'Legion Slayer', description: 'Kill 500 enemies in one run', stat: 'kills', threshold: 500 },
  { id: 'skull-collector', name: 'Skull Collector', description: '50 headshots in one run', stat: 'headshots', threshold: 50 },
  { id: 'survivor-5', name: 'Foothold', description: 'Survive 5 waves', stat: 'wavesSurvived', threshold: 5 },
  { id: 'survivor-10', name: 'Entrenched', description: 'Survive 10 waves', stat: 'wavesSurvived', threshold: 10 },
  { id: 'survivor-20', name: 'Unkillable', description: 'Survive 20 waves', stat: 'wavesSurvived', threshold: 20 },
  { id: 'boss-down', name: 'Giantfall', description: 'Defeat a boss', stat: 'bossKills', threshold: 1 },
  { id: 'boss-hunter', name: 'Apex Predator', description: 'Defeat 3 bosses in one run', stat: 'bossKills', threshold: 3 },
  { id: 'high-roller', name: 'High Roller', description: 'Score 100,000 in one run', stat: 'score', threshold: 100000 },
  { id: 'evolved', name: 'Evolved', description: 'Reach level 10 in one run', stat: 'level', threshold: 10 },
  { id: 'regular', name: 'Regular', description: 'Complete 10 runs', stat: 'totalRuns', threshold: 10 },
];
