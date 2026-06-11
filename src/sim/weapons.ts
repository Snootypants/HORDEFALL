/**
 * Weapon runtime: firing (hitscan + projectile), spread/bloom, reload,
 * switching, ammo, purchased upgrade tiers. All balance comes from
 * WeaponConfig; all player modifiers come from the computed stat sheet.
 */

import type { WeaponConfig } from '../config/types';
import type { InputCommand } from './inputCommand';
import type { CombatContext } from './combat/context';
import type { GameBus } from './events';
import type { Rng } from '../core/Rng';
import { swingMelee } from './combat/melee';
import { firePellet } from './combat/hitscan';
import { defaultTuning, type TuningOverrides } from './tuning';
import { effectiveWeaponStats, type EffectiveWeaponStats } from './weaponStats';
import type { PlayerProjectiles } from './projectiles';
import { clamp } from '../core/math';

export interface WeaponRuntime {
  mag: number;
  reserve: number;
  /** Purchased upgrade tiers (0..cfg.upgrades.length). */
  tier: number;
  unlocked: boolean;
}

export type { EffectiveWeaponStats } from './weaponStats';

export interface FireView {
  ox: number;
  oy: number;
  oz: number;
  dx: number;
  dy: number;
  dz: number;
}

export class WeaponSim {
  readonly weapons: WeaponConfig[];
  readonly runtime = new Map<string, WeaponRuntime>();
  currentId: string;
  cooldown = 0;
  reloading = false;
  reloadLeft = 0;
  switchLeft = 0;
  bloom = 0;

  private readonly bus: GameBus;
  private readonly rng: Rng;

  private readonly tuning: TuningOverrides;
  /** Profile-grade unlocks (defaults + save + shop). Dev/tuning never add here. */
  private readonly persistentUnlocks = new Set<string>();

  constructor(weapons: WeaponConfig[], unlockedIds: string[], bus: GameBus, rng: Rng, tuning: TuningOverrides = defaultTuning()) {
    this.weapons = weapons;
    this.bus = bus;
    this.rng = rng;
    this.tuning = tuning;
    for (const w of weapons) {
      const unlocked = w.unlockedByDefault || unlockedIds.includes(w.id);
      if (unlocked) this.persistentUnlocks.add(w.id);
      this.runtime.set(w.id, {
        mag: w.magSize,
        reserve: w.startingReserve,
        tier: 0,
        unlocked,
      });
    }
    // Start with the first unlocked GUN; melee is a fallback, not a loadout.
    this.currentId =
      weapons.find((w) => w.kind !== 'melee' && this.runtime.get(w.id)!.unlocked)?.id ??
      weapons.find((w) => this.runtime.get(w.id)!.unlocked)?.id ??
      weapons[0].id;
  }

  get current(): WeaponConfig {
    return this.weapons.find((w) => w.id === this.currentId)!;
  }

  state(id = this.currentId): WeaponRuntime {
    return this.runtime.get(id)!;
  }

  /** Aggregate ammo fullness across unlocked guns (0..1, adaptive drops). */
  ammoFraction(): number {
    let have = 0;
    let cap = 0;
    for (const w of this.weapons) {
      const rt = this.runtime.get(w.id)!;
      if (!rt.unlocked) continue;
      have += rt.mag + rt.reserve;
      cap += w.magSize + w.reserveMax;
    }
    return cap > 0 ? Math.min(1, have / cap) : 1;
  }

  /**
   * Arsenal strength for wave-budget scaling: +1 per non-default unlock,
   * +0.5 per purchased tier. The stock loadout scores 0.
   */
  powerScore(): number {
    let score = 0;
    for (const w of this.weapons) {
      const rt = this.runtime.get(w.id)!;
      if (rt.unlocked && !w.unlockedByDefault) score += 1;
      score += rt.tier * 0.5;
    }
    return score;
  }

  /** Config + purchased tiers + player stat sheet + tuning → concrete numbers. */
  effective(ctx: CombatContext, cfg = this.current): EffectiveWeaponStats {
    return effectiveWeaponStats(cfg, this.runtime.get(cfg.id)!.tier, this.tuning, ctx.player().stats);
  }

