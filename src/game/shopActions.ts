/**
 * Between-wave shop purchases: the pure logic lives in sim/shopLogic (so
 * replays can re-apply purchases); this wrapper adds the purchase sound.
 */

import type { Simulation } from '../sim/Simulation';
import type { AudioManager } from '../audio/AudioManager';
import { applyShopPurchase, type ShopItemKind } from '../sim/shopLogic';

export type { ShopItemKind } from '../sim/shopLogic';

export function buyShopItem(sim: Simulation, audio: AudioManager, kind: ShopItemKind): boolean {
  const ok = applyShopPurchase(sim, kind);
  if (ok) audio.play('purchase');
  return ok;
}
