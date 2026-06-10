/**
 * First-person weapon viewmodel: procedural low-poly gun built from boxes per
 * weapon config (no assets), with sway, recoil kick-back, reload dip, switch
 * slide, and a muzzle flash (sprite + point light).
 */

import * as THREE from 'three';
import type { WeaponConfig } from '../config/types';
import { damp } from '../core/math';

export class ViewModel {
  readonly group = new THREE.Group();
  private gun: THREE.Group | null = null;
  private readonly muzzleFlash: THREE.Sprite;
  private readonly muzzleLight: THREE.PointLight;
  private flashLeft = 0;
  private kick = 0;
  private reloadDip = 0;
  private switchSlide = 0;
  private swayX = 0;
  private swayY = 0;
  private currentWeaponId = '';

  constructor(camera: THREE.PerspectiveCamera) {
    camera.add(this.group);
    this.group.position.set(0.28, -0.26, -0.55);

    const flashMat = new THREE.SpriteMaterial({
      color: 0xffd27a,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    this.muzzleFlash = new THREE.Sprite(flashMat);
    this.muzzleFlash.scale.setScalar(0.25);
    this.muzzleFlash.position.set(0, 0.02, -0.55);
    this.muzzleFlash.visible = false;
    this.group.add(this.muzzleFlash);

    this.muzzleLight = new THREE.PointLight(0xffc46b, 0, 9, 2);
    this.muzzleLight.position.copy(this.muzzleFlash.position);
    this.group.add(this.muzzleLight);
  }

  /** Rebuild the procedural gun when the weapon changes. */
  setWeapon(cfg: WeaponConfig): void {
    if (cfg.id === this.currentWeaponId) return;
    this.currentWeaponId = cfg.id;
    if (this.gun) this.group.remove(this.gun);
    this.gun = buildGunMesh(cfg);
    this.group.add(this.gun);
    this.switchSlide = 1;
    (this.muzzleFlash.material as THREE.SpriteMaterial).color.set(cfg.muzzleColor);
    this.muzzleLight.color.set(cfg.muzzleColor);
  }

  onFired(): void {
    this.flashLeft = 0.045;
    this.kick = 1;
  }

  onReload(duration: number): void {
    this.reloadDip = duration;
  }

  update(dt: number, lookDX: number, lookDY: number, moveSpeed: number, time: number, aimFrac: number): void {
    // Sway lags the look input
    this.swayX = damp(this.swayX, -lookDX * 2.4, 10, dt);
    this.swayY = damp(this.swayY, lookDY * 2.0, 10, dt);
    this.kick = damp(this.kick, 0, 14, dt);
    if (this.reloadDip > 0) this.reloadDip -= dt;
    this.switchSlide = damp(this.switchSlide, 0, 8, dt);

    const idleBobY = Math.sin(time * 1.7) * 0.004 + Math.sin(time * 5.3) * 0.0015;
    const walkBobY = Math.abs(Math.sin(time * 7)) * 0.012 * Math.min(1, moveSpeed / 6);
    const reloadOffset = this.reloadDip > 0 ? 0.22 : 0;

    // ADS centers the gun
    const baseX = 0.28 * (1 - aimFrac) + 0.0 * aimFrac;
    const baseY = -0.26 * (1 - aimFrac) + -0.18 * aimFrac;

    this.group.position.x = baseX + this.swayX * 0.012 * (1 - aimFrac * 0.8);
    this.group.position.y = baseY + this.swayY * 0.012 + idleBobY + walkBobY - reloadOffset - this.switchSlide * 0.3;
    this.group.position.z = -0.55 + this.kick * 0.085;
    this.group.rotation.x = this.kick * 0.12 + (this.reloadDip > 0 ? -0.5 : 0) + this.switchSlide * -0.6;
    this.group.rotation.z = this.swayX * 0.01;

    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      this.muzzleFlash.visible = true;
      this.muzzleFlash.scale.setScalar(0.2 + Math.random() * 0.15);
      this.muzzleFlash.material.rotation = Math.random() * Math.PI;
      this.muzzleLight.intensity = 14;
    } else {
      this.muzzleFlash.visible = false;
      this.muzzleLight.intensity = damp(this.muzzleLight.intensity, 0, 30, dt);
    }
  }
}

/** Distinct silhouette per weapon from primitive boxes/cylinders. */
function buildGunMesh(cfg: WeaponConfig): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.55, metalness: 0.65 });
  const accent = new THREE.MeshStandardMaterial({
    color: cfg.tracerColor,
    roughness: 0.4,
    metalness: 0.2,
    emissive: cfg.tracerColor,
    emissiveIntensity: 0.55,
  });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.9 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0): void => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    g.add(m);
  };

  // Common: receiver + grip
  add(new THREE.BoxGeometry(0.055, 0.085, 0.3), body, 0, 0, -0.1);
  add(new THREE.BoxGeometry(0.045, 0.11, 0.05), grip, 0, -0.085, 0.02);

  switch (cfg.id) {
    case 'machete': {
      // Blade + spine instead of a barrel; the common receiver reads as a grip.
      add(new THREE.BoxGeometry(0.015, 0.09, 0.46), body, 0, 0.05, -0.32);
      add(new THREE.BoxGeometry(0.02, 0.02, 0.46), accent, 0, 0.1, -0.32);
      break;
    }
    case 'pistol':
      add(new THREE.BoxGeometry(0.04, 0.05, 0.18), body, 0, 0.02, -0.26);
      break;
    case 'shotgun':
      add(new THREE.CylinderGeometry(0.024, 0.024, 0.42, 8), body, 0, 0.02, -0.4, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.028, 0.028, 0.3, 8), grip, 0, -0.03, -0.36, Math.PI / 2);
      break;
    case 'rifle':
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), body, 0, 0.012, -0.42, Math.PI / 2);
      add(new THREE.BoxGeometry(0.03, 0.07, 0.1), grip, 0, -0.06, -0.12);
      add(new THREE.BoxGeometry(0.02, 0.035, 0.12), accent, 0, 0.07, -0.05);
      break;
    case 'sniper':
      add(new THREE.CylinderGeometry(0.016, 0.016, 0.55, 8), body, 0, 0.012, -0.5, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 10), accent, 0, 0.085, -0.1, Math.PI / 2);
      break;
    case 'launcher':
      add(new THREE.CylinderGeometry(0.055, 0.06, 0.34, 10), body, 0, 0.01, -0.32, Math.PI / 2);
      add(new THREE.TorusGeometry(0.055, 0.012, 6, 12), accent, 0, 0.01, -0.48);
      break;
    case 'arccaster':
      add(new THREE.CylinderGeometry(0.02, 0.045, 0.36, 6), accent, 0, 0.01, -0.34, Math.PI / 2);
      add(new THREE.TorusGeometry(0.05, 0.008, 6, 10), accent, 0, 0.01, -0.3);
      add(new THREE.TorusGeometry(0.045, 0.008, 6, 10), accent, 0, 0.01, -0.42);
      break;
    default:
      add(new THREE.BoxGeometry(0.04, 0.05, 0.2), body, 0, 0.01, -0.28);
  }
  return g;
}
