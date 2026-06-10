/**
 * Floating damage numbers: a fixed pool of absolutely-positioned DOM nodes
 * projected from world space each frame. Pool recycles oldest under pressure;
 * crits render bigger and hotter.
 */

import * as THREE from 'three';
import type { GameBus } from '../sim/events';

const POOL = 48;
const LIFE = 0.8;

interface Slot {
  node: HTMLElement;
  life: number;
  x: number;
  y: number;
  z: number;
  vy: number;
}

const project = new THREE.Vector3();

export class DamageNumbers {
  private readonly slots: Slot[] = [];
  private cursor = 0;
  private unsub: (() => void) | null = null;
  enabled = true;

  constructor(parent: HTMLElement) {
    for (let i = 0; i < POOL; i++) {
      const node = document.createElement('div');
      node.className = 'damage-number';
      node.style.display = 'none';
      parent.appendChild(node);
      this.slots.push({ node, life: 0, x: 0, y: 0, z: 0, vy: 0 });
    }
  }

  wire(bus: GameBus): void {
    this.unwire();
    this.unsub = bus.on('damage-number', (e) => {
      if (!this.enabled) return;
      const slot = this.slots[this.cursor];
      this.cursor = (this.cursor + 1) % POOL;
      slot.life = LIFE;
      slot.x = e.x + (Math.random() - 0.5) * 0.5;
      slot.y = e.y;
      slot.z = e.z + (Math.random() - 0.5) * 0.5;
      slot.vy = 2.2;
      slot.node.textContent = String(e.amount);
      slot.node.style.display = 'block';
      slot.node.style.fontSize = e.isCrit ? '22px' : '15px';
      slot.node.style.color = e.isCrit ? '#ffb14d' : '#e8ded2';
    });
  }

  unwire(): void {
    this.unsub?.();
    this.unsub = null;
    for (const s of this.slots) {
      s.life = 0;
      s.node.style.display = 'none';
    }
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const s of this.slots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.node.style.display = 'none';
        continue;
      }
      s.y += s.vy * dt;
      s.vy *= 1 - dt * 2;
      project.set(s.x, s.y, s.z).project(camera);
      if (project.z > 1) {
        s.node.style.display = 'none';
        continue;
      }
      s.node.style.display = 'block';
      s.node.style.left = `${((project.x + 1) / 2) * w}px`;
      s.node.style.top = `${((1 - project.y) / 2) * h}px`;
      s.node.style.opacity = String(Math.min(1, s.life / (LIFE * 0.5)));
    }
  }
}
