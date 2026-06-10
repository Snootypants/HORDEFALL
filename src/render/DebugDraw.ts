/**
 * Developer visualizations: enemy hitboxes, AI state markers, steering
 * vectors, and spawn points. All toggleable from the dev console; zero cost
 * when disabled.
 */

import * as THREE from 'three';
import type { Simulation } from '../sim/Simulation';
import { EState } from '../sim/enemies/EnemyManager';
import { hitVolumeOf } from '../sim/enemies/enemyQueries';

const STATE_COLORS: Record<number, number> = {
  [EState.Spawning]: 0xffffff,
  [EState.Chase]: 0x44ff44,
  [EState.Windup]: 0xffaa00,
  [EState.Recover]: 0x8888ff,
  [EState.Fuse]: 0xff2200,
  [EState.Dying]: 0x444444,
  [EState.Charging]: 0xff00ff,
};

export class DebugDraw {
  showHitboxes = false;
  showAiState = false;
  showSteering = false;
  showSpawnPoints = false;

  private readonly hitboxMesh: THREE.InstancedMesh;
  private readonly stateMesh: THREE.InstancedMesh;
  private readonly steeringLines: THREE.LineSegments;
  private readonly spawnMarkers: THREE.InstancedMesh;
  private readonly sim: Simulation;

  constructor(scene: THREE.Scene, sim: Simulation) {
    this.sim = sim;

    // Unit capsule-ish cylinder, scaled per-instance to the REAL hit volume
    // (hitVolumeOf — the same numbers the raycast tests against).
    this.hitboxMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(1, 1, 1, 10, 1),
      new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.5 }),
      1024,
    );
    this.stateMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.12, 6, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      1024,
    );
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1024 * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.steeringLines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.7 }),
    );
    this.spawnMarkers = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.4, 1.4, 4),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }),
      64,
    );
    for (const obj of [this.hitboxMesh, this.stateMesh, this.spawnMarkers]) {
      obj.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      obj.count = 0;
      obj.frustumCulled = false;
      scene.add(obj);
    }
    this.steeringLines.frustumCulled = false;
    this.steeringLines.visible = false;
    scene.add(this.steeringLines);
  }

  get anyEnabled(): boolean {
    return this.showHitboxes || this.showAiState || this.showSteering || this.showSpawnPoints;
  }

  update(): void {
    const mgr = this.sim.enemies;

    let hit = 0;
    let st = 0;
    let lineVerts = 0;
    const linePos = this.steeringLines.geometry.attributes.position as THREE.BufferAttribute;

    if (this.anyEnabled) {
      for (let i = 0; i < mgr.highWater; i++) {
        if (!mgr.aliveFlags[i] || mgr.state[i] === EState.Dying) continue;
        const cfg = mgr.configOf(i);
        const h = cfg.height * mgr.scale[i];

        if (this.showHitboxes) {
          const vol = hitVolumeOf(mgr, i);
          dummy.position.set(mgr.posX[i], (vol.yBottom + vol.yTop) / 2, mgr.posZ[i]);
          dummy.scale.set(vol.radius, vol.yTop - vol.yBottom, vol.radius);
          dummy.updateMatrix();
          this.hitboxMesh.setMatrixAt(hit++, dummy.matrix);
        }
        if (this.showAiState) {
          dummy.position.set(mgr.posX[i], mgr.posY[i] + h + 0.5, mgr.posZ[i]);
          dummy.scale.setScalar(1.6);
          dummy.updateMatrix();
          this.stateMesh.setMatrixAt(st, dummy.matrix);
          this.stateMesh.setColorAt(st, colorScratch.set(STATE_COLORS[mgr.state[i]] ?? 0xffffff));
          st++;
        }
        if (this.showSteering && lineVerts < 1020) {
          linePos.setXYZ(lineVerts++, mgr.posX[i], 0.4, mgr.posZ[i]);
          linePos.setXYZ(lineVerts++, mgr.posX[i] + mgr.desiredVX[i] * 0.6, 0.4, mgr.posZ[i] + mgr.desiredVZ[i] * 0.6);
        }
      }
    }

    this.hitboxMesh.count = hit;
    this.hitboxMesh.instanceMatrix.needsUpdate = true;
    this.stateMesh.count = st;
    this.stateMesh.instanceMatrix.needsUpdate = true;
    if (this.stateMesh.instanceColor) this.stateMesh.instanceColor.needsUpdate = true;
    this.steeringLines.visible = this.showSteering && lineVerts > 0;
    this.steeringLines.geometry.setDrawRange(0, lineVerts);
    linePos.needsUpdate = true;

    let sp = 0;
    if (this.showSpawnPoints) {
      for (const p of this.sim.map.spawnPoints) {
        dummy.position.set(p.x, 0.7, p.z);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        this.spawnMarkers.setMatrixAt(sp++, dummy.matrix);
        if (sp >= 64) break;
      }
    }
    this.spawnMarkers.count = sp;
    this.spawnMarkers.instanceMatrix.needsUpdate = true;
  }
}

const dummy = new THREE.Object3D();
const colorScratch = new THREE.Color();
