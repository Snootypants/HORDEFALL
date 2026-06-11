/**
 * Run-flow screens: pause, level-up upgrade picker, between-wave shop,
 * game-over with full run summary, and the loading/boot screen.
 */

import { el, button, formatTime } from '../dom';
import { playUiSound } from '../uiSound';
import type { Screen } from '../UIManager';
import type { GameApi } from './api';
import { UPGRADES } from '../../config/upgrades';
import { WEAPONS } from '../../config/weapons';
import { BALANCE } from '../../config/balance';
import { rollUpgradeChoices } from '../../sim/progression/upgradeEffects';
import { weaponById } from '../../config/weapons';

export function createPauseMenu(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '380px';
  const stats = el('div', { className: 'stat-grid' });
  panel.append(
    el('div', { className: 'heading', text: 'Paused' }),
    stats,
    button('Resume', () => api.resumeGame()),
    button('Settings', () => {
      api.ui.settingsReturnTo = 'pause';
      api.openScreen('settings');
    }),
    button('Abandon Run', () => api.quitToMenu(), 'btn btn-danger'),
  );
  root.appendChild(panel);
  return {
    root,
    onShow: () => {
      const sim = api.sim;
      if (!sim) return;
      stats.replaceChildren(
        el('span', { className: 'k', text: 'Wave' }), el('span', { className: 'v', text: String(sim.waves.wave) }),
        el('span', { className: 'k', text: 'Score' }), el('span', { className: 'v', text: sim.progression.score.toLocaleString() }),
        el('span', { className: 'k', text: 'Kills' }), el('span', { className: 'v', text: String(sim.stats.kills) }),
        el('span', { className: 'k', text: 'Time' }), el('span', { className: 'v', text: formatTime(sim.time) }),
        el('span', { className: 'k', text: 'Seed' }), el('span', { className: 'v', text: String(sim.seed) }),
      );
    },
  };
}

export function createUpgradeScreen(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const heading = el('div', { className: 'heading', text: 'Level Up' });
  const sub = el('div', { className: 'muted', text: 'choose one augment' });
  const cards = el('div', { id: 'upgrade-cards' });
  root.append(heading, sub, cards);

  return {
    root,
    onShow: () => {
      const sim = api.sim;
      if (!sim) return;
      heading.textContent = `Level ${sim.progression.level}`;
      const choices = rollUpgradeChoices(
        sim.rng.fork(`upgrade-${sim.progression.level}-${sim.progression.pendingLevelUps}`),
        UPGRADES,
        sim.upgradeStacks,
        BALANCE.progression.upgradeChoices,
        BALANCE.progression.rarityWeights,
      );
      cards.replaceChildren(
        ...choices.map((u) => {
          const have = sim.upgradeStacks.get(u.id) ?? 0;
          const card = el('button', { className: `upgrade-card rarity-${u.rarity}` }, [
            el('div', { className: 'u-icon', text: u.icon }),
            el('div', { className: 'u-name', text: u.name }),
            el('div', { className: 'u-desc', text: u.description }),
            el('div', { className: 'u-stacks', text: `${u.rarity.toUpperCase()} · ${have}/${u.maxStacks} owned` }),
          ]);
          card.addEventListener('click', () => {
            playUiSound('click');
            api.applyUpgradeChoice(u.id);
          });
          card.addEventListener('pointerenter', () => playUiSound('hover'));
          return card;
        }),
      );
      if (choices.length === 0) {
        cards.replaceChildren(el('div', { className: 'muted', text: 'All augments maxed. Impressive.' }));
        window.setTimeout(() => api.resumeGame(), 600);
      }
    },
  };
}

