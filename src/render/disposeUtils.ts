/**
 * Scene-wide GPU teardown. scene.clear() only detaches children — geometries,
 * materials, and textures keep their GPU buffers until .dispose() runs. This
 * walks the graph once and frees everything (idempotent on shared resources).
 */

import * as THREE from 'three';

function disposeMaterial(material: THREE.Material, seen: Set<object>): void {
  if (seen.has(material)) return;
  seen.add(material);
  // Textures hang off material slots (map, normalMap, …).
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) value.dispose();
  }
  material.dispose();
}

export function deepDisposeScene(scene: THREE.Scene): void {
  const seen = new Set<object>();
  scene.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh>;
    if (mesh.geometry && !seen.has(mesh.geometry)) {
      seen.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) disposeMaterial(m, seen);
    }
    // InstancedMesh keeps instance attribute buffers too.
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
  });
  scene.clear();
}
