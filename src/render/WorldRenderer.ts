/**
 * Builds the arena's static meshes from MapData: ground with a procedural
 * grid texture, perimeter walls, and one InstancedMesh per prop kind (crate,
 * pillar, ramp step, rock, platform) so the whole world is a handful of draw
 * calls. Barrels are individual meshes (they can be destroyed).
 */

import * as THREE from 'three';
import type { MapData, StaticBox } from '../sim/mapGen';
import type { Barrels } from '../sim/barrels';

export class WorldRenderer {
  readonly group = new THREE.Group();
  private readonly barrelMeshes: THREE.Mesh[] = [];

  constructor(map: MapData, scene: THREE.Scene, shadows: boolean) {
    const cfg = map.config;

    // Ground: canvas-generated grid/noise texture
    const groundTex = makeGroundTexture(cfg.groundColor, cfg.accentColor);
    groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(cfg.size / 8, cfg.size / 8);
    groundTex.anisotropy = 4;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.size + 4, cfg.size + 4),
      new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0.05 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = shadows;
    this.group.add(ground);

    // Batch boxes by kind into InstancedMeshes
    const byKind = new Map<string, StaticBox[]>();
    for (const b of map.boxes) {
      const list = byKind.get(b.kind) ?? [];
      list.push(b);
      byKind.set(b.kind, list);
    }

    const kindMaterial: Record<string, THREE.Material> = {
      wall: new THREE.MeshStandardMaterial({ color: cfg.wallColor, roughness: 0.9 }),
      crate: new THREE.MeshStandardMaterial({ color: cfg.propColor, roughness: 0.8 }),
      pillar: new THREE.MeshStandardMaterial({ color: cfg.wallColor, roughness: 0.85 }),
      platform: new THREE.MeshStandardMaterial({ color: cfg.propColor, roughness: 0.8 }),
      ramp: new THREE.MeshStandardMaterial({ color: cfg.propColor, roughness: 0.85 }),
      rock: new THREE.MeshStandardMaterial({ color: cfg.wallColor, roughness: 1.0 }),
    };

    const unit = new THREE.BoxGeometry(1, 1, 1);
    const matrix = new THREE.Matrix4();
    for (const [kind, list] of byKind) {
      const mesh = new THREE.InstancedMesh(unit, kindMaterial[kind] ?? kindMaterial.crate, list.length);
      list.forEach((b, i) => {
        matrix.makeScale(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
        matrix.setPosition((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.castShadow = shadows && kind !== 'wall';
      mesh.receiveShadow = shadows;
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    }

    // Accent edge lighting strips on pillars (emissive boxes, cheap flair)
    const accentMat = new THREE.MeshBasicMaterial({ color: cfg.accentColor });
    const pillars = byKind.get('pillar') ?? [];
    if (pillars.length > 0) {
      const strip = new THREE.InstancedMesh(unit, accentMat, pillars.length);
      pillars.forEach((b, i) => {
        matrix.makeScale(b.maxX - b.minX + 0.06, 0.1, b.maxZ - b.minZ + 0.06);
        matrix.setPosition((b.minX + b.maxX) / 2, b.maxY - 0.3, (b.minZ + b.maxZ) / 2);
        strip.setMatrixAt(i, matrix);
      });
      strip.instanceMatrix.needsUpdate = true;
      this.group.add(strip);
    }

    // Barrels: red drums with hazard ring
    const barrelGeo = new THREE.CylinderGeometry(0.45, 0.5, 1.1, 10);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0xa8231d, roughness: 0.6, metalness: 0.3 });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc46b });
    for (const b of map.barrels) {
      const mesh = new THREE.Mesh(barrelGeo, barrelMat);
      mesh.position.set(b.x, 0.55, b.z);
      mesh.castShadow = shadows;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.035, 6, 16), ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.25;
      mesh.add(ring);
      this.group.add(mesh);
      this.barrelMeshes.push(mesh);
    }

    scene.add(this.group);
  }

  /** Hide barrel meshes whose sim entry has exploded. */
  syncBarrels(barrels: Barrels): void {
    for (let i = 0; i < this.barrelMeshes.length && i < barrels.count; i++) {
      this.barrelMeshes[i].visible = barrels.alive[i] === 1;
    }
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
  }
}

function makeGroundTexture(baseColor: number, accentColor: number): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const base = new THREE.Color(baseColor);
  g.fillStyle = `#${base.getHexString()}`;
  g.fillRect(0, 0, size, size);
  // Noise speckle
  const darker = base.clone().multiplyScalar(0.82);
  const lighter = base.clone().multiplyScalar(1.18);
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 2.2;
    g.fillStyle = `#${(Math.random() > 0.5 ? darker : lighter).getHexString()}`;
    g.fillRect(x, y, r, r);
  }
  // Grid lines with accent tint
  const accent = new THREE.Color(accentColor).multiplyScalar(0.35);
  g.strokeStyle = `#${accent.getHexString()}`;
  g.lineWidth = 1.5;
  g.strokeRect(0.75, 0.75, size - 1.5, size - 1.5);
  g.globalAlpha = 0.4;
  g.beginPath();
  g.moveTo(size / 2, 0);
  g.lineTo(size / 2, size);
  g.moveTo(0, size / 2);
  g.lineTo(size, size / 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
