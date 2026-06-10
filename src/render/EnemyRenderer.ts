/**
 * Horde rendering: one InstancedMesh per enemy archetype shape (capsule,
 * sphere, box, cone, crystal) — the entire 1000-enemy horde renders in ~5
 * draw calls. Per-instance color carries hit flash, elite tint, and status
 * tints. Death plays as a shrink-and-sink on the instance matrix.
 * LOD: distant enemies skip walk-cycle animation.
 */

import * as THREE from 'three';
import type { EnemyManager } from '../sim/enemies/EnemyManager';
import { EState, MAX_ENEMIES } from '../sim/enemies/EnemyManager';
import type { EnemyShape } from '../config/types';

const dummy = new THREE.Object3D();
const colorScratch = new THREE.Color();
const baseColorScratch = new THREE.Color();

/** Exported so tests can prove these dims match config/shapes SHAPE_DIMS. */
export function geometryFor(shape: EnemyShape): THREE.BufferGeometry {
  switch (shape) {
    case 'capsule':
      return new THREE.CapsuleGeometry(0.45, 0.9, 4, 10);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 12, 10);
    case 'box':
      return new THREE.BoxGeometry(0.9, 1.0, 0.7);
    case 'cone':
      return new THREE.ConeGeometry(0.55, 1.2, 10);
    case 'crystal':
      return new THREE.OctahedronGeometry(0.62, 0);
  }
}

export class EnemyRenderer {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly bossWeakPoint: THREE.Mesh;
  private readonly shieldMeshes: THREE.InstancedMesh;
  /** LOD: anim detail disabled beyond this distance (squared). */
  private lodDist2 = 45 * 45;