export function createShopScreen(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '620px';
  const creditsLine = el('div', { className: 'mono accent' });
  creditsLine.style.fontSize = '22px';
  const grid = el('div', { className: 'shop-grid' });
  panel.append(
    el('div', { className: 'heading', text: 'Armory' }),
    creditsLine,
    el('div', {
      className: 'muted',
      text: `Guns are bought here — weapon caches also drop after waves ${BALANCE.economy.weaponCacheWaves.join(' & ')}.`,
    }),
    grid,
    button('Return to the field', () => api.resumeGame(), 'btn btn-phosphor'),
  );
  root.appendChild(panel);

  const render = (): void => {
    const sim = api.sim;
    if (!sim) return;
    creditsLine.textContent = `◈ ${sim.credits} credits`;
    const eco = BALANCE.economy;
    const p = sim.player;
    const ammoTarget = sim.weapons.ammoRefillTarget();
    grid.replaceChildren(
      shopBtn(api, render, 'ammo',
        ammoTarget ? `Refill ${ammoTarget.name} reserve` : 'Refill ammo',
        eco.ammoPrice,
        ammoTarget ? undefined : 'all reserves full'),
      shopBtn(api, render, 'health', '+50 health', eco.healthPrice,
        p.health >= p.maxHealth ? 'integrity full' : undefined),
      shopBtn(api, render, 'armor', '+50 armor', eco.armorPrice,
        p.armor >= p.maxArmor ? 'armor full' : undefined),
      ...WEAPONS.flatMap((w) => {
        if (w.kind === 'melee') return []; // free fallback — nothing to sell
        const rt = sim.weapons.runtime.get(w.id)!;
        if (!rt.unlocked) {
          return [shopBtn(api, render, `unlock:${w.id}`, `Unlock ${w.name}`, w.unlockCost)];
        }
        if (rt.tier < w.upgrades.length) {
          const tier = w.upgrades[rt.tier];
          return [shopBtn(api, render, `tier:${w.id}`, `${w.name} T${rt.tier + 1}/${w.upgrades.length}: ${tier.label}`, tier.cost)];
        }
        return [shopBtn(api, render, `tier:${w.id}`, `${w.name}: all tiers owned`, 0, 'maxed')];
      }),
    );
  };

  return { root, onShow: render };
}

function shopBtn(
  api: GameApi,
  rerender: () => void,
  kind: Parameters<GameApi['buyShopItem']>[0],
  label: string,
  price: number,
  disabledReason?: string,
): HTMLButtonElement {
  const credits = api.sim?.credits ?? 0;
  const short = price - credits;
  const b = button(label, () => {
    if (api.buyShopItem(kind)) rerender();
  }, 'btn', disabledReason ?? `◈ ${price}`);
  if (disabledReason) {
    b.disabled = true;
  } else if (short > 0) {
    // The disabled reason a player actually wants: how far off they are.
    b.disabled = true;
    b.appendChild(el('span', { className: 'btn-reason', text: `need ◈ ${short} more` }));
  }
  return b;
}

export function createGameOverScreen(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '540px';
  const headline = el('div', { className: 'title-xl', text: 'FALLEN' });
  headline.style.fontSize = 'clamp(48px, 7vw, 84px)';
  const summary = el('div', { className: 'stat-grid' });
  panel.append(
    headline,
    el('div', { className: 'title-sub', text: 'run summary' }),
    summary,
    button('Run It Back', () => api.retryRun()),
    button('Main Menu', () => api.quitToMenu(), 'btn btn-phosphor'),
  );
  root.appendChild(panel);

  return {
    root,
    onShow: () => {
      const sim = api.sim;
      if (!sim) return;
      const s = sim.stats;
      const fav = weaponById(s.favoriteWeapon());
      const rows: [string, string][] = [
        ['Score', sim.progression.score.toLocaleString()],
        ['Waves survived', String(s.wavesSurvived)],
        ['Time survived', formatTime(s.timeSurvivedSec)],
        ['Level reached', String(sim.progression.level)],
        ['Kills', String(s.kills)],
        ['Headshots', String(s.headshots)],
        ['Bosses destroyed', String(s.bossKills)],
        ['Damage dealt', String(Math.round(s.damageDealt))],
        ['Damage taken', String(Math.round(s.damageTaken))],
        ['Accuracy', `${(s.accuracy * 100).toFixed(1)}%`],
        ['Favorite weapon', fav?.name ?? '—'],
        ['Credits earned', `◈ ${s.creditsEarned}`],
        ['Augments', s.upgradesChosen.length === 0 ? 'none' : s.upgradesChosen.join(', ')],
      ];
      summary.replaceChildren(
        ...rows.flatMap(([k, v]) => [
          el('span', { className: 'k', text: k }),
          el('span', { className: 'v', text: v }),
        ]),
      );
    },
  };
}

export function createLoadingScreen(): Screen & { setProgress: (frac: number, label: string) => void } {
  const root = el('div', { className: 'screen' });
  const label = el('div', { className: 'muted mono', text: 'booting' });
  const bar = el('div', { id: 'loading-bar', className: 'bar thin' });
  const fill = el('div', { id: 'loading-fill', className: 'bar-fill' });
  bar.appendChild(fill);
  root.append(
    el('div', { className: 'title-xl', text: 'HORDEFALL' }),
    el('div', { className: 'title-sub', text: 'initializing kill systems' }),
    bar,
    label,
  );
  return {
    root,
    setProgress: (frac, text) => {
      fill.style.width = `${Math.round(frac * 100)}%`;
      label.textContent = text;
    },
  };
}
