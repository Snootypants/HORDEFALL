/**
 * GPU resource teardown: deepDisposeScene must dispose every geometry and
 * material reachable from the scene graph (scene.clear() alone leaks GPU
 * buffers), tolerating shared materials, material arrays, and lights.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { deepDisposeScene } from '../src/render/disposeUtils';

function trackDispose(
  target: { addEventListener(type: 'dispose', cb: () => void): void },
  log: Set<unknown>,
): void {
  target.addEventListener('dispose', () => log.add(target));
}

describe('deepDisposeScene', () => {
  it('disposes geometries and materials of plain and instanced meshes', () => {
    const scene = new THREE.Scene();
    const disposed = new Set<unknown>();

    const geo1 = new THREE.BoxGeometry();
    const mat1 = new THREE.MeshLambertMaterial();
    const mesh = new THREE.Mesh(geo1, mat1);

    const geo2 = new THREE.SphereGeometry();
    const mat2 = new THREE.MeshBasicMaterial();
    const instanced = new THREE.InstancedMesh(geo2, mat2, 8);

    const geo3 = new THREE.BufferGeometry();
    const mat3 = new THREE.PointsMaterial();
    const points = new THREE.Points(geo3, mat3);

    for (const g of [geo1, geo2, geo3]) trackDispose(g, disposed);
    for (const m of [mat1, mat2, mat3]) trackDispose(m, disposed);

    scene.add(mesh, instanced, points, new THREE.PointLight());
    deepDisposeScene(scene);

    expect(disposed.size).toBe(6);
    expect(scene.children).toHaveLength(0);
  });

  it('handles nested children and material arrays without throwing', () => {
    const scene = new THREE.Scene();
    const disposed = new Set<unknown>();
    const parent = new THREE.Group();
    const geo = new THREE.BoxGeometry();
    const matA = new THREE.MeshBasicMaterial();
    const matB = new THREE.MeshBasicMaterial();
    trackDispose(geo, disposed);
    trackDispose(matA, disposed);
    trackDispose(matB, disposed);
    const multiMat = new THREE.Mesh(geo, [matA, matB]);
    parent.add(multiMat);
    scene.add(parent);

    deepDisposeScene(scene);
    expect(disposed.size).toBe(3);
    expect(scene.children).toHaveLength(0);
  });

  it('tolerates shared materials/geometries used by several meshes', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry();
    const mat = new THREE.MeshBasicMaterial();
    scene.add(new THREE.Mesh(geo, mat), new THREE.Mesh(geo, mat));
    expect(() => deepDisposeScene(scene)).not.toThrow();
    expect(scene.children).toHaveLength(0);
  });
});
