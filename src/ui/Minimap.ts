/**
 * Canvas radar: rotates with the player, shows enemies by role color,
 * pickups, barrels, the boss, and world obstacles as faint blocks.
 */

import type { Simulation } from '../sim/Simulation';
import { EState } from '../sim/enemies/EnemyManager';

const SIZE = 168;
const RANGE = 55; // world units shown edge-to-edge/2

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
    const half = SIZE / 2;
    const px = sim.player.x;
    const pz = sim.player.z;
    const yaw = sim.player.yaw;
    const scale = half / RANGE;

    g.clearRect(0, 0, SIZE, SIZE);

    // Clip to a soft circle
    g.save();
    g.beginPath();
    g.arc(half, half, half - 2, 0, Math.PI * 2);
    g.clip();

    g.translate(half, half);
    g.rotate(-yaw); // wait: rotate map opposite to yaw so forward is up
    g.rotate(Math.PI); // forward (-Z) points up

    const dot = (wx: number, wz: number, r: number, color: string): void => {
      const dx = (wx - px) * scale;
      const dz = (wz - pz) * scale;
      if (dx * dx + dz * dz > half * half) return;
      g.fillStyle = color;
      g.beginPath();
      g.arc(dx, dz, r, 0, Math.PI * 2);
      g.fill();
    };

    // Obstacles as faint squares
    g.fillStyle = 'rgba(232,222,210,0.10)';
    for (const b of sim.map.boxes) {
      if (b.kind === 'wall') continue;
      const cx = ((b.minX + b.maxX) / 2 - px) * scale;
      const cz = ((b.minZ + b.maxZ) / 2 - pz) * scale;
      if (cx * cx + cz * cz > half * half) continue;
      const w = Math.max(2, (b.maxX - b.minX) * scale);
      const d = Math.max(2, (b.maxZ - b.minZ) * scale);
      g.fillRect(cx - w / 2, cz - d / 2, w, d);
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

    g.restore();

    // Player arrow (always center, pointing up)
    g.save();
    g.translate(half, half);
    g.fillStyle = '#e8ded2';
    g.beginPath();
    g.moveTo(0, -6);
    g.lineTo(4.5, 5);
    g.lineTo(-4.5, 5);
    g.closePath();
    g.fill();
    g.restore();

    // Ring
    g.strokeStyle = 'rgba(255,122,46,0.4)';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(half, half, half - 2, 0, Math.PI * 2);
    g.stroke();
  }
}
