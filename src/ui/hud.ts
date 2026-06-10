/**
 * In-game HUD: vitals bars, ammo block, weapon slots, topline (wave/score/
 * combo/credits), XP bar, crosshair + hitmarker, boss bar, wave banner,
 * announcements, directional damage indicators, active perks, break timer.
 * Pure DOM, updated once per frame from sim state; event-driven flourishes
 * (hitmarkers, banners) subscribe to the bus.
 */

import type { Simulation } from '../sim/Simulation';
import { upgradeById } from '../config/upgrades';
import { xpForLevel } from '../sim/progression/Progression';
import { BALANCE } from '../config/balance';
import { el, formatTime } from './dom';

export class Hud {
  readonly root: HTMLElement;
  private readonly hpFill: HTMLElement;
  private readonly hpLabel: HTMLElement;
  private readonly armorFill: HTMLElement;
  private readonly staminaFill: HTMLElement;
  private readonly ammoCount: HTMLElement;
  private readonly weaponName: HTMLElement;
  private readonly reloadHint: HTMLElement;
  private readonly weaponSlots: HTMLElement;
  private readonly waveText: HTMLElement;
  private readonly scoreText: HTMLElement;
  private readonly comboText: HTMLElement;
  private readonly creditsText: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly levelTag: HTMLElement;
  private readonly bossWrap: HTMLElement;
  private readonly bossName: HTMLElement;
  private readonly bossFill: HTMLElement;
  private readonly waveBanner: HTMLElement;
  private readonly announce: HTMLElement;
  private readonly hitmarker: HTMLElement;
  private readonly damageVignette: HTMLElement;
  private readonly perksList: HTMLElement;
  private readonly breakTimer: HTMLElement;
  private readonly breakTimerValue: HTMLElement;
  private reviveTag!: HTMLElement;
  private readonly indicators: HTMLElement[] = [];

