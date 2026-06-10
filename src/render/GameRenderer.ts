/**
 * Presentation orchestrator: owns all render subsystems for a run, subscribes
 * to sim events for effects (tracers, blood, explosions, recoil, damage
 * flash), and draws one frame per rAF from sim state. The sim never calls
 * into here — events only.
 */

import * as THREE from 'three';
import type { Simulation } from '../sim/Simulation';
import type { GraphicsSettings } from '../save/SaveManager';
import { CoreRenderer } from './Renderer';
import { WorldRenderer } from './WorldRenderer';
import { EnemyRenderer } from './EnemyRenderer';
import { ParticleSystem } from './fx/ParticleSystem';
import { TracerSystem } from './fx/TracerSystem';
import { DecalSystem } from './fx/DecalSystem';
import { CameraRig } from './CameraRig';
import { ViewModel } from './ViewModel';
import { ProjectileRenderer, PickupRenderer, CompanionRenderer } from './EntityRenderers';
import { DebugDraw } from './DebugDraw';
import { clamp, dist2XZ } from '../core/math';

export interface RenderFrame {
  dt: number;
  time: number;
  lookDX: number;
  lookDY: number;
  aiming: boolean;
}

export class GameRenderer {
  readonly core: CoreRenderer;
  readonly cameraRig: CameraRig;
  readonly viewModel: ViewModel;
  readonly particles: ParticleSystem;
  readonly tracers: TracerSystem;
  readonly decals: DecalSystem;
  readonly debugDraw: DebugDraw;
  private readonly world: WorldRenderer;
  private readonly enemyRenderer: EnemyRenderer;
  private readonly projectileRenderer: ProjectileRenderer;
  private readonly pickupRenderer: PickupRenderer;
  private readonly companionRenderer: CompanionRenderer;
  private readonly sim: Simulation;
  private readonly explosionLights: THREE.PointLight[] = [];
  private lightCursor = 0;
  private damageFlash = 0;
  private aberrationPulse = 0;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(canvas: HTMLCanvasElement, sim: Simulation, settings: GraphicsSettings, fov: number) {
    this.sim = sim;
    this.core = new CoreRenderer(canvas, settings, fov);
    this.core.applyMapTheme(sim.map.config);
    this.cameraRig = new CameraRig(this.core.camera, fov);
    this.core.scene.add(this.core.camera); // required for camera-attached viewmodel
    this.viewModel = new ViewModel(this.core.camera);
    this.viewModel.setWeapon(sim.weapons.current);
    this.world = new WorldRenderer(sim.map, this.core.scene, settings.shadows);
    this.enemyRenderer = new EnemyRenderer(sim.enemies, this.core.scene, settings.shadows);
    this.particles = new ParticleSystem(this.core.scene);
    this.particles.enabled = settings.particles;
    this.particles.density = settings.quality === 'low' ? 0.4 : settings.quality === 'medium' ? 0.7 : 1;
    this.particles.setCapacity(settings.maxParticles);
    this.tracers = new TracerSystem(this.core.scene);
    this.decals = new DecalSystem(this.core.scene, settings.maxDecals);
    this.projectileRenderer = new ProjectileRenderer(this.core.scene);
    this.pickupRenderer = new PickupRenderer(this.core.scene);
    this.companionRenderer = new CompanionRenderer(this.core.scene);
    this.debugDraw = new DebugDraw(this.core.scene, sim);

    for (let i = 0; i < 3; i++) {
      const light = new THREE.PointLight(0xffaa55, 0, 20, 2);
      this.core.scene.add(light);
      this.explosionLights.push(light);
    }

    this.subscribe();
  }

