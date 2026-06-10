/**
 * CPU-simulated, GPU-batched particles: one THREE.Points draw call for up to
 * MAX particles. SoA pool with a free cursor — burst() recycles the oldest
 * slots under pressure. Powers blood, sparks, explosions, smoke, dust,
 * pickups, shield hits, and death poofs.
 */

import * as THREE from 'three';

const MAX = 4096;

export class ParticleSystem {
  private readonly positions = new Float32Array(MAX * 3);
  private readonly colors = new Float32Array(MAX * 3);
  private readonly sizes = new Float32Array(MAX);
  private readonly velX = new Float32Array(MAX);
  private readonly velY = new Float32Array(MAX);
  private readonly velZ = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly maxLife = new Float32Array(MAX);
  private readonly gravity = new Float32Array(MAX);
  private readonly baseSize = new Float32Array(MAX);
  private cursor = 0;
  activeCount = 0;
  /** Settings toggle — when false, bursts are ignored. */
  enabled = true;
  /** Quality scale 0..1: multiplies burst counts. */
  density = 1;

  private readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.geometry.setDrawRange(0, 0);
    scene.add(this.points);
  }

  /** Emit `count` particles from a point with random spherical velocities. */
  burst(
    x: number, y: number, z: number,
    color: number,
    count: number,
    speed: number,
    life: number,
    gravity = 6,
    spread = 1,
  ): void {
    if (!this.enabled) return;
    const c = colorScratch.set(color);
    const n = Math.max(1, Math.round(count * this.density));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      if (this.life[i] <= 0) this.activeCount++;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.4 + Math.random() * 0.8);
      this.velX[i] = Math.sin(phi) * Math.cos(theta) * sp * spread;
      this.velY[i] = Math.abs(Math.cos(phi)) * sp;
      this.velZ[i] = Math.sin(phi) * Math.sin(theta) * sp * spread;
      const idx = i * 3;
      this.positions[idx] = x;
      this.positions[idx + 1] = y;
      this.positions[idx + 2] = z;
      const tint = 0.75 + Math.random() * 0.35;
      this.colors[idx] = c.r * tint;
      this.colors[idx + 1] = c.g * tint;
      this.colors[idx + 2] = c.b * tint;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.8);
      this.gravity[i] = gravity;
      this.baseSize[i] = 1;
    }
  }

  update(dt: number): void {
    let maxActive = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const idx = i * 3;
      if (this.life[i] <= 0) {
        this.activeCount--;
        // Park dead particles far below the arena.
        this.positions[idx + 1] = -1000;
        continue;
      }
      this.velY[i] -= this.gravity[i] * dt;
      this.positions[idx] += this.velX[i] * dt;
      this.positions[idx + 1] += this.velY[i] * dt;
      this.positions[idx + 2] += this.velZ[i] * dt;
      if (this.positions[idx + 1] < 0.02) {
        this.positions[idx + 1] = 0.02;
        this.velY[i] *= -0.3;
        this.velX[i] *= 0.7;
        this.velZ[i] *= 0.7;
      }
      // Fade out by scaling color toward black (additive blending)
      const frac = this.life[i] / this.maxLife[i];
      if (frac < 0.35) {
        const f = frac / 0.35;
        this.colors[idx] *= 0.9 + f * 0.1;
        this.colors[idx + 1] *= 0.9 + f * 0.1;
        this.colors[idx + 2] *= 0.9 + f * 0.1;
      }
      if (i > maxActive) maxActive = i;
    }
    this.geometry.setDrawRange(0, maxActive + 1);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}

const colorScratch = new THREE.Color();
