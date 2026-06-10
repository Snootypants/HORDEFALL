/**
 * First-person player simulation: movement (walk/sprint/crouch/jump), look
 * angles, stamina, health/armor with the armor-absorb model, god/noclip debug
 * modes. No Three.js — the camera rig reads this state every render frame.
 */

import type { PlayerBalanceConfig } from '../config/types';
import type { InputCommand } from './inputCommand';
import type { CollisionWorld, CapsuleBody } from './collision';
import type { GameBus } from './events';
import type { StatSheet } from './progression/upgradeEffects';
import { clamp, damp } from '../core/math';
import { applyDamageToDefenses } from './combat/damage';

export class PlayerSim {
  private readonly cfg: PlayerBalanceConfig;
  private readonly bus: GameBus;

  // Pose
  x: number;
  y = 0;
  z: number;
  yaw = 0; // radians; 0 faces -Z
  pitch = 0;
  velX = 0;
  velY = 0;
  velZ = 0;
  grounded = true;
  crouching = false;
  sprinting = false;
  eyeHeight: number;

  // Vitals
  health: number;
  armor: number;
  stamina: number;
  alive = true;
  invulnUntil = -Infinity;

  // Debug
  godMode = false;
  noclip = false;

  /** Damage taken during the current wave (wave-director performance metric). */
  damageTakenThisWave = 0;

  private readonly body: CapsuleBody;
  /** Stats sheet is owned by Simulation and swapped on upgrade. */
  statSheet: StatSheet | null = null;

  constructor(cfg: PlayerBalanceConfig, bus: GameBus, spawnX: number, spawnZ: number) {
    this.cfg = cfg;
    this.bus = bus;
    this.x = spawnX;
    this.z = spawnZ;
    this.eyeHeight = cfg.eyeHeight;
    this.health = cfg.maxHealth;
    this.armor = cfg.startingArmor;
    this.stamina = cfg.staminaMax;
    this.body = { x: spawnX, y: 0, z: spawnZ, velX: 0, velY: 0, velZ: 0, grounded: true };
  }

  get maxHealth(): number {
    return this.statSheet?.maxHealth ?? this.cfg.maxHealth;
  }

  get maxArmor(): number {
    return this.statSheet?.maxArmor ?? this.cfg.maxArmor;
  }

  get eyeY(): number {
    return this.y + this.eyeHeight;
  }

  /** Unit forward vector on yaw/pitch. yaw 0 → -Z. */
  forward(out: { x: number; y: number; z: number }): void {
    const cp = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * cp;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * cp;
  }

