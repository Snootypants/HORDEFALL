/**
 * Live tuning console (F8 → TUNING tab): sliders over the session
 * TuningOverrides, weapon unlock/tier toggles, refills, and tuning preset
 * import/export. Sections are labeled LIVE vs NEW SPAWNS so it is always
 * clear whether existing entities are affected. Never touches save data.
 */

import { el, button, slider, checkbox, settingRow } from '../dom';
import type { GameApi } from './api';
import { WEAPONS } from '../../config/weapons';
import { ENEMIES } from '../../config/enemies';
import { PICKUPS } from '../../config/pickups';
import { BALANCE } from '../../config/balance';
import { effectiveDropOdds } from '../../sim/drops';
import { applyTuning, applyTuningJsonStrict, defaultTuning, serializeTuning, MULT_MAX } from '../../sim/tuning';

export function createTuningPanel(api: GameApi): { root: HTMLElement; refresh: () => void } {
  const root = el('div');
  root.style.maxHeight = '52vh';
  root.style.overflowY = 'auto';
  const oddsReadout = el('div', { className: 'muted mono' });
  const importStatus = el('div', { className: 'muted' });
  const jsonBox = el('textarea');
  jsonBox.rows = 5;
  jsonBox.style.width = '100%';
  jsonBox.placeholder = 'JSON box — holds raw current tuning, one saved preset, or an array of saved presets';

  /** Slider over a sparse multiplier map: 1 = default (key removed). */
  function multRow(label: string, map: Record<string, number>, key: string): HTMLElement {
    const value = el('span', { className: 'mono', text: (map[key] ?? 1).toFixed(2) });
    const s = slider(map[key] ?? 1, 0, Math.min(5, MULT_MAX), 0.05, (v) => {
      if (Math.abs(v - 1) < 1e-9) delete map[key];
      else map[key] = v;
      value.textContent = v.toFixed(2);
      refreshOdds();
    });
    const wrap = el('div', { className: 'row' });
    wrap.append(s, value);
    return settingRow(label, wrap);
  }

  function refreshOdds(): void {
    const sim = api.sim;
    if (!sim) {
      oddsReadout.textContent = 'effective drop odds: start a run for live values';
      return;
    }
    const chance = api.tuning.dropChance ?? BALANCE.economy.dropChance;
    const odds = effectiveDropOdds(PICKUPS, sim.resourceNeeds(), sim.waves.ammoDropMult, api.tuning.pickupWeightMult);
    oddsReadout.textContent =
      `drop chance ${(chance * 100).toFixed(0)}% → ` +
      odds.map((o) => `${o.id} ${(o.odds * 100).toFixed(1)}%`).join(' · ');
  }

  const refresh = (): void => {
    root.replaceChildren();

    // ---- Weapons (live)
    root.append(el('div', { className: 'muted', text: 'WEAPONS — damage & tiers apply LIVE; unlocks apply now' }));
    for (const w of WEAPONS) {
      const rowHead = el('div', { className: 'row' });
      if (w.kind === 'melee') {
        // The fallback is never lockable — show it, don't offer a checkbox.
        rowHead.append(el('span', { className: 'muted', text: '⊘' }), el('span', { text: `${w.name} (always available)` }));
      } else {
        const rt = api.sim?.weapons.runtime.get(w.id);
        // Session-only toggle: setUnlocked never touches profile unlocks and
        // refuses changes that would leave zero usable weapons.
        const unlockBox = checkbox(rt ? rt.unlocked : false, (v) => {
          if (!api.sim?.weapons.setUnlocked(w.id, v)) refresh();
        });
        unlockBox.title = 'unlocked (session only — never saved to profile)';
        rowHead.append(unlockBox, el('span', { text: w.name }));
      }
      if (w.upgrades.length > 0) {
        const tiers = api.tuning.disabledTiers;
        w.upgrades.forEach((tier, t) => {
          const on = checkbox(!(tiers[w.id] ?? []).includes(t), (enabled) => {
            const list = tiers[w.id] ?? [];
            tiers[w.id] = enabled ? list.filter((x) => x !== t) : [...list, t];
            if (tiers[w.id].length === 0) delete tiers[w.id];
          });
          on.title = `tier ${t + 1}: ${tier.label}`;
          rowHead.append(el('span', { className: 'muted', text: `T${t + 1}` }), on);
        });
      }
      root.append(rowHead, multRow(`${w.name} damage ×`, api.tuning.weaponDamageMult, w.id));
    }

    // ---- Enemies (future spawns)
    root.append(el('div', { className: 'muted', text: 'ENEMIES — applies to NEW SPAWNS only (stats bake at spawn)' }));
    for (const e of ENEMIES) {
      root.append(
        multRow(`${e.name} HP ×`, api.tuning.enemyHpMult, e.id),
        multRow(`${e.name} speed ×`, api.tuning.enemySpeedMult, e.id),
        multRow(`${e.name} damage ×`, api.tuning.enemyDamageMult, e.id),
      );
    }

    // ---- Drops (live)
    root.append(el('div', { className: 'muted', text: 'DROPS — applies LIVE to future kills' }));
    const chanceValue = el('span', { className: 'mono', text: (api.tuning.dropChance ?? BALANCE.economy.dropChance).toFixed(2) });
    const chanceSlider = slider(api.tuning.dropChance ?? BALANCE.economy.dropChance, 0, 1, 0.01, (v) => {
      api.tuning.dropChance = v;
      chanceValue.textContent = v.toFixed(2);
      refreshOdds();
    });
    const chanceWrap = el('div', { className: 'row' });
    chanceWrap.append(chanceSlider, chanceValue, button('default', () => {
      api.tuning.dropChance = null;
      refresh();
    }, 'btn'));
    root.append(settingRow('Global drop chance', chanceWrap));
    for (const p of PICKUPS) {
      root.append(multRow(`${p.id} weight ×`, api.tuning.pickupWeightMult, p.id));
    }
    root.append(oddsReadout);

    // ---- Named presets (own storage key — never in the profile save)
    root.append(el('div', { className: 'muted', text: 'PRESETS — saved locally, separate from player save data' }));
    const nameInput = el('input');
    nameInput.placeholder = 'preset name (also used by Rename)';
    nameInput.style.width = '100%';
    root.append(nameInput);
    const presetGrid = el('div', { className: 'shop-grid' });
    presetGrid.append(
      button('Save current as preset', () => {
        const saved = api.tuningPresets.save(nameInput.value || 'preset', api.tuning);
        importStatus.textContent = `saved "${saved.name}"`;
        refresh();
      }),
      button('Export all saved presets JSON', () => {
        jsonBox.value = api.tuningPresets.exportAll();
        importStatus.textContent = 'exported all presets';
      }),
      button('Import saved preset JSON', () => {
        const r = api.tuningPresets.importOne(jsonBox.value);
        importStatus.textContent = r.name
          ? `imported "${r.name}"`
          : `rejected — nothing saved: ${r.errors.join('; ')}`;
        refresh();
      }),
      button('Import all saved presets JSON', () => {
        const r = api.tuningPresets.importAll(jsonBox.value);
        importStatus.textContent = `merged ${r.added} preset(s)${r.errors.length ? ` — ${r.errors.join('; ')}` : ''}`;
        refresh();
      }),
    );
    root.append(presetGrid);
    for (const p of api.tuningPresets.list()) {
      const row = el('div', { className: 'row' });
      row.append(
        el('span', { className: 'mono', text: p.name }),
        button('Load', () => {
          const loaded = api.tuningPresets.load(p.name);
          if (loaded) {
            applyTuning(api.tuning, loaded);
            importStatus.textContent = `loaded "${p.name}"`;
            refresh();
          }
        }),
        button('Rename', () => {
          const finalName = api.tuningPresets.rename(p.name, nameInput.value || p.name);
          importStatus.textContent = finalName ? `renamed to "${finalName}"` : 'rename failed';
          refresh();
        }),
        button('Export preset', () => {
          jsonBox.value = api.tuningPresets.exportOne(p.name) ?? '';
          importStatus.textContent = `exported "${p.name}"`;
        }),
        button('Delete', () => {
          api.tuningPresets.delete(p.name);
          refresh();
        }, 'btn btn-danger'),
      );
      root.append(row);
    }

    // ---- Actions
    root.append(el('div', { className: 'muted', text: 'ACTIONS' }));
    const actions = el('div', { className: 'shop-grid' });
    actions.append(
      button('Unlock all guns', () => { api.devUnlockAll(); refresh(); }),
      button('Max all weapon tiers', () => {
        const sim = api.sim;
        if (!sim) return;
        for (const w of sim.weapons.weapons) sim.weapons.runtime.get(w.id)!.tier = w.upgrades.length;
      }),
      button('Refill health', () => api.sim?.player.heal(99_999)),
      button('Refill armor', () => api.sim?.player.addArmor(99_999)),
      button('Refill ammo', () => api.sim?.weapons.addAmmoFraction(1)),
      button('Reset tuning to defaults', () => {
        applyTuning(api.tuning, defaultTuning());
        refresh();
      }, 'btn btn-danger'),
      button('Export current tuning JSON', () => {
        jsonBox.value = serializeTuning(api.tuning);
        importStatus.textContent = 'exported current tuning';
      }),
      button('Apply current tuning JSON', () => {
        // FAIL-CLOSED: nothing applies unless the whole payload validates.
        const errors = applyTuningJsonStrict(api.tuning, jsonBox.value);
        importStatus.textContent = errors.length > 0
          ? `rejected — nothing applied: ${errors.join('; ')}`
          : 'applied current tuning';
        refresh();
      }),
    );
    root.append(actions, jsonBox, importStatus);
    refreshOdds();
  };

  return { root, refresh };
}
