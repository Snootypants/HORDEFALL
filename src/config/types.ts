/**
 * All data-driven config shapes. Balance designers edit the sibling data files
 * (weapons.ts, enemies.ts, ...) without touching engine code; validation.ts
 * checks every entry at startup and prints a report.
 */

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------

export type WeaponId = string;

export interface WeaponUpgradeTier {
  cost: number;
  damageMult?: number;
  rpmMult?: number;
  magBonus?: number;
  spreadMult?: number;
  reloadMult?: number;
  label: string;
}

export interface ProjectileSpec {
  speed: number;
  /** Downward acceleration (m/s^2); 0 for straight shots. */
  gravity: number;
  radius: number;
  lifetime: number;
  explosive?: { radius: number; damage: number };
  /** Energy weapon: arcs to additional nearby enemies. */
  chain?: { count: number; range: number; damageMult: number };
}

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  /** HUD slot and number-key (0 = melee fallback, 1-6 = guns). */
  slot: number;
  description: string;
  kind: 'hitscan' | 'projectile' | 'melee';
  auto: boolean;
  damage: number;
  pellets: number;
  headshotMult: number;
  rpm: number;
  spreadDeg: number;
  /** Extra spread accumulated per shot, decaying over time. */
  bloomPerShot: number;
  bloomMaxDeg: number;
  recoilPitchDeg: number;
  recoilYawDeg: number;
  magSize: number;
  reserveMax: number;
  startingReserve: number;
  reloadTime: number;
  range: number;
  falloffStart: number;
  falloffMinMult: number;
  /** Number of enemies a single hitscan shot can pass through (0 = stops at first). */
  pierce: number;
  projectile?: ProjectileSpec;
  tracerColor: number;
  muzzleColor: number;
  /** Synth profile key in the audio bank. */
  fireSound: string;
  reloadSound: string;
  upgrades: WeaponUpgradeTier[];
  unlockCost: number;
  unlockedByDefault: boolean;
  adsZoom?: number;
  /** Camera shake per shot (0..1) — sells weapon weight. */
  fireTrauma?: number;
  /** Melee weapons only: cone reach/width and impulse applied to victims. */
  melee?: { range: number; arcDeg: number; knockback: number };
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------

export type EnemyId = string;

export type EnemyRole = 'melee' | 'ranged' | 'exploder' | 'support' | 'boss';
export type EnemyShape = 'box' | 'sphere' | 'capsule' | 'cone' | 'crystal';

export interface BossPhase {
  /** Phase active while hp fraction is above this floor. */
  untilHpFraction: number;
  speedMult: number;
  /** Special attacks usable in this phase. */
  attacks: ('slam' | 'barrage' | 'summon' | 'charge')[];
  attackCooldown: number;
}

export interface EnemyConfig {
  id: EnemyId;
  name: string;
  role: EnemyRole;
  hp: number;
  speed: number;
  accel: number;
  radius: number;
  height: number;
  /** Melee hit or projectile damage. */
  damage: number;
  attackRange: number;
  attackCooldown: number;
  attackWindup: number;
  aggroRange: number;
  /** Ranged enemies hold roughly this distance. */
  preferredRange?: number;
  projectile?: { speed: number; radius: number; damage: number; color: number };
  explode?: { radius: number; damage: number; fuse: number };
  shield?: { hp: number; arcDeg: number };
  aura?: { radius: number; healPerSec: number; speedMult: number };
  boss?: { phases: BossPhase[]; weakPointRadius: number; weakPointMult: number; summons: EnemyId };
  xp: number;
  score: number;
  currencyMin: number;
  currencyMax: number;
  color: number;
  scale: number;
  shape: EnemyShape;
  /** Fraction of height counting as headshot zone (from the top). */
  headshotZone: number;
  /** Earliest wave this enemy can appear in. */
  minWave: number;
  /** Budget cost in wave composition. */
  cost: number;
  /** Relative pick weight in wave composition. */
  weight: number;
}

// ---------------------------------------------------------------------------
// Waves
// ---------------------------------------------------------------------------

export type WaveEventId = 'normal' | 'swarm' | 'elite' | 'fog' | 'ammo-scarce' | 'boss';

export interface WaveEventConfig {
  id: WaveEventId;
  name: string;
  description: string;
  minWave: number;
  weight: number;
  /** Multiplies the wave's enemy budget. */
  budgetMult: number;
  /** Elite waves stat-boost spawned enemies. */
  eliteChance?: number;
  fogDensityMult?: number;
  ammoDropMult?: number;
  /** Swarm: bias composition toward cheap enemies and inflate counts. */
  swarmBias?: boolean;
}

export interface WaveBalanceConfig {
  baseBudget: number;
  budgetPerWave: number;
  budgetGrowth: number;
  bossEvery: number;
  breakDuration: number;
  /** Spawn pacing. */
  spawnBatchSize: number;
  spawnBatchInterval: number;
  minSpawnDistance: number;
  maxSpawnDistance: number;
  /** Spawn points must be outside a cone this wide in front of the player (deg). */
  playerFovAvoidDeg: number;
  /** Budget multiplier range applied from prior-wave performance. */
  perfBudgetMin: number;
  perfBudgetMax: number;
  /** Run pace: expected seconds per completed wave; faster runs scale up. */
  paceTargetSecPerWave: number;
  /** Clamp range for the pace budget multiplier. */
  paceBudgetMin: number;
  paceBudgetMax: number;
  /** Budget multiplier per point of weapon power (unlocks + tiers). */
  weaponPowerBudgetFactor: number;
}

