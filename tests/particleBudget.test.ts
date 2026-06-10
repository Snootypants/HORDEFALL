/**
 * Particle budget: the live particle count must honor the configured
 * capacity so the maxParticles graphics setting is real.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ParticleSystem } from '../src/render/fx/ParticleSystem';

function makeSystem(): ParticleSystem {
  return new ParticleSystem(new THREE.Scene());
}

describe('particle capacity', () => {
  it('caps active particles at the configured capacity', () => {
    const ps = makeSystem();
    ps.setCapacity(256);
    for (let i = 0; i < 40; i++) ps.burst(0, 1, 0, 0xffffff, 50, 3, 2);
    expect(ps.activeCount).toBeLessThanOrEqual(256);
  });

  it('raising capacity allows more live particles', () => {
    const ps = makeSystem();
    ps.setCapacity(256);
    for (let i = 0; i < 40; i++) ps.burst(0, 1, 0, 0xffffff, 50, 3, 2);
    const low = ps.activeCount;
    ps.setCapacity(2048);
    for (let i = 0; i < 40; i++) ps.burst(0, 1, 0, 0xffffff, 50, 3, 2);
    expect(ps.activeCount).toBeGreaterThan(low);
  });

  it('clamps capacity to sane bounds', () => {
    const ps = makeSystem();
    ps.setCapacity(-5);
    for (let i = 0; i < 10; i++) ps.burst(0, 1, 0, 0xffffff, 50, 3, 2);
    expect(ps.activeCount).toBeGreaterThan(0); // never fully disabled by capacity
  });
});
