/**
 * Canonical base dimensions (in local units, before the renderer scales by
 * enemy scale × height) for each enemy silhouette. SINGLE SOURCE OF TRUTH:
 * the renderer's geometry, the sim's raycast capsules, and the debug hitbox
 * draw all derive from this table — tests/hitVolumes.test.ts enforces it.
 */

import type { EnemyShape } from './types';

export const SHAPE_DIMS: Record<EnemyShape, { height: number; width: number }> = {
  capsule: { height: 1.8, width: 0.9 },   // CapsuleGeometry(0.45, 0.9)
  sphere: { height: 1.0, width: 1.0 },    // SphereGeometry(0.5)
  box: { height: 1.0, width: 0.9 },       // BoxGeometry(0.9, 1.0, 0.7)
  cone: { height: 1.2, width: 1.1 },      // ConeGeometry(0.55, 1.2)
  crystal: { height: 1.24, width: 1.24 }, // OctahedronGeometry(0.62)
};