// ---------------------------------------------------------------------------
// Upgrades / progression
// ---------------------------------------------------------------------------

export type UpgradeRarity = 'common' | 'rare' | 'epic';

/** Numeric player stats modifiable by upgrades. */
export type StatKey =
  | 'maxHealth'
  | 'maxArmor'
  | 'armorRegenPerSec'
  | 'moveSpeedMult'
  | 'staminaRegenMult'
  | 'reloadSpeedMult'
  | 'fireRateMult'
  | 'damageMult'
  | 'critChance'
  | 'critMult'
  | 'magSizeMult'
  | 'lifestealFrac'
  | 'currencyGainMult'
  | 'xpGainMult'
  | 'pickupRadiusMult'
  | 'pierceBonus'
  | 'doubleShotChance';

/** Boolean abilities granted by upgrades. */
export type AbilityFlag =
  | 'explosiveRounds'
  | 'ricochet'
  | 'fireRounds'
  | 'frostRounds'
  | 'shockRounds'
  | 'drone'
  | 'turret'
  | 'slowAura'
  | 'shieldBurst';

export interface StatMod {
  stat: StatKey;
  add?: number;
  mult?: number;
}

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  rarity: UpgradeRarity;
  maxStacks: number;
  mods?: StatMod[];
  grants?: AbilityFlag[];
  icon: string;
}

// ---------------------------------------------------------------------------
// Status effects
// ---------------------------------------------------------------------------

export type StatusId = 'burning' | 'freezing' | 'poison' | 'shock' | 'slow' | 'stun' | 'bleed';

export interface StatusEffectConfig {
  id: StatusId;
  name: string;
  duration: number;
  /** Damage per second while active. */
  dps: number;
  /** Movement speed multiplier while active (1 = none). */
  speedMult: number;
  /** Hard stop (stun) — overrides speedMult while active. */
  immobilize: boolean;
  maxStacks: number;
  color: number;
}

/** burning+freezing → shatter, etc. Both sources are consumed. */
export interface StatusInteraction {
  a: StatusId;
  b: StatusId;
  result: 'shatter' | 'ignite' | 'overload';
  bonusDamage: number;
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------

export type PickupKind = 'health' | 'armor' | 'ammo' | 'credits' | 'weapon';

export interface PickupConfig {
  id: string;
  kind: PickupKind;
  amount: number;
  magnetRadius: number;
  lifetime: number;
  color: number;
  /** Relative drop weight. */
  weight: number;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export interface MapConfig {
  id: string;
  name: string;
  seed: number;
  size: number;
  wallHeight: number;
  crateCount: [number, number];
  pillarCount: [number, number];
  rampCount: [number, number];
  platformCount: [number, number];
  barrelCount: [number, number];
  groundColor: number;
  wallColor: number;
  propColor: number;
  accentColor: number;
  fogColor: number;
  fogDensity: number;
  skyColor: number;
}

// ---------------------------------------------------------------------------
// Global balance
// ---------------------------------------------------------------------------

export interface PlayerBalanceConfig {
  maxHealth: number;
  maxArmor: number;
  startingArmor: number;
  walkSpeed: number;
  sprintMult: number;
  crouchMult: number;
  jumpVelocity: number;
  gravity: number;
  staminaMax: number;
  staminaDrainPerSec: number;
  staminaRegenPerSec: number;
  staminaJumpCost: number;
  eyeHeight: number;
  crouchEyeHeight: number;
  radius: number;
  /** Armor absorbs this fraction of incoming damage while it lasts. */
  armorAbsorb: number;
  respawnInvulnSec: number;
  /** Revive tokens per run; 0 = permadeath. */
  revives: number;
  /** Downed-state delay before the revive fires. */
  reviveDelaySec: number;
}

export interface ProgressionBalanceConfig {
  xpBase: number;
  xpGrowth: number;
  comboWindow: number;
  comboMaxMult: number;
  comboPerKill: number;
  killStreakThresholds: number[];
  upgradeChoices: number;
  rarityWeights: Record<UpgradeRarity, number>;
}

export interface EnemyScalingConfig {
  hpPerWave: number;
  hpGrowth: number;
  damagePerWave: number;
  speedPerWave: number;
  speedCap: number;
  eliteHpMult: number;
  eliteDamageMult: number;
  eliteScale: number;
  bossHpPerBossNumber: number;
}

export interface EconomyConfig {
  ammoPrice: number;
  armorPrice: number;
  healthPrice: number;
  dropChance: number;
  /** Adaptive drops: max per-kind weight multiplier when a resource is empty. */
  adaptiveDropMaxBoost: number;
  /** Waves whose clear drops a weapon-unlock cache (acquisition pacing). */
  weaponCacheWaves: number[];
  /** Adaptive drops: extra health-weight boost contributed by empty armor. */
  lowArmorHealthBoost: number;
}

export interface BalanceConfig {
  player: PlayerBalanceConfig;
  progression: ProgressionBalanceConfig;
  enemyScaling: EnemyScalingConfig;
  economy: EconomyConfig;
  waves: WaveBalanceConfig;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  /** RunStats key the threshold applies to. */
  stat: 'kills' | 'headshots' | 'wavesSurvived' | 'bossKills' | 'score' | 'level' | 'totalRuns';
  threshold: number;
}