  update(dt: number, input: InputCommand, view: FireView, ctx: CombatContext, projectiles: PlayerProjectiles): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.switchLeft > 0) this.switchLeft -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 3);

    this.handleSwitching(input);
    this.maybeAutoEquipMelee();

    const eff = this.effective(ctx);

    // Melee: no mag, no reload — just swing on cooldown.
    if (this.current.kind === 'melee') {
      const wantsSwing = this.current.auto ? input.fire : input.firePressed;
      if (wantsSwing && this.cooldown <= 0 && this.switchLeft <= 0) {
        swingMelee(this.current, eff, view, ctx, this.rng, this.bus);
        this.cooldown = 60 / eff.rpm;
      }
      return;
    }

    const rt = this.state();

    if (this.reloading) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) {
        const need = eff.magSize - rt.mag;
        const take = Math.min(need, rt.reserve);
        rt.mag += take;
        rt.reserve -= take;
        this.reloading = false;
        this.bus.emit('weapon:reload-done', { weaponId: this.currentId });
      }
      return; // no firing while reloading
    }

    if (input.reload && rt.mag < eff.magSize && rt.reserve > 0) {
      this.startReload(eff);
      return;
    }

    const wantsFire = this.current.auto ? input.fire : input.firePressed;
    if (wantsFire && this.cooldown <= 0 && this.switchLeft <= 0) {
      if (rt.mag <= 0) {
        this.bus.emit('weapon:empty', { weaponId: this.currentId });
        if (rt.reserve > 0) this.startReload(eff);
        this.cooldown = 0.25;
        return;
      }
      this.fire(eff, view, ctx, projectiles);
      // Double-shot upgrade: one free extra trigger pull.
      const doubleChance = ctx.player().stats.doubleShotChance;
      if (doubleChance > 0 && this.rng.chance(doubleChance) && this.state().mag > 0) {
        this.fire(eff, view, ctx, projectiles, true);
      }
      this.cooldown = 60 / eff.rpm;
    }
  }

  private startReload(eff: EffectiveWeaponStats): void {
    this.reloading = true;
    this.reloadLeft = eff.reloadTime;
    this.bus.emit('weapon:reload-start', { weaponId: this.currentId, duration: eff.reloadTime });
  }

  private handleSwitching(input: InputCommand): void {
    let targetSlot = -1;
    if (input.weaponSlot >= 0) targetSlot = input.weaponSlot;
    else if (input.weaponDelta !== 0) {
      // Wheel/gamepad cycling covers GUNS only — melee stays on slot 0 /
      // auto-equip. With no unlocked guns, cycling leaves melee equipped.
      const guns = this.weapons
        .filter((w) => w.kind !== 'melee' && this.runtime.get(w.id)!.unlocked)
        .sort((a, b) => a.slot - b.slot);
      if (guns.length > 0) {
        const idx = guns.findIndex((w) => w.id === this.currentId);
        const next = idx === -1
          ? guns[input.weaponDelta > 0 ? 0 : guns.length - 1] // from melee: direction picks the end
          : guns[(idx + input.weaponDelta + guns.length) % guns.length];
        targetSlot = next.slot;
      }
    }
    if (targetSlot >= 0) {
      const target = this.weapons.find((w) => w.slot === targetSlot);
      if (target && target.id !== this.currentId && this.runtime.get(target.id)!.unlocked) {
        this.equip(target.id);
      }
    }
  }

  private equip(id: string): void {
    this.currentId = id;
    this.reloading = false;
    this.switchLeft = 0.35;
    this.bus.emit('weapon:switched', { weaponId: id });
  }

  /** Every gun bone-dry → fall back to the melee weapon automatically. */
  private maybeAutoEquipMelee(): void {
    if (this.current.kind === 'melee') return;
    const rt = this.state();
    if (rt.mag > 0 || rt.reserve > 0) return; // cheap early-out
    const melee = this.weapons.find((w) => w.kind === 'melee');
    if (!melee || !this.runtime.get(melee.id)!.unlocked) return;
    for (const w of this.weapons) {
      if (w.kind === 'melee') continue;
      const r = this.runtime.get(w.id)!;
      if (r.unlocked && r.mag + r.reserve > 0) return;
    }
    this.equip(melee.id);
  }


  /** One trigger pull: all pellets, recoil, tracers, ammo, stats. */
  private fire(eff: EffectiveWeaponStats, view: FireView, ctx: CombatContext, projectiles: PlayerProjectiles, isFree = false): void {
    const cfg = this.current;
    const rt = this.state();
    if (!isFree) rt.mag--;
    ctx.stats.recordShot(cfg.id);
    this.bus.emit('weapon:fired', { weaponId: cfg.id });
    this.bus.emit('weapon:recoil', { pitchDeg: cfg.recoilPitchDeg, yawDeg: (this.rng.next() - 0.5) * 2 * cfg.recoilYawDeg });

    // Spray basis perpendicular to the view direction.
    const upX = 0, upY = 1, upZ = 0;
    let rx = view.dy * upZ - view.dz * upY;
    let ry = view.dz * upX - view.dx * upZ;
    let rz = view.dx * upY - view.dy * upX;
    const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
    rx /= rl; ry /= rl; rz /= rl;
    const ux = ry * view.dz - rz * view.dy;
    const uy = rz * view.dx - rx * view.dz;
    const uz = rx * view.dy - ry * view.dx;

    const totalSpreadRad = ((eff.spreadDeg + this.bloom) * Math.PI) / 180;

    for (let p = 0; p < cfg.pellets; p++) {
      const ang = this.rng.range(0, Math.PI * 2);
      const mag = this.rng.next() * totalSpreadRad;
      const offR = Math.cos(ang) * mag;
      const offU = Math.sin(ang) * mag;
      let dx = view.dx + rx * offR + ux * offU;
      let dy = view.dy + ry * offR + uy * offU;
      let dz = view.dz + rz * offR + uz * offU;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      dx /= dl; dy /= dl; dz /= dl;

      if (cfg.kind === 'projectile') {
        projectiles.spawn(cfg, view.ox, view.oy, view.oz, dx, dy, dz, eff.damage);
        continue;
      }
      firePellet(cfg, eff, view, dx, dy, dz, ctx, this.rng, this.bus);
    }
    this.bloom = clamp(this.bloom + cfg.bloomPerShot, 0, cfg.bloomMaxDeg);
  }

  /** Ammo pickup: refill a fraction of reserve capacity for ALL weapons. */
  addAmmoFraction(frac: number): void {
    for (const w of this.weapons) {
      const rt = this.runtime.get(w.id)!;
      if (!rt.unlocked) continue;
      rt.reserve = Math.min(w.reserveMax, rt.reserve + Math.ceil(w.reserveMax * frac));
    }
  }

  /**
   * Shop: which gun an ammo purchase refills — the current gun if its
   * reserve isn't full, else the first unlocked gun that needs ammo, else
   * null (purchase must be refused). Melee is never a target.
   */
  ammoRefillTarget(): WeaponConfig | null {
    const needsAmmo = (w: WeaponConfig): boolean =>
      w.kind !== 'melee' && this.runtime.get(w.id)!.unlocked && this.runtime.get(w.id)!.reserve < w.reserveMax;
    if (needsAmmo(this.current)) return this.current;
    return this.weapons.find(needsAmmo) ?? null;
  }

  /** Shop: fill one weapon's reserve to max. */
  refillWeapon(id: string): void {
    const cfg = this.weapons.find((w) => w.id === id);
    const rt = this.runtime.get(id);
    if (cfg && rt) rt.reserve = cfg.reserveMax;
  }

  /**
   * Unlock a weapon. `persist: true` (shop/progression) records it for the
   * profile; `persist: false` (dev/tuning cheats) is session-only.
   */
  unlock(id: string, persist = true): boolean {
    const rt = this.runtime.get(id);
    if (!rt) return false;
    if (persist) this.persistentUnlocks.add(id);
    if (rt.unlocked) return false;
    rt.unlocked = true;
    return true;
  }

  /** Unlocks that belong in the player profile (never tuning/dev cheats). */
  persistedUnlocks(): string[] {
    return this.weapons.filter((w) => this.persistentUnlocks.has(w.id)).map((w) => w.id);
  }

  /**
   * Tuning-panel lock toggle (session-only; never touches the profile set).
   * Invariants: the melee fallback stays unlocked, the player always keeps
   * at least one usable weapon, and locking the held weapon switches away
   * through the normal path. Returns false when the change is rejected.
   */
  setUnlocked(id: string, unlocked: boolean): boolean {
    const cfg = this.weapons.find((w) => w.id === id);
    const rt = this.runtime.get(id);
    if (!cfg || !rt) return false;
    if (unlocked) {
      rt.unlocked = true;
      return true;
    }
    if (cfg.kind === 'melee') return false; // the fallback is not lockable
    const usableAfter = this.weapons.filter((w) => w.id !== id && this.runtime.get(w.id)!.unlocked);
    if (usableAfter.length === 0) return false;
    rt.unlocked = false;
    if (this.currentId === id) {
      const fallback = usableAfter.find((w) => w.kind !== 'melee') ?? usableAfter[0];
      this.equip(fallback.id);
    }
    return true;
  }

  buyUpgradeTier(id: string): boolean {
    const cfg = this.weapons.find((w) => w.id === id);
    const rt = this.runtime.get(id);
    if (!cfg || !rt || rt.tier >= cfg.upgrades.length) return false;
    rt.tier++;
    return true;
  }
}
