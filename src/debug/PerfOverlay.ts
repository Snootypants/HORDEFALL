/**
 * Performance overlay (F3): FPS, frame/sim/AI timings, draw calls,
 * triangles, entity counts, pool occupancy, JS heap when available.
 */

import { el } from '../ui/dom';
import type { Simulation } from '../sim/Simulation';
import type { GameRenderer } from '../render/GameRenderer';

export class PerfOverlay {
  readonly root: HTMLElement;
  visible = false;
  private frames = 0;
  private fpsTimer = 0;
  private fps = 0;
  private updateTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'perf-overlay' });
    parent.appendChild(this.root);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
  }

  update(dt: number, sim: Simulation | null, renderer: GameRenderer | null, simMs: number, aiMs: number, renderMs: number): void {
    this.frames++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTimer);
      this.frames = 0;
      this.fpsTimer = 0;
    }
    if (!this.visible) return;
    this.updateTimer += dt;
    if (this.updateTimer < 0.25) return;
    this.updateTimer = 0;

    const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    const lines = [
      `FPS        ${this.fps}`,
      `frame      ${(dt * 1000).toFixed(2)} ms`,
      `sim        ${simMs.toFixed(2)} ms`,
      `enemy/AI   ${aiMs.toFixed(2)} ms`,
      `render     ${renderMs.toFixed(2)} ms`,
    ];
    if (renderer) {
      lines.push(
        `draw calls ${renderer.core.drawCalls}`,
        `triangles  ${renderer.core.triangles.toLocaleString()}`,
        `particles  ${renderer.particles.activeCount}`,
        `tracers    ${renderer.tracers.activeCount}`,
        `decals     ${renderer.decals.activeCount}`,
      );
    }
    if (sim) {
      lines.push(
        `enemies    ${sim.enemies.aliveCount} (hw ${sim.enemies.highWater})`,
        `ai thinks  ${sim.enemies.aiThinksThisFrame}/frame`,
        `proj P/E   ${sim.playerProjectiles.activeCount}/${sim.enemyProjectiles.activeCount}`,
        `pickups    ${sim.pickups.activeCount}`,
        `wave       ${sim.waves.wave} [${sim.waves.state}]`,
      );
    }
    if (mem) lines.push(`js heap    ${(mem.usedJSHeapSize / 1048576).toFixed(1)} MB`);
    this.root.textContent = lines.join('\n');
  }
}
