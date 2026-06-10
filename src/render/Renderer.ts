/**
 * Core Three.js setup: renderer, scene, lights, fog, post-processing chain,
 * and graphics-settings application. Owns nothing game-specific — entity
 * renderers attach to `scene` and are driven by GameRenderer (index.ts).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { GraphicsSettings } from '../save/SaveManager';
import type { MapConfig } from '../config/types';
import { ScreenFxShader } from './ScreenFxShader';

export class CoreRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private screenFxPass: ShaderPass | null = null;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private settings: GraphicsSettings;
  private baseFogDensity = 0.012;
  fogMult = 1;

  constructor(canvas: HTMLCanvasElement, settings: GraphicsSettings, fov: number) {
    this.settings = settings;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.quality !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Manual reset: EffectComposer renders multiple passes per frame and
    // auto-reset would leave info reflecting only the final quad.
    this.renderer.info.autoReset = false;

    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.05, 400);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x223322, 0.5);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    this.sun.position.set(40, 60, 25);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.camera.far = 180;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.applySettings(settings);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyMapTheme(map: MapConfig): void {
    this.scene.background = new THREE.Color(map.skyColor);
    this.baseFogDensity = map.fogDensity;
    this.scene.fog = new THREE.FogExp2(map.fogColor, map.fogDensity);
    this.hemi.color.set(0xbbccff);
    this.hemi.groundColor.set(map.groundColor);
    this.sun.color.set(map.accentColor).lerp(new THREE.Color(0xfff2dd), 0.7);
  }

  applySettings(s: GraphicsSettings): void {
    this.settings = s;
    this.renderer.shadowMap.enabled = s.shadows;
    this.sun.castShadow = s.shadows;
    const pixelRatio = Math.min(window.devicePixelRatio, s.quality === 'ultra' ? 2 : 1.5) * s.renderScale;
    this.renderer.setPixelRatio(pixelRatio);
    this.rebuildComposer();
    this.resize();
  }

  private rebuildComposer(): void {
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    this.screenFxPass = null;
    if (!this.settings.postProcessing) return;
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.settings.quality !== 'low') {
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        this.settings.quality === 'ultra' ? 0.55 : 0.4,
        0.6,
        0.82,
      );
      this.composer.addPass(this.bloomPass);
    }
    this.screenFxPass = new ShaderPass(ScreenFxShader);
    this.composer.addPass(this.screenFxPass);
    this.composer.addPass(new OutputPass());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Screen-space feedback uniforms (damage flash, aberration pulse). */
  setScreenFx(damageFlash: number, aberration: number, vignette: number): void {
    if (!this.screenFxPass) return;
    const u = this.screenFxPass.uniforms as Record<string, { value: number }>;
    u.damageFlash.value = damageFlash;
    u.aberration.value = aberration;
    u.vignette.value = vignette;
  }

  /** Fog event support: density multiplier eases toward the target. */
  setFogMult(mult: number): void {
    this.fogMult = mult;
  }

  /** Keep the shadow frustum centered on the player. */
  followShadowTarget(x: number, z: number): void {
    this.sun.position.set(x + 40, 60, z + 25);
    this.sun.target.position.set(x, 0, z);
  }

  render(dt: number): void {
    this.renderer.info.reset();
    const fog = this.scene.fog as THREE.FogExp2 | null;
    if (fog) {
      const target = this.baseFogDensity * this.fogMult;
      fog.density += (target - fog.density) * Math.min(1, dt * 1.5);
    }
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  get drawCalls(): number {
    return this.renderer.info.render.calls;
  }

  get triangles(): number {
    return this.renderer.info.render.triangles;
  }
}
