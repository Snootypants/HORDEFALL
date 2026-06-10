/**
 * The application orchestrator: boots subsystems, owns the rAF + fixed-step
 * loop, manages run lifecycle (start/pause/game-over/retry), implements the
 * GameApi surface menus act through, and persists profile/run data.
 */

import { MAPS, mapById } from '../config/maps';
import { validateAllConfigs, formatValidationReport } from '../config/validation';
import { BALANCE } from '../config/balance';
import { FixedTimestepLoop } from '../core/GameLoop';
import { Logger, LogLevel } from '../core/Logger';
import { Simulation } from '../sim/Simulation';
import { neutralInput, resetFrameEdges, type InputCommand } from '../sim/inputCommand';
import { GameRenderer } from '../render/GameRenderer';
import { SaveManager, type SaveDataV2 } from '../save/SaveManager';
import { AudioManager } from '../audio/AudioManager';
import { wireAudio } from '../audio/audioWiring';
import { InputManager } from '../input/InputManager';
import { UIManager, type ScreenName } from '../ui/UIManager';
import { setUiSoundHook } from '../ui/uiSound';
import { Hud } from '../ui/hud';
import { Minimap } from '../ui/Minimap';
import { DamageNumbers } from '../ui/DamageNumbers';
import { DevConsole } from '../debug/DevConsole';
import { PerfOverlay } from '../debug/PerfOverlay';
import { AchievementTracker } from './achievements';
import { registerScreens } from './setupScreens';
import { runDevAction, type DevAction } from './devActions';
import { persistRunResults } from './persistRun';
import type { GameApi } from '../ui/menus/api';
import type { DebugDraw } from '../render/DebugDraw';

const SIM_DT = 1 / 60;

export class Game implements GameApi {
  readonly log = new Logger('game', LogLevel.Info);
  readonly saveManager = new SaveManager(window.localStorage);
  saveData: SaveDataV2;
  readonly ui = new UIManager();
  readonly audio: AudioManager;
  readonly input: InputManager;
  readonly hud: Hud;
  readonly minimap: Minimap;
  readonly damageNumbers: DamageNumbers;
  readonly devConsole: DevConsole;
  readonly perfOverlay: PerfOverlay;
  readonly achievements: AchievementTracker;

