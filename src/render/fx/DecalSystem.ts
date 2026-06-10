/**
 * Impact decals: pooled instanced quads stamped onto surfaces, slowly fading.
 * Capacity comes from graphics settings (maxDecals); oldest decals recycle.
 */

import * as THREE from 'three';

export class DecalSystem {
  private mesh: THREE.InstancedMesh;
  private life: Float32Array;
  private capacity: number;
  private cursor = 0;
  activeCount = 0;
  private readonly scene: THREE.Scene;

  constructor(scene: THREE.Scene, capacity: number) {
    this.scene = scene;
    this.capacity = capacity;
    this.life = new Float32Array(capacity);
    this.mesh = this.build(capacity);
  }

  private build(capacity: number): THREE.InstancedMesh {
    const geo = new THREE.PlaneGeometry(0.3, 0.3);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    return mesh;
  }

  setCapacity(capacity: number): void {
    if (capacity === this.capacity) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.capacity = capacity;
    this.life = new Float32Array(capacity);
    this.cursor = 0;
    this.activeCount = 0;
    this.mesh = this.build(capacity);
  }

  stamp(x: number, y: number, z: number, nx: number, ny: number, nz: number, scorch = false): void {
    if (this.capacity === 0) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    if (this.life[i] <= 0) this.activeCount++;
    this.life[i] = 14;

    normal.set(nx, ny, nz).normalize();
    dummy.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    target.copy(dummy.position).add(normal);
    dummy.lookAt(target);
    const s = scorch ? 2.5 + Math.random() * 1.5 : 0.7 + Math.random() * 0.5;
    dummy.scale.setScalar(s);
    dummy.rotation.z = Math.random() * Math.PI * 2;
    dummy.updateMatrix();
    this.mesh.setMatrixAt(i, dummy.matrix);
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.activeCount--;
        // Collapse the instance to zero scale.
        dummy.position.set(0, -1000, 0);
        dummy.scale.setScalar(0.0001);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

const dummy = new THREE.Object3D();
const normal = new THREE.Vector3();
const target = new THREE.Vector3();
