/**
 * Pure world→minimap projection for the FIXED north-up arena map. No DOM,
 * no canvas — Minimap renders from these numbers and tests verify them
 * headless. World +X → canvas right; world -Z ("north", yaw 0 forward) →
 * canvas up. The map never rotates; only the player arrow does.
 */

export const worldToMapX = (wx: number, worldHalf: number, canvasSize: number): number =>
  (wx / (worldHalf * 2) + 0.5) * canvasSize;

export const worldToMapY = (wz: number, worldHalf: number, canvasSize: number): number =>
  (wz / (worldHalf * 2) + 0.5) * canvasSize;

/**
 * Canvas rotation for an arrow glyph drawn pointing UP. Player forward is
 * (-sin yaw, -cos yaw) on XZ; canvas-up rotated by θ lands on (sin θ, -cos θ),
 * so θ = -yaw.
 */
export const playerArrowAngle = (yaw: number): number => -yaw;

export interface MinimapModel {
  player: { x: number; y: number; angle: number };
  points: { x: number; y: number }[];
}

/** Project the player + a set of world markers (allocates; UI-rate only). */
export function minimapModel(
  player: { x: number; z: number; yaw: number },
  points: { x: number; z: number }[],
  worldHalf: number,
  canvasSize: number,
): MinimapModel {
  return {
    player: {
      x: worldToMapX(player.x, worldHalf, canvasSize),
      y: worldToMapY(player.z, worldHalf, canvasSize),
      angle: playerArrowAngle(player.yaw),
    },
    points: points.map((p) => ({
      x: worldToMapX(p.x, worldHalf, canvasSize),
      y: worldToMapY(p.z, worldHalf, canvasSize),
    })),
  };
}