  sim: Simulation | null = null;
  renderer: GameRenderer | null = null;
  private loop: FixedTimestepLoop;
  private readonly canvas: HTMLCanvasElement;
  private playing = false;
  private gameOverPending = 0;
  private lastFrame = 0;
  private lastRun: { mapId: string; seed: number; daily: boolean } | null = null;
  private audioUnwire: (() => void) | null = null;
  private gameOverUnsub: (() => void) | null = null;
  private simMs = 0;
  private renderMs = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.saveData = this.saveManager.load();
    this.audio = new AudioManager(this.saveData.settings.audio);
    this.input = new InputManager(canvas);
    this.hud = new Hud(this.ui.root);
    this.minimap = new Minimap(this.ui.root);
    this.damageNumbers = new DamageNumbers(this.ui.root);
    this.devConsole = new DevConsole(this.ui.root, this);
    this.perfOverlay = new PerfOverlay(this.ui.root);
    this.achievements = new AchievementTracker(this.saveData, () => this.saveManager.save(this.saveData));
    this.loop = new FixedTimestepLoop(SIM_DT, (dt) => this.step(dt));
    this.applyInputSettings();
    this.hud.setVisible(false);
    this.minimap.setVisible(false);
  }

  get debugDraw(): DebugDraw | null {
    return this.renderer?.debugDraw ?? null;
  }

  boot(): void {
    const report = validateAllConfigs();
    const text = formatValidationReport(report);
    if (report.errors.length > 0) this.log.error(text);
    else this.log.info(text);
    this.devConsole.print(text, report.errors.length ? 'log-error' : '');

    registerScreens(this);
    setUiSoundHook((kind) => this.audio.play(kind === 'click' ? 'ui-click' : 'ui-hover', kind === 'click' ? 0.9 : 0.5, kind === 'hover' ? 60 : 0));
    this.ui.show('main-menu');
    this.audioOnFirstGesture();
    this.input.onPointerLockChange((locked) => {
      if (!locked && this.playing && !this.ui.uiOpen && this.gameOverPending <= 0) this.pauseGame();
    });

    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    this.log.info('boot complete');
  }

  private audioOnFirstGesture(): void {
    const resume = (): void => this.audio.resume();
    window.addEventListener('pointerdown', resume, { once: true });
    window.addEventListener('keydown', resume, { once: true });
  }

  // -------------------------------------------------------------- run flow

  startRun(mapId: string, seed: number | null, daily: boolean): void {
    this.teardownRun();
    const mapConfig = mapById(mapId) ?? MAPS[0];
    const finalSeed = seed ?? Math.floor(Math.random() * 0xffffffff);
    this.lastRun = { mapId, seed: finalSeed, daily };
    this.log.info(`run start: map=${mapId} seed=${finalSeed} daily=${daily}`);

    this.sim = new Simulation({
      mapConfig,
      seed: finalSeed,
      unlockedWeapons: this.saveData.unlocks.weapons,
    });
    this.sim.enemies.setCorpseBudget(this.saveData.settings.graphics.maxCorpses);
    this.renderer = new GameRenderer(this.canvas, this.sim, this.saveData.settings.graphics, this.saveData.settings.fov);
    this.audioUnwire = wireAudio(this.sim.bus, this.audio);
    this.hud.wire(this.sim);
    this.damageNumbers.wire(this.sim.bus);
    this.achievements.wire(this.sim);
    this.gameOverUnsub = this.sim.bus.on('run:gameover', () => {
      this.gameOverPending = 1.4;
    });

    this.sim.startRun();
    this.playing = true;
    this.gameOverPending = 0;
    this.loop.reset();
    this.resumeGame();
  }

  retryRun(): void {
    if (this.lastRun) {
      const seed = this.lastRun.daily ? this.lastRun.seed : Math.floor(Math.random() * 0xffffffff);
      this.startRun(this.lastRun.mapId, seed, this.lastRun.daily);
    }
  }

  private teardownRun(): void {
    this.gameOverUnsub?.();
    this.gameOverUnsub = null;
    this.gameOverPending = 0; // a pending game-over must never fire on a new run
    this.audioUnwire?.();
    this.audioUnwire = null;
    this.hud.unwire();
    this.damageNumbers.unwire();
    this.achievements.unwire();
    if (this.renderer) {
      this.renderer.dispose(); // unsubscribes, frees GPU resources, removes listeners
      this.renderer = null;
    }
    this.sim = null;
    this.playing = false;
  }

  quitToMenu(): void {
    if (this.sim && this.playing) this.persistRunResults();
    this.teardownRun();
    this.hud.setVisible(false);
    this.minimap.setVisible(false);
    this.input.gameplayEnabled = false;
    this.input.exitPointerLock();
    this.ui.show('main-menu');
  }

  pauseGame(): void {
    if (!this.playing || !this.sim) return;
    this.input.gameplayEnabled = false;
    this.input.exitPointerLock();
    this.ui.show('pause');
  }

  resumeGame(): void {
    if (!this.sim) return;
    this.ui.show('none');
    this.hud.setVisible(true);
    this.minimap.setVisible(true);
    this.input.gameplayEnabled = true;
    this.input.requestPointerLock();
  }

  openScreen(name: ScreenName): void {
    this.input.gameplayEnabled = false;
    this.ui.show(name);
  }

  private onGameOver(): void {
    this.persistRunResults();
    this.input.gameplayEnabled = false;
    this.input.exitPointerLock();
    this.ui.show('game-over');
  }

  private persistRunResults(): void {
    if (!this.sim) return;
    persistRunResults(this.sim, this.saveData);
    this.achievements.checkAll(this.sim);
    this.saveManager.save(this.saveData);
    this.playing = false;
  }

  // -------------------------------------------------------------- the loop

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dtReal = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    const cmd = this.input.sample();
    this.handleHotkeys();

    if (this.sim && this.playing && !this.ui.uiOpen) {
      const t0 = performance.now();
      this.advanceSim(dtReal, cmd);
      this.simMs = performance.now() - t0;
    }

    if (this.sim && this.renderer) {
      const t0 = performance.now();
      this.renderer.render({
        dt: dtReal,
        time: now / 1000,
        lookDX: this.input.lastLookDX,
        lookDY: this.input.lastLookDY,
        aiming: cmd.aim,
      });
      this.renderMs = performance.now() - t0;
      this.hud.update(this.sim, dtReal);
      this.minimap.update(this.sim);
      this.damageNumbers.update(dtReal, this.renderer.core.camera);
    }

    this.perfOverlay.update(dtReal, this.sim, this.renderer, this.simMs, this.sim?.perfAiMs ?? 0, this.renderMs);

    if (this.gameOverPending > 0) {
      this.gameOverPending -= dtReal;
      if (this.gameOverPending <= 0) this.onGameOver();
    }

    // Auto-open the upgrade picker on pending level-ups.
    if (this.sim && this.playing && !this.ui.uiOpen && this.gameOverPending <= 0 && this.sim.progression.pendingLevelUps > 0 && this.sim.player.alive) {
      this.sim.bus.emit('player:levelup', { level: this.sim.progression.level });
      this.openScreen('upgrade');
      this.input.exitPointerLock();
    }
  }

  /**
   * Edges (clicks, jumps, look deltas) accumulate here until a fixed step
   * consumes them. On high-refresh displays some rAF frames run ZERO sim
   * steps — without accumulation those frames would silently drop inputs.
   * The first step of a batch consumes all edges (resetFrameEdges), so
   * look deltas are applied exactly once regardless of step count.
   */
  private readonly pendingCmd: InputCommand = neutralInput();

  private advanceSim(dtReal: number, cmd: InputCommand): void {
    const p = this.pendingCmd;
    // Held state mirrors the latest sample…
    p.moveX = cmd.moveX;
    p.moveZ = cmd.moveZ;
    p.sprint = cmd.sprint;
    p.crouch = cmd.crouch;
    p.fire = cmd.fire;
    p.aim = cmd.aim;
    // …edges and deltas accumulate until consumed.
    p.firePressed ||= cmd.firePressed;
    p.jump ||= cmd.jump;
    p.reload ||= cmd.reload;
    p.interact ||= cmd.interact;
    if (cmd.weaponSlot) p.weaponSlot = cmd.weaponSlot;
    if (cmd.weaponDelta) p.weaponDelta = cmd.weaponDelta;
    p.lookDX += cmd.lookDX;
    p.lookDY += cmd.lookDY;
    this.loop.advance(dtReal);
  }

  private step(dt: number): void {
    if (!this.sim) return;
    this.sim.tick(dt, this.pendingCmd);
    resetFrameEdges(this.pendingCmd);
  }

  private handleHotkeys(): void {
    if (this.input.consumeUiPress('toggleConsole')) this.devConsole.toggle();
    if (this.input.consumeUiPress('toggleDebugOverlay')) this.perfOverlay.toggle();

    if (this.input.consumeUiPress('pause')) {
      if (this.devConsole.visible) this.devConsole.toggle(false);
      else if (this.ui.current === 'pause' || this.ui.current === 'shop' || this.ui.current === 'debug-menu') this.resumeGame();
      else if (this.ui.current === 'settings') this.openScreen(this.ui.settingsReturnTo);
      else if (this.playing && !this.ui.uiOpen) this.pauseGame();
    }
    if (this.playing && this.sim && !this.ui.uiOpen && this.input.consumeUiPress('openShop')) {
      if (this.sim.waves.state === 'break') {
        this.input.gameplayEnabled = false;
        this.input.exitPointerLock();
        this.ui.show('shop');
      }
    }
    if (this.playing && this.input.consumeUiPress('toggleDebugMenu')) {
      this.input.exitPointerLock();
      this.openScreen('debug-menu');
    }
  }

  // -------------------------------------------------------------- settings

  applySettings(): void {
    this.saveManager.save(this.saveData);
    this.audio.applySettings(this.saveData.settings.audio);
    this.applyInputSettings();
    this.sim?.enemies.setCorpseBudget(this.saveData.settings.graphics.maxCorpses);
    if (this.renderer) {
      this.renderer.applySettings(this.saveData.settings.graphics);
      this.renderer.core.setFov(this.saveData.settings.fov);
      this.renderer.cameraRig.setBaseFov(this.saveData.settings.fov);
    }
  }

  private applyInputSettings(): void {
    this.input.bindings = { ...this.saveData.settings.keybinds };
    this.input.mouseSensitivity = this.saveData.settings.mouseSensitivity;
    this.input.invertY = this.saveData.settings.invertY;
  }

  // ------------------------------------------------------------ api: shop

  applyUpgradeChoice(id: string): void {
    if (!this.sim) return;
    if (this.sim.progression.consumePendingLevelUp()) {
      this.sim.applyUpgrade(id);
    }
    if (this.sim.progression.pendingLevelUps > 0) this.ui.show('upgrade');
    else this.resumeGame();
  }

  buyShopItem(kind: Parameters<GameApi['buyShopItem']>[0]): boolean {
    const sim = this.sim;
    if (!sim) return false;
    const eco = BALANCE.economy;
    const tryBuy = (price: number, apply: () => void): boolean => {
      if (sim.credits < price) return false;
      sim.credits -= price;
      apply();
      this.audio.play('purchase');
      return true;
    };
    if (kind === 'ammo') return tryBuy(eco.ammoPrice, () => sim.weapons.refillCurrent());
    if (kind === 'health') return tryBuy(eco.healthPrice, () => sim.player.heal(50));
    if (kind === 'armor') return tryBuy(eco.armorPrice, () => sim.player.addArmor(50));
    if (kind.startsWith('unlock:')) {
      const id = kind.slice(7);
      const cfg = sim.weapons.weapons.find((w) => w.id === id);
      if (!cfg) return false;
      return tryBuy(cfg.unlockCost, () => sim.weapons.unlock(id));
    }
    if (kind.startsWith('tier:')) {
      const id = kind.slice(5);
      const cfg = sim.weapons.weapons.find((w) => w.id === id);
      const rt = sim.weapons.runtime.get(id);
      if (!cfg || !rt || rt.tier >= cfg.upgrades.length) return false;
      return tryBuy(cfg.upgrades[rt.tier].cost, () => sim.weapons.buyUpgradeTier(id));
    }
    return false;
  }

  // ------------------------------------------------------------- api: dev

  devSpawn(enemyId: string, count: number): void { this.dev({ kind: 'spawn', enemyId, count }); }
  devStress(count: number): void { this.dev({ kind: 'stress', count }); }
  devGod(): boolean { return this.dev({ kind: 'god' }) as boolean; }
  devNoclip(): boolean { return this.dev({ kind: 'noclip' }) as boolean; }
  devSkipWave(): void { this.dev({ kind: 'skipwave' }); }
  devForceBoss(): void { this.dev({ kind: 'forceboss' }); }
  devUnlockAll(): void { this.dev({ kind: 'unlockall' }); }
  devKillAll(): void { this.dev({ kind: 'killall' }); }

  private dev(action: DevAction): unknown {
    if (!this.sim) return undefined;
    return runDevAction(this.sim, action);
  }
}