  constructor(private readonly mgr: EnemyManager, scene: THREE.Scene, shadows: boolean) {
    for (const type of mgr.types) {
      const geo = geometryFor(type.shape);
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const mesh = new THREE.InstancedMesh(geo, mat, MAX_ENEMIES);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = shadows;
      mesh.frustumCulled = false; // instances span the arena; cull per-game not per-mesh
      scene.add(mesh);
      this.meshes.push(mesh);
    }

    // Warden shields: separate translucent instanced planes
    this.shieldMeshes = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8, 1, true, -Math.PI / 3, Math.PI * 2 / 3),
      new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.4, side: THREE.DoubleSide }),
      64,
    );
    this.shieldMeshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shieldMeshes.count = 0;
    this.shieldMeshes.frustumCulled = false;
    scene.add(this.shieldMeshes);

    // Boss weak point: glowing core
    this.bossWeakPoint = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff2255 }),
    );
    this.bossWeakPoint.visible = false;
    scene.add(this.bossWeakPoint);
  }

  setLodDistance(d: number): void {
    this.lodDist2 = d * d;
  }

  update(time: number, camX: number, camZ: number): void {
    const mgr = this.mgr;
    const counts = countsScratch;
    counts.fill(0);

    let shieldCount = 0;

    for (let i = 0; i < mgr.highWater; i++) {
      if (!mgr.aliveFlags[i]) continue;
      const typeIdx = mgr.typeIdx[i];
      const cfg = mgr.types[typeIdx];
      const mesh = this.meshes[typeIdx];
      const slot = counts[typeIdx]++;

      const dx = mgr.posX[i] - camX;
      const dz = mgr.posZ[i] - camZ;
      const near = dx * dx + dz * dz < this.lodDist2;

      // Corpses topple-squash over ~0.45s, linger flat, sink out at the end.
      const dying = mgr.state[i] === EState.Dying;
      let sy = 1;
      let sxz = 1;
      if (dying) {
        const elapsed = Math.max(0, mgr.corpseTtlSec - mgr.deathTimer[i]);
        const fall = Math.min(1, elapsed / 0.45);
        sy = 1 - fall * 0.82;
        sxz = 1 + fall * 0.25;
        const fadeOut = Math.min(1, mgr.deathTimer[i] / 0.6);
        sy *= fadeOut;
        sxz *= Math.max(0.2, fadeOut);
      }
      const s = mgr.scale[i] * cfg.height;

      // Walk-cycle bob + windup lean (near instances only)
      let bobY = 0;
      let lean = 0;
      if (near && !dying) {
        bobY = Math.abs(Math.sin(mgr.animPhase[i] * 6)) * 0.08 * s;
        if (mgr.state[i] === EState.Windup) lean = 0.35;
        if (mgr.state[i] === EState.Fuse) bobY += Math.sin(time * 40) * 0.06;
      }

      dummy.position.set(mgr.posX[i], mgr.posY[i] + s * sy * 0.5 + bobY, mgr.posZ[i]);
      dummy.rotation.set(lean, mgr.yaw[i], 0);
      dummy.scale.set(s * sxz, Math.max(0.01, s * sy), s * sxz);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);

      // Color: base → elite gold tint → status tint → hit flash white
      baseColorScratch.set(cfg.color);
      if (mgr.elite[i]) baseColorScratch.lerp(eliteColor, 0.45);
      const statusTint = mgr.status.tintColor(i);
      if (statusTint !== null) {
        colorScratch.set(statusTint);
        baseColorScratch.lerp(colorScratch, 0.5);
      }
      if (mgr.hitFlash[i] > 0) baseColorScratch.lerp(whiteColor, mgr.hitFlash[i]);
      if (mgr.state[i] === EState.Fuse) baseColorScratch.lerp(fuseColor, 0.5 + Math.sin(time * 30) * 0.5);
      if (dying) baseColorScratch.lerp(corpseColor, 0.55); // corpses read as dead
      mesh.setColorAt(slot, baseColorScratch);

      // Warden shield visual
      if (mgr.shieldHp[i] > 0 && shieldCount < 64) {
        dummy.position.set(mgr.posX[i], mgr.posY[i] + s * 0.5, mgr.posZ[i]);
        dummy.rotation.set(0, mgr.yaw[i] + Math.PI, 0);
        dummy.scale.setScalar(mgr.scale[i]);
        dummy.updateMatrix();
        this.shieldMeshes.setMatrixAt(shieldCount++, dummy.matrix);
      }
    }

    for (let t = 0; t < this.meshes.length; t++) {
      const mesh = this.meshes[t];
      mesh.count = counts[t];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    this.shieldMeshes.count = shieldCount;
    this.shieldMeshes.instanceMatrix.needsUpdate = true;

    // Boss weak point glow
    const bossIdx = mgr.bossIdx;
    if (bossIdx >= 0 && mgr.aliveFlags[bossIdx]) {
      const cfg = mgr.configOf(bossIdx);
      const h = cfg.height * mgr.scale[bossIdx];
      this.bossWeakPoint.visible = true;
      this.bossWeakPoint.position.set(
        mgr.posX[bossIdx] - Math.sin(mgr.yaw[bossIdx]) * cfg.radius * mgr.scale[bossIdx] * 0.7,
        mgr.posY[bossIdx] + h * 0.6,
        mgr.posZ[bossIdx] - Math.cos(mgr.yaw[bossIdx]) * cfg.radius * mgr.scale[bossIdx] * 0.7,
      );
      const pulse = 1 + Math.sin(time * 6) * 0.15;
      this.bossWeakPoint.scale.setScalar((cfg.boss?.weakPointRadius ?? 0.5) * mgr.scale[bossIdx] * pulse);
    } else {
      this.bossWeakPoint.visible = false;
    }
  }
}

const countsScratch = new Uint16Array(16);
const eliteColor = new THREE.Color(0xffd75e);
const whiteColor = new THREE.Color(0xffffff);
const fuseColor = new THREE.Color(0xff3300);
const corpseColor = new THREE.Color(0x1a1216);