  private hitmarkerLeft = 0;
  private announceLeft = 0;
  private bannerLeft = 0;
  private vignetteLevel = 0;
  private bossMaxHp = 1;
  private readonly unsubs: (() => void)[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'hud' });

    const vitals = el('div', { id: 'hud-vitals', className: 'hud-corner' });
    const hpBar = el('div', { className: 'bar' });
    this.hpFill = el('div', { className: 'bar-fill', id: 'hp-fill' });
    this.hpLabel = el('span');
    const hpLabelWrap = el('div', { className: 'bar-label' }, [el('span', { text: 'INTEGRITY' }), this.hpLabel as HTMLElement]);
    hpBar.append(this.hpFill, hpLabelWrap);
    const armorBar = el('div', { className: 'bar thin' });
    this.armorFill = el('div', { className: 'bar-fill', id: 'armor-fill' });
    armorBar.append(this.armorFill);
    const staminaBar = el('div', { className: 'bar thin' });
    this.staminaFill = el('div', { className: 'bar-fill', id: 'stamina-fill' });
    staminaBar.append(this.staminaFill);
    this.reviveTag = el('div', { id: 'revive-tag' });
    vitals.append(hpBar, armorBar, staminaBar, this.reviveTag);

    const ammo = el('div', { id: 'hud-ammo', className: 'hud-corner' });
    this.weaponName = el('div', { id: 'weapon-name' });
    this.ammoCount = el('div', { id: 'ammo-count' });
    this.reloadHint = el('div', { id: 'reload-hint' });
    this.weaponSlots = el('div', { id: 'weapon-slots' });
    ammo.append(this.weaponName, this.ammoCount, this.reloadHint, this.weaponSlots);

    const topline = el('div', { id: 'hud-topline', className: 'hud-corner' });
    this.waveText = el('div', { id: 'hud-wave', text: 'W-0' });
    this.scoreText = el('div', { id: 'hud-score', text: '0' });
    this.comboText = el('div', { id: 'hud-combo', text: '' });
    this.creditsText = el('div', { id: 'hud-credits', text: '◈ 0' });
    topline.append(this.waveText, this.scoreText, this.comboText, this.creditsText);

    const xpBar = el('div', { id: 'xp-bar', className: 'bar thin' });
    this.xpFill = el('div', { className: 'bar-fill', id: 'xp-fill' });
    xpBar.append(this.xpFill);
    this.levelTag = el('div', { id: 'level-tag', text: 'LV 1' });

    const crosshair = el('div', { id: 'crosshair' });
    crosshair.appendChild(el('div', { className: 'dot' }));
    for (const [w, h, x, y] of [[10, 2, 6, -1], [10, 2, -16, -1], [2, 10, -1, 6], [2, 10, -1, -16]] as const) {
      const arm = el('div', { className: 'arm' });
      arm.style.cssText = `width:${w}px;height:${h}px;left:${x}px;top:${y}px;`;
      crosshair.appendChild(arm);
    }
    this.hitmarker = el('div', { id: 'hitmarker' });

    this.bossWrap = el('div', { id: 'boss-bar-wrap' });
    this.bossName = el('div', { id: 'boss-name' });
    const bossBar = el('div', { className: 'bar' });
    this.bossFill = el('div', { className: 'bar-fill', id: 'boss-fill' });
    bossBar.append(this.bossFill);
    this.bossWrap.append(this.bossName, bossBar);

    this.waveBanner = el('div', { id: 'wave-banner' });
    this.announce = el('div', { id: 'announce' });
    this.damageVignette = el('div', { id: 'damage-vignette' });
    this.perksList = el('div', { id: 'perks-list' });

    this.breakTimer = el('div', { id: 'break-timer' });
    this.breakTimerValue = el('div', { className: 't' });
    this.breakTimer.append(this.breakTimerValue, el('div', { className: 'hint', text: '[B] armory open — next wave incoming' }));

    for (let i = 0; i < 6; i++) {
      const ind = el('div', { className: 'dmg-indicator' });
      this.indicators.push(ind);
      this.root.appendChild(ind);
    }

    this.root.append(
      this.damageVignette, vitals, ammo, topline, xpBar, this.levelTag, crosshair,
      this.hitmarker, this.bossWrap, this.waveBanner, this.announce, this.perksList, this.breakTimer,
    );
    parent.appendChild(this.root);
  }

  /** Subscribe HUD flourishes to a run's bus. Call once per run. */
  wire(sim: Simulation): void {
    this.unwire();
    const bus = sim.bus;
    this.unsubs.push(bus.on('enemy:hit', () => {
      this.hitmarkerLeft = 0.12;
      this.hitmarker.classList.remove('kill');
    }));
    this.unsubs.push(bus.on('enemy:died', (e) => {
      if (!e.killedByPlayer) return;
      this.hitmarkerLeft = 0.2;
      this.hitmarker.classList.add('kill');
    }));
    this.unsubs.push(bus.on('wave:start', (e) => {
      this.showBanner(`WAVE ${e.wave}`, e.eventId === 'normal' ? '' : `${e.name} — ${e.description}`);
    }));
    this.unsubs.push(bus.on('wave:cleared', (e) => {
      this.showAnnounce(`WAVE ${e.wave} CLEARED — ${formatTime(e.clearTimeSec)}`);
    }));
    this.unsubs.push(bus.on('player:killstreak', (e) => this.showAnnounce(`${e.streak} KILL STREAK`)));
    this.unsubs.push(bus.on('player:levelup', (e) => this.showAnnounce(`LEVEL ${e.level}`)));
    this.unsubs.push(bus.on('boss:spawned', (e) => {
      this.bossWrap.style.display = 'block';
      this.bossName.textContent = e.name;
      this.bossMaxHp = e.maxHp;
    }));
    this.unsubs.push(bus.on('boss:died', () => {
      this.bossWrap.style.display = 'none';
      this.showAnnounce('BOSS DESTROYED');
    }));
    this.unsubs.push(bus.on('player:damaged', (e) => {
      this.vignetteLevel = Math.min(1, this.vignetteLevel + 0.5);
      this.spawnIndicator(e.fromX, e.fromZ, sim);
    }));
    this.unsubs.push(bus.on('player:downed', (e) => {
      this.showBanner('DOWN', e.revivesLeft > 0 ? 'emergency revival engaging…' : 'no revives left');
    }));
    this.unsubs.push(bus.on('player:revived', (e) => {
      this.showAnnounce(`REVIVED — ${e.revivesLeft} ${e.revivesLeft === 1 ? 'REVIVE' : 'REVIVES'} LEFT`);
    }));
    this.unsubs.push(bus.on('boss:phase', (e) => this.showAnnounce(`BOSS ENRAGED — PHASE ${e.phase}`)));
    this.unsubs.push(bus.on('achievement:unlocked', (e) => this.showAnnounce(`ACHIEVEMENT — ${e.name}`)));
  }

  unwire(): void {
    for (const unsub of this.unsubs) unsub();
    this.unsubs.length = 0;
  }

  private showBanner(title: string, sub: string): void {
    this.waveBanner.replaceChildren(
      el('div', { className: 'wave-num', text: title }),
      el('div', { className: 'wave-event', text: sub }),
    );
    this.waveBanner.style.opacity = '1';
    this.bannerLeft = 2.6;
  }

  private showAnnounce(text: string): void {
    this.announce.textContent = text;
    this.announce.style.opacity = '1';
    this.announceLeft = 2.2;
  }

  private spawnIndicator(fromX: number, fromZ: number, sim: Simulation): void {
    const ind = this.indicators.find((d) => d.style.opacity === '' || d.style.opacity === '0');
    if (!ind) return;
    const angle = Math.atan2(-(fromX - sim.player.x), -(fromZ - sim.player.z));
    const rel = angle - sim.player.yaw;
    ind.style.transform = `translate(-50%, -50%) rotate(${(-rel * 180) / Math.PI}deg)`;
    ind.style.opacity = '1';
    ind.dataset.life = '0.9';
  }

  setVisible(v: boolean): void {
    this.root.style.display = v ? 'block' : 'none';
  }

  update(sim: Simulation, dt: number): void {
    const p = sim.player;
    this.hpFill.style.width = `${(p.health / p.maxHealth) * 100}%`;
    this.hpLabel.textContent = `${Math.ceil(p.health)}/${Math.round(p.maxHealth)}`;
    this.armorFill.style.width = `${p.maxArmor > 0 ? (p.armor / p.maxArmor) * 100 : 0}%`;
    this.staminaFill.style.width = `${(p.stamina / BALANCE.player.staminaMax) * 100}%`;

    const weapon = sim.weapons.current;
    const rt = sim.weapons.state();
    this.weaponName.textContent = weapon.name;
    this.ammoCount.replaceChildren(
      document.createTextNode(`${rt.mag} `),
      el('span', { className: 'reserve', text: `/ ${rt.reserve}` }),
    );
    this.reloadHint.textContent = sim.weapons.reloading ? 'RELOADING' : rt.mag === 0 ? 'EMPTY — [R]' : '';

    this.weaponSlots.replaceChildren(
      ...sim.weapons.weapons.map((w) => {
        const slotRt = sim.weapons.runtime.get(w.id)!;
        const tag = el('span', { className: 'wslot', text: String(w.slot) });
        if (!slotRt.unlocked) tag.classList.add('locked');
        if (w.id === weapon.id) tag.classList.add('active');
        return tag;
      }),
    );

    this.reviveTag.textContent = sim.revivesLeft > 0 ? `⊕ ${'▮'.repeat(sim.revivesLeft)} REVIVE` : '';

    this.waveText.textContent = `W-${Math.max(1, sim.waves.wave)}`;
    this.scoreText.textContent = sim.progression.score.toLocaleString();
    this.comboText.textContent = sim.progression.comboMult > 1 ? `x${sim.progression.comboMult.toFixed(1)}` : '';
    this.creditsText.textContent = `◈ ${sim.credits}`;

    const xpNeeded = xpForLevel(sim.progression.level, BALANCE.progression);
    this.xpFill.style.width = `${(sim.progression.xp / xpNeeded) * 100}%`;
    this.levelTag.textContent = `LV ${sim.progression.level}${sim.progression.pendingLevelUps > 0 ? ` (+${sim.progression.pendingLevelUps})` : ''}`;

    // Boss hp
    if (sim.enemies.bossIdx >= 0) {
      this.bossFill.style.width = `${(sim.enemies.hp[sim.enemies.bossIdx] / this.bossMaxHp) * 100}%`;
    }

    // Perks
    this.perksList.replaceChildren(
      ...[...sim.upgradeStacks.entries()].map(([id, count]) => {
        const cfg = upgradeById(id);
        return el('div', { className: 'perk-tag', text: `${cfg?.icon ?? '?'} ${cfg?.name ?? id}${count > 1 ? ` ×${count}` : ''}` });
      }),
    );

    // Break timer
    if (sim.waves.state === 'break' && sim.waves.wave > 0) {
      this.breakTimer.style.display = 'block';
      this.breakTimerValue.textContent = Math.ceil(sim.waves.breakLeft).toString();
    } else {
      this.breakTimer.style.display = 'none';
    }

    // Timed fades
    this.hitmarkerLeft -= dt;
    this.hitmarker.style.opacity = this.hitmarkerLeft > 0 ? '1' : '0';
    this.announceLeft -= dt;
    if (this.announceLeft <= 0) this.announce.style.opacity = '0';
    this.bannerLeft -= dt;
    if (this.bannerLeft <= 0) this.waveBanner.style.opacity = '0';
    this.vignetteLevel = Math.max(0, this.vignetteLevel - dt * 1.2);
    const lowHp = p.alive && p.health / p.maxHealth < 0.3 ? 0.45 : 0;
    this.damageVignette.style.opacity = String(Math.max(this.vignetteLevel, lowHp));

    for (const ind of this.indicators) {
      const life = parseFloat(ind.dataset.life ?? '0');
      if (life > 0) {
        ind.dataset.life = String(life - dt);
        if (life - dt <= 0) ind.style.opacity = '0';
      }
    }
  }
}
