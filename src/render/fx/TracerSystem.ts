/**
 * Bullet tracers and arc-lightning beams: pooled instanced boxes stretched
 * along their segment, fading over ~80ms. One draw call for all tracers.
 */

import * as THREE from 'three';

const MAX = 128;
const LIFE = 0.085;

export class TracerSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly life = new Float32Array(MAX);
  private readonly matrices: THREE.Matrix4[] = [];
  private cursor = 0;
  activeCount = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(0.025, 0.025, 1);
    geo.translate(0, 0, -0.5); // origin at start, stretches toward -Z
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.matrices.push(new THREE.Matrix4());
    scene.add(this.mesh);
  }

  fire(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    if (this.life[i] <= 0) this.activeCount++;
    this.life[i] = LIFE;

    start.set(x0, y0, z0);
    end.set(x1, y1, z1);
    const dist = start.distanceTo(end);
    dummy.position.copy(start);
    dummy.lookAt(end);
    dummy.scale.set(1, 1, Math.max(0.1, dist));
    dummy.updateMatrix();
    this.matrices[i].copy(dummy.matrix);
    this.mesh.setColorAt(i, colorScratch.set(color));
  }

  update(dt: number): void {
    let count = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.activeCount--;
        continue;
      }
      this.mesh.setMatrixAt(count, this.matrices[i]);
      count++;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const dummy = new THREE.Object3D();
const start = new THREE.Vector3();
const end = new THREE.Vector3();
const colorScratch = new THREE.Color();
