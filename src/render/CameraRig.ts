/**
 * First-person camera: applies the sim player pose plus feel layers —
 * head bob, trauma-based shake, recoil spring, landing dip, sprint FOV kick,
 * and ADS zoom. All cosmetic; the sim never sees any of it.
 */

import * as THREE from 'three';
import type { PlayerSim } from '../sim/playerSim';
import { clamp, damp } from '../core/math';

export class CameraRig {
  private readonly camera: THREE.PerspectiveCamera;
  private baseFov: number;

  // Shake (trauma decays, shake = trauma^2)
  private trauma = 0;
  // Recoil spring
  private recoilPitch = 0;
  private recoilYaw = 0;
  // Head bob phase
  private bobPhase = 0;
  private bobAmount = 0;
  // Landing dip
  private wasGrounded = true;
  private landDip = 0;
  private fovKick = 0;
  private adsAmount = 0;

  constructor(camera: THREE.PerspectiveCamera, fov: number) {
    this.camera = camera;
    this.baseFov = fov;
  }

  setBaseFov(fov: number): void {
    this.baseFov = fov;
  }

  addTrauma(amount: number): void {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  addRecoil(pitchDeg: number, yawDeg: number): void {
    this.recoilPitch += (pitchDeg * Math.PI) / 180;
    this.recoilYaw += (yawDeg * Math.PI) / 180;
  }

  update(dt: number, player: PlayerSim, time: number, aiming: boolean, adsZoom: number | undefined): void {
    // Decay layers
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.recoilPitch = damp(this.recoilPitch, 0, 9, dt);
    this.recoilYaw = damp(this.recoilYaw, 0, 9, dt);

    // Head bob from horizontal speed while grounded
    const speed = Math.sqrt(player.velX * player.velX + player.velZ * player.velZ);
    const targetBob = player.grounded ? clamp(speed / 8, 0, 1) : 0;
    this.bobAmount = damp(this.bobAmount, targetBob, 8, dt);
    this.bobPhase += dt * (6 + speed * 1.1);

    // Landing dip
    if (player.grounded && !this.wasGrounded) this.landDip = 0.14;
    this.wasGrounded = player.grounded;
    this.landDip = damp(this.landDip, 0, 10, dt);

    // Shake offsets (perlin-ish via sines at odd frequencies)
    const shake = this.trauma * this.trauma;
    const shakeYaw = shake * 0.03 * Math.sin(time * 41.7);
    const shakePitch = shake * 0.025 * Math.sin(time * 37.3 + 1.7);
    const shakeRoll = shake * 0.02 * Math.sin(time * 43.1 + 3.1);

    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * this.bobAmount;
    const bobX = Math.sin(this.bobPhase * 0.5) * 0.025 * this.bobAmount;

    this.camera.position.set(
      player.x + bobX * Math.cos(player.yaw),
      player.eyeY + bobY - this.landDip,
      player.z + bobX * Math.sin(player.yaw),
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = player.yaw + this.recoilYaw + shakeYaw;
    this.camera.rotation.x = player.pitch + this.recoilPitch + shakePitch;
    this.camera.rotation.z = shakeRoll;

    // FOV: sprint kick + ADS zoom
    const sprinting = player.sprinting;
    this.fovKick = damp(this.fovKick, sprinting ? 6 : 0, 6, dt);
    this.adsAmount = damp(this.adsAmount, aiming && adsZoom ? 1 : 0, 12, dt);
    const adsFov = adsZoom ? this.baseFov / adsZoom : this.baseFov;
    const fov = (this.baseFov + this.fovKick) * (1 - this.adsAmount) + adsFov * this.adsAmount;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  get aimingFraction(): number {
    return this.adsAmount;
  }
}
