/**
 * Instanced renderers for the small movers: player projectiles, enemy
 * projectiles, pickups, and companions (drones/turrets). Each is a single
 * InstancedMesh draw call updated from sim SoA arrays.
 */

import * as THREE from 'three';
import type { PlayerProjectiles } from '../sim/projectiles';
import type { EnemyProjectiles } from '../sim/enemies/enemyProjectiles';
import type { Pickups } from '../sim/pickups';
import type { Companions } from '../sim/companions';

const dummy = new THREE.Object3D();
const colorScratch = new THREE.Color();

export class ProjectileRenderer {
  private readonly playerMesh: THREE.InstancedMesh;
  private readonly enemyMesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.playerMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      512,
    );
    this.enemyMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      256,
    );
    for (const m of [this.playerMesh, this.enemyMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(player: PlayerProjectiles, enemy: EnemyProjectiles): void {
    let n = 0;
    for (let i = 0; i < player.alive.length; i++) {
      if (!player.alive[i]) continue;
      dummy.position.set(player.posX[i], player.posY[i], player.posZ[i]);
      dummy.scale.setScalar(1);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      this.playerMesh.setMatrixAt(n, dummy.matrix);
      this.playerMesh.setColorAt(n, colorScratch.set(player.weaponRef[i]?.tracerColor ?? 0xffffff));
      n++;
    }
    this.playerMesh.count = n;
    this.playerMesh.instanceMatrix.needsUpdate = true;
    if (this.playerMesh.instanceColor) this.playerMesh.instanceColor.needsUpdate = true;

    let m = 0;
    for (let i = 0; i < enemy.alive.length; i++) {
      if (!enemy.alive[i]) continue;
      dummy.position.set(enemy.posX[i], enemy.posY[i], enemy.posZ[i]);
      dummy.scale.setScalar(enemy.radius[i] / 0.22);
      dummy.updateMatrix();
      this.enemyMesh.setMatrixAt(m, dummy.matrix);
      this.enemyMesh.setColorAt(m, colorScratch.set(enemy.color[i]));
      m++;
    }
    this.enemyMesh.count = m;
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    if (this.enemyMesh.instanceColor) this.enemyMesh.instanceColor.needsUpdate = true;
  }
}

export class PickupRenderer {
  private readonly mesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      192,
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(pickups: Pickups, time: number): void {
    let n = 0;
    for (let i = 0; i < pickups.alive.length; i++) {
      if (!pickups.alive[i]) continue;
      const bob = Math.sin(time * 3 + i * 1.3) * 0.1;
      const blink = pickups.life[i] < 5 ? (Math.sin(time * 12) > 0 ? 1 : 0.25) : 1;
      dummy.position.set(pickups.posX[i], pickups.posY[i] + bob, pickups.posZ[i]);
      dummy.rotation.set(0, time * 2 + i, 0);
      dummy.scale.setScalar(blink);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(n, dummy.matrix);
      this.mesh.setColorAt(n, colorScratch.set(pickups.configOf(i).color));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class CompanionRenderer {
  private readonly droneMesh: THREE.InstancedMesh;
  private readonly turretMesh: THREE.InstancedMesh;

  constructor(scene: THREE.Scene) {
    const droneGeo = new THREE.ConeGeometry(0.18, 0.3, 6);
    droneGeo.rotateX(Math.PI);
    this.droneMesh = new THREE.InstancedMesh(
      droneGeo,
      new THREE.MeshLambertMaterial({ color: 0x9adcff, emissive: 0x3377aa }),
      4,
    );
    this.turretMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.22, 0.34, 0.8, 8),
      new THREE.MeshLambertMaterial({ color: 0xb8c4d0, emissive: 0x223344 }),
      4,
    );
    for (const m of [this.droneMesh, this.turretMesh]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
  }

  update(companions: Companions, time: number): void {
    let n = 0;
    for (const d of companions.drones) {
      dummy.position.set(d.x, d.y + Math.sin(time * 4 + n) * 0.08, d.z);
      dummy.rotation.set(0, time * 3, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.droneMesh.setMatrixAt(n++, dummy.matrix);
    }
    this.droneMesh.count = n;
    this.droneMesh.instanceMatrix.needsUpdate = true;

    let m = 0;
    for (const t of companions.turrets) {
      if (!t.active) continue;
      dummy.position.set(t.x, 0.4, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      this.turretMesh.setMatrixAt(m++, dummy.matrix);
    }
    this.turretMesh.count = m;
    this.turretMesh.instanceMatrix.needsUpdate = true;
  }
}