  update(dt: number, input: InputCommand, collision: CollisionWorld, simTime: number): void {
    if (!this.alive) return;

    // Look
    this.yaw -= input.lookDX;
    this.pitch = clamp(this.pitch - input.lookDY, -Math.PI / 2 + 0.01, Math.PI / 2 - 0.01);

    // Crouch (smooth eye height)
    this.crouching = input.crouch;
    const targetEye = this.crouching ? this.cfg.crouchEyeHeight : this.cfg.eyeHeight;
    this.eyeHeight = damp(this.eyeHeight, targetEye, 14, dt);

    // Sprint requires stamina and forward intent
    const wantsSprint = input.sprint && input.moveZ > 0.1 && !this.crouching;
    this.sprinting = wantsSprint && this.stamina > 1;
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - this.cfg.staminaDrainPerSec * dt);
    } else {
      const regenMult = this.statSheet?.staminaRegenMult ?? 1;
      this.stamina = Math.min(this.cfg.staminaMax, this.stamina + this.cfg.staminaRegenPerSec * regenMult * dt);
    }

    // Desired velocity in world space from move axes + yaw
    const moveMult =
      (this.statSheet?.moveSpeedMult ?? 1) *
      (this.sprinting ? this.cfg.sprintMult : 1) *
      (this.crouching ? this.cfg.crouchMult : 1);
    const speed = this.cfg.walkSpeed * moveMult;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // forward = (-sinY, -cosY), right = (cosY, -sinY)
    let wishX = -sinY * input.moveZ + cosY * input.moveX;
    let wishZ = -cosY * input.moveZ - sinY * input.moveX;
    const wishLen = Math.sqrt(wishX * wishX + wishZ * wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    if (this.noclip) {
      // Free-fly: forward follows pitch.
      const flySpeed = speed * 3;
      const cp = Math.cos(this.pitch);
      this.x += (-sinY * cp * input.moveZ + cosY * input.moveX) * flySpeed * dt;
      this.z += (-cosY * cp * input.moveZ - sinY * input.moveX) * flySpeed * dt;
      this.y += Math.sin(this.pitch) * input.moveZ * flySpeed * dt + (input.jump ? flySpeed * dt : 0) - (input.crouch ? flySpeed * dt : 0);
      this.y = Math.max(0, this.y);
      this.velX = this.velY = this.velZ = 0;
      return;
    }

    // Accelerate toward wish velocity (ground friction baked into lambda)
    const accel = this.grounded ? 12 : 3;
    this.velX = damp(this.velX, wishX * speed, accel, dt);
    this.velZ = damp(this.velZ, wishZ * speed, accel, dt);

    // Jump
    if (input.jump && this.grounded && this.stamina >= this.cfg.staminaJumpCost) {
      this.velY = this.cfg.jumpVelocity;
      this.stamina -= this.cfg.staminaJumpCost;
      this.grounded = false;
    }
    this.velY -= this.cfg.gravity * dt;

    // Integrate through the collision world
    const body = this.body;
    body.x = this.x;
    body.y = this.y;
    body.z = this.z;
    body.velX = this.velX;
    body.velY = this.velY;
    body.velZ = this.velZ;
    const capsuleHeight = this.crouching ? 1.2 : 1.8;
    collision.moveCapsule(body, this.cfg.radius, capsuleHeight, dt, 0.55);
    this.x = body.x;
    this.y = body.y;
    this.z = body.z;
    this.velX = body.velX;
    this.velY = body.velY;
    this.velZ = body.velZ;
    this.grounded = body.grounded;

    // Armor regen
    const regen = this.statSheet?.armorRegenPerSec ?? 0;
    if (regen > 0 && this.armor < this.maxArmor) {
      this.armor = Math.min(this.maxArmor, this.armor + regen * dt);
    }
  }

  /** Returns actual damage dealt to health+armor (0 when invulnerable/god). */
  applyDamage(amount: number, fromX: number, fromZ: number, simTime: number): number {
    if (!this.alive || this.godMode || simTime < this.invulnUntil) return 0;
    const hadArmor = this.armor > 0;
    const result = applyDamageToDefenses(this.health, this.armor, amount, this.cfg.armorAbsorb);
    this.health = result.health;
    this.armor = result.armor;
    this.damageTakenThisWave += amount;
    this.bus.emit('player:damaged', {
      amount,
      fromX,
      fromZ,
      health: this.health,
      armor: this.armor,
    });
    if (hadArmor && this.armor <= 0) this.bus.emit('player:armor-break', {});
    if (this.health / this.maxHealth < 0.25) this.bus.emit('player:low-health', {});
    if (this.health <= 0) {
      this.alive = false;
      this.bus.emit('player:died', {});
    }
    return amount;
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.health = Math.min(this.maxHealth, this.health + amount);
    this.bus.emit('player:healed', { amount });
  }

  addArmor(amount: number): void {
    if (!this.alive) return;
    this.armor = Math.min(this.maxArmor, this.armor + amount);
  }

  respawn(spawnX: number, spawnZ: number, simTime: number): void {
    this.alive = true;
    this.health = this.maxHealth;
    this.armor = this.cfg.startingArmor;
    this.stamina = this.cfg.staminaMax;
    this.x = spawnX;
    this.z = spawnZ;
    this.y = 0;
    this.velX = this.velY = this.velZ = 0;
    this.invulnUntil = simTime + this.cfg.respawnInvulnSec;
  }
}
