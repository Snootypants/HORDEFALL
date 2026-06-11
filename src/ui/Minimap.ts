/**
 * Fixed north-up full-arena minimap. The map NEVER rotates: world positions
 * project through minimapMath, the player marker moves around the map and
 * its arrow alone rotates to show facing. Shows enemies by role color,
 * pickups, barrels, the boss, and world obstacles as faint blocks.
 */

import type { Simulation } from '../sim/Simulation';
import { EState } from '../sim/enemies/EnemyManager';
import { worldToMapX, worldToMapY, playerArrowAngle } from './minimapMath';

const SIZE = 168;

export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width = SIZE * 2;
    this.canvas.height = SIZE * 2;
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(2, 2);
  }

  setVisible(v: boolean): void {
    this.canvas.style.display = v ? 'block' : 'none';
  }

  update(sim: Simulation): void {
    const g = this.ctx;
    const half = sim.map.config.size / 2;
    const mx = (wx: number): number => worldToMapX(wx, half, SIZE);
    const my = (wz: number): number => worldToMapY(wz, half, SIZE);

    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = 'rgba(10,12,14,0.55)';
    g.fillRect(0, 0, SIZE, SIZE);

    const dot = (wx: number, wz: number, r: number, color: string): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(mx(wx), my(wz), r, 0, Math.PI * 2);
      g.fill();
    };

    // Obstacles as faint world-fixed blocks (platforms slightly brighter).
    for (const b of sim.map.boxes) {
      if (b.kind === 'wall') continue;
      g.fillStyle = b.kind === 'platform' ? 'rgba(232,222,210,0.20)' : 'rgba(232,222,210,0.10)';
      const x0 = mx(b.minX);
      const y0 = my(b.minZ);
      g.fillRect(x0, y0, Math.max(2, mx(b.maxX) - x0), Math.max(2, my(b.maxZ) - y0));
    }

    // Barrels
    for (let i = 0; i < sim.barrels.count; i++) {
      if (sim.barrels.alive[i]) dot(sim.barrels.x[i], sim.barrels.z[i], 2, '#ffc46b');
    }

    // Pickups
    for (let i = 0; i < sim.pickups.alive.length; i++) {
      if (sim.pickups.alive[i]) dot(sim.pickups.posX[i], sim.pickups.posZ[i], 2, '#b8ff5e');
    }

    // Enemies
    const mgr = sim.enemies;
    for (let i = 0; i < mgr.highWater; i++) {
      if (!mgr.aliveFlags[i] || mgr.state[i] === EState.Dying) continue;
      const cfg = mgr.configOf(i);
      const isBoss = cfg.role === 'boss';
      dot(
        mgr.posX[i], mgr.posZ[i],
        isBoss ? 5 : mgr.elite[i] ? 3.2 : 2.4,
        isBoss ? '#ff2952' : cfg.role === 'ranged' ? '#86e83c' : cfg.role === 'exploder' ? '#ff7a2e' : cfg.role === 'support' ? '#3ec9a7' : '#e8574a',
      );
    }

    // Player arrow at world position; ONLY the arrow rotates with yaw.
    g.save();
    g.translate(mx(sim.player.x), my(sim.player.z));
    g.rotate(playerArrowAngle(sim.player.yaw));
    g.fillStyle = '#e8ded2';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();

    // Arena border
    g.strokeStyle = 'rgba(255,122,46,0.4)';
    g.lineWidth = 1;
    g.strokeRect(1, 1, SIZE - 2, SIZE - 2);
  }
}
