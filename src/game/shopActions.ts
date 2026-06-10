/**
 * Between-wave shop purchases: credit checks and effect application. Kept
 * out of Game.ts so the orchestrator stays focused on lifecycle.
 */

import { BALANCE } from '../config/balance';
import type { Simulation } from '../sim/Simulation';
import type { AudioManager } from '../audio/AudioManager';

export type ShopItemKind = 'ammo' | 'health' | 'armor' | `unlock:${string}` | `tier:${string}`;

export function buyShopItem(sim: Simulation, audio: AudioManager, kind: ShopItemKind): boolean {
  const eco = BALANCE.economy;
  const tryBuy = (price: number, apply: () => void): boolean => {
    if (sim.credits < price) return false;
    sim.credits -= price;
    apply();
    audio.play('purchase');
    return true;
  };
  if (kind === 'ammo') {
    // Refill a gun that actually needs ammo; never charge for a no-op
    // (melee equipped with full guns, or every reserve already full).
    const target = sim.weapons.ammoRefillTarget();
    if (!target) return false;
    return tryBuy(eco.ammoPrice, () => sim.weapons.refillWeapon(target.id));
  }
  if (kind === 'health') return tryBuy(eco.healthPrice, () => sim.player.heal(50));
  if (kind === 'armor') return tryBuy(eco.armorPrice, () => sim.player.addArmor(50));
  if (kind.startsWith('unlock:')) {
    const id = kind.slice(7);
    const cfg = sim.weapons.weapons.find((w) => w.id === id);
    if (!cfg) return false;
    return tryBuy(cfg.unlockCost, () => sim.weapons.unlock(id));
  }
  if (kind.startsWith('tier:')) {
    const id = kind.slice(5);
    const cfg = sim.weapons.weapons.find((w) => w.id === id);
    const rt = sim.weapons.runtime.get(id);
    if (!cfg || !rt || rt.tier >= cfg.upgrades.length) return false;
    return tryBuy(cfg.upgrades[rt.tier].cost, () => sim.weapons.buyUpgradeTier(id));
  }
  return false;
}
