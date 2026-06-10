import type { UpgradeConfig } from './types';

/**
 * Roguelite upgrade pool (24 entries). To add an upgrade: append an entry —
 * stat mods reference StatKey, behavior unlocks reference AbilityFlag. New
 * StatKeys/AbilityFlags must be added to types.ts and consumed in
 * progression/upgradeEffects.ts or the relevant sim system.
 * See README "How to add a new upgrade".
 */
export const UPGRADES: UpgradeConfig[] = [
  { id: 'quickhands', name: 'Quick Hands', description: '+15% reload speed', rarity: 'common', maxStacks: 5, mods: [{ stat: 'reloadSpeedMult', mult: 1.15 }], icon: '⟳' },
  { id: 'trigger-discipline', name: 'Trigger Discipline', description: '+10% fire rate', rarity: 'common', maxStacks: 5, mods: [{ stat: 'fireRateMult', mult: 1.1 }], icon: '⌖' },
  { id: 'juggernaut', name: 'Juggernaut Plating', description: '+25 max health', rarity: 'common', maxStacks: 5, mods: [{ stat: 'maxHealth', add: 25 }], icon: '♥' },
  { id: 'plated', name: 'Composite Plates', description: '+25 max armor', rarity: 'common', maxStacks: 4, mods: [{ stat: 'maxArmor', add: 25 }], icon: '▣' },
  { id: 'armor-tech', name: 'Reactive Armor', description: 'Armor regenerates 1.5/s', rarity: 'rare', maxStacks: 3, mods: [{ stat: 'armorRegenPerSec', add: 1.5 }], icon: '✚' },
  { id: 'explosive-rounds', name: 'Explosive Rounds', description: 'Bullets detonate for splash damage', rarity: 'epic', maxStacks: 1, grants: ['explosiveRounds'], icon: '✸' },
  { id: 'piercing', name: 'Penetrator Core', description: 'Shots pierce +1 enemy', rarity: 'rare', maxStacks: 3, mods: [{ stat: 'pierceBonus', add: 1 }], icon: '➸' },
  { id: 'ricochet', name: 'Ricochet Logic', description: 'Hitscan bounces to a nearby enemy', rarity: 'epic', maxStacks: 1, grants: ['ricochet'], icon: '↯' },
  { id: 'lifesteal', name: 'Hemophage Rounds', description: 'Heal 2% of damage dealt', rarity: 'rare', maxStacks: 3, mods: [{ stat: 'lifestealFrac', add: 0.02 }], icon: '❥' },
  { id: 'swift', name: 'Servo Boots', description: '+8% movement speed', rarity: 'common', maxStacks: 4, mods: [{ stat: 'moveSpeedMult', mult: 1.08 }], icon: '➤' },
  { id: 'deadeye', name: 'Deadeye Optics', description: '+7% crit chance', rarity: 'common', maxStacks: 5, mods: [{ stat: 'critChance', add: 0.07 }], icon: '◎' },
  { id: 'heavy-crits', name: 'Brutality Index', description: '+50% crit damage', rarity: 'rare', maxStacks: 3, mods: [{ stat: 'critMult', add: 0.5 }], icon: '✦' },
  { id: 'incendiary', name: 'Incendiary Payload', description: 'Shots ignite enemies (burn)', rarity: 'epic', maxStacks: 1, grants: ['fireRounds'], icon: '🜂' },
  { id: 'cryo', name: 'Cryo Payload', description: 'Shots chill enemies (slow/freeze)', rarity: 'epic', maxStacks: 1, grants: ['frostRounds'], icon: '❄' },
  { id: 'voltaic', name: 'Voltaic Payload', description: 'Shots shock and chain to neighbors', rarity: 'epic', maxStacks: 1, grants: ['shockRounds'], icon: '↯' },
  { id: 'extended-mags', name: 'Extended Magazines', description: '+25% magazine size', rarity: 'common', maxStacks: 4, mods: [{ stat: 'magSizeMult', mult: 1.25 }], icon: '▤' },
  { id: 'marathon', name: 'Marathon Lungs', description: '+25% stamina regen', rarity: 'common', maxStacks: 3, mods: [{ stat: 'staminaRegenMult', mult: 1.25 }], icon: '∿' },
  { id: 'drone', name: 'Hunter Drone', description: 'Deploys an autonomous attack drone', rarity: 'epic', maxStacks: 3, grants: ['drone'], icon: '✈' },
  { id: 'turret', name: 'Sentry Kit', description: 'Drops an auto-turret at your position each wave', rarity: 'epic', maxStacks: 2, grants: ['turret'], icon: '☖' },
  { id: 'ammo-magnet', name: 'Scavenger Field', description: '+50% pickup magnet radius', rarity: 'common', maxStacks: 3, mods: [{ stat: 'pickupRadiusMult', mult: 1.5 }], icon: '⊚' },
  { id: 'greed', name: 'Profiteer', description: '+20% credits earned', rarity: 'common', maxStacks: 4, mods: [{ stat: 'currencyGainMult', mult: 1.2 }], icon: '◈' },
  { id: 'chrono-field', name: 'Chrono Field', description: 'Enemies near you are slowed 20%', rarity: 'epic', maxStacks: 1, grants: ['slowAura'], icon: '◷' },
  { id: 'shield-burst', name: 'Failsafe Nova', description: 'Armor break releases a knockback nova', rarity: 'rare', maxStacks: 1, grants: ['shieldBurst'], icon: '◉' },
  { id: 'double-tap', name: 'Double Tap', description: '15% chance to fire a free second shot', rarity: 'rare', maxStacks: 3, mods: [{ stat: 'doubleShotChance', add: 0.15 }], icon: '∥' },
];

export const upgradeById = (id: string): UpgradeConfig | undefined =>
  UPGRADES.find((u) => u.id === id);