  private subscribe(): void {
    const bus = this.sim.bus;
    const u = this.unsubscribers;
    u.push(bus.on('tracer', (e) => this.tracers.fire(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, e.color)));
    u.push(bus.on('arc:chain', (e) => this.tracers.fire(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, 0x7af2ff)));
    u.push(bus.on('companion:fired', (e) => this.tracers.fire(e.x0, e.y0, e.z0, e.x1, e.y1, e.z1, 0x9adcff)));
    u.push(bus.on('impact', (e) => {
      if (e.surface === 'world') {
        this.particles.burst(e.x, e.y, e.z, 0xffc46b, 5, 3, 0.4, 8);
        this.decals.stamp(e.x, e.y, e.z, e.nx, e.ny, e.nz);
      }
    }));
    u.push(bus.on('enemy:hit', (e) => {
      this.particles.burst(e.x, e.y, e.z, 0xc42847, e.isCrit ? 10 : 6, 2.5, 0.5, 9);
    }));
    u.push(bus.on('enemy:died', (e) => {
      this.particles.burst(e.x, e.y, e.z, 0x8c2433, 14, 3.5, 0.7, 7);
    }));
    u.push(bus.on('enemy:shield-break', (e) => {
      this.particles.burst(e.x, e.y, e.z, 0x66ccff, 16, 4, 0.6, 4);
    }));
    u.push(bus.on('status:reaction', (e) => {
      this.particles.burst(e.x, e.y, e.z, 0xcfe8ff, 18, 5, 0.6, 5);
    }));
    u.push(bus.on('explosion', (e) => {
      this.particles.burst(e.x, e.y + 0.3, e.z, 0xff9a3d, 22, 7, 0.8, 7);
      this.particles.burst(e.x, e.y + 0.6, e.z, 0x55504a, 12, 3, 1.4, 2); // smoke
      this.decals.stamp(e.x, 0.02, e.z, 0, 1, 0, true);
      const light = this.explosionLights[this.lightCursor];
      this.lightCursor = (this.lightCursor + 1) % this.explosionLights.length;
      light.position.set(e.x, e.y + 1, e.z);
      light.intensity = 60;
      light.distance = e.radius * 4;
      const d2 = dist2XZ(e.x, e.z, this.sim.player.x, this.sim.player.z);
      this.cameraRig.addTrauma(clamp(0.55 - Math.sqrt(d2) / 40, 0, 0.55));
      this.aberrationPulse = Math.min(1.5, this.aberrationPulse + 0.7);
    }));
    u.push(bus.on('weapon:fired', () => this.viewModel.onFired()));
    u.push(bus.on('weapon:recoil', (e) => this.cameraRig.addRecoil(e.pitchDeg, e.yawDeg)));
    u.push(bus.on('weapon:reload-start', (e) => this.viewModel.onReload(e.duration)));
    u.push(bus.on('weapon:switched', () => this.viewModel.setWeapon(this.sim.weapons.current)));
    u.push(bus.on('player:damaged', (e) => {
      this.damageFlash = Math.min(1, this.damageFlash + clamp(e.amount / 50, 0.15, 0.6));
      this.cameraRig.addTrauma(clamp(e.amount / 70, 0.12, 0.5));
    }));
    u.push(bus.on('boss:attack', () => this.cameraRig.addTrauma(0.25)));
    u.push(bus.on('boss:spawned', () => this.cameraRig.addTrauma(0.6)));
    u.push(bus.on('pickup:collected', (e) => {
      this.particles.burst(this.sim.player.x, this.sim.player.y + 1, this.sim.player.z, 0xb8ff5e, 6, 2, 0.4, 3);
      void e;
    }));
  }

  applySettings(settings: GraphicsSettings): void {
    this.core.applySettings(settings);
    this.particles.enabled = settings.particles;
    this.particles.density = settings.quality === 'low' ? 0.4 : settings.quality === 'medium' ? 0.7 : 1;
    this.particles.setCapacity(settings.maxParticles);
    this.decals.setCapacity(settings.maxDecals);
  }

  render(frame: RenderFrame): void {
    const sim = this.sim;
    const player = sim.player;

    // Decay screen feedback
    this.damageFlash = Math.max(0, this.damageFlash - frame.dt * 1.8);
    this.aberrationPulse = Math.max(0, this.aberrationPulse - frame.dt * 2.5);
    const lowHealthPulse = player.alive && player.health / player.maxHealth < 0.3
      ? 0.25 + Math.sin(frame.time * 5) * 0.1
      : 0;
    this.core.setScreenFx(
      Math.min(1, this.damageFlash + lowHealthPulse * 0.6),
      0.4 + this.aberrationPulse,
      0.35,
    );

    for (const light of this.explosionLights) {
      light.intensity = Math.max(0, light.intensity - frame.dt * 220);
    }

    this.cameraRig.update(frame.dt, player, frame.time, frame.aiming, sim.weapons.current.adsZoom);
    this.viewModel.update(
      frame.dt,
      frame.lookDX,
      frame.lookDY,
      Math.sqrt(player.velX ** 2 + player.velZ ** 2),
      frame.time,
      this.cameraRig.aimingFraction,
    );

    this.core.setFogMult(sim.waves.fogDensityMult);
    this.core.followShadowTarget(player.x, player.z);

    this.enemyRenderer.update(frame.time, player.x, player.z);
    this.projectileRenderer.update(sim.playerProjectiles, sim.enemyProjectiles);
    this.pickupRenderer.update(sim.pickups, frame.time);
    this.companionRenderer.update(sim.companions, frame.time);
    this.world.syncBarrels(sim.barrels);
    this.particles.update(frame.dt);
    this.tracers.update(frame.dt);
    this.decals.update(frame.dt);
    this.debugDraw.update();

    this.core.render(frame.dt);
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.world.dispose(this.core.scene);
  }
}
