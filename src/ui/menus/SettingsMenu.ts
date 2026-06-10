/**
 * Settings: tabbed Game / Graphics / Audio / Controls (with key rebinding).
 * Mutates api.saveData.settings, then api.applySettings() persists and
 * pushes changes into live systems.
 */

import { el, button, settingRow, slider, checkbox, select } from '../dom';
import { playUiSound } from '../uiSound';
import type { Screen } from '../UIManager';
import type { GameApi } from './api';
import { ACTION_LABELS, DEFAULT_KEYBINDS, type GameAction } from '../../input/bindings';
import type { GraphicsQuality } from '../../save/SaveManager';

const QUALITY_PRESETS: Record<GraphicsQuality, { shadows: boolean; particles: boolean; postProcessing: boolean; renderScale: number; maxDecals: number; maxCorpses: number; maxParticles: number }> = {
  low: { shadows: false, particles: false, postProcessing: false, renderScale: 0.75, maxDecals: 32, maxCorpses: 10, maxParticles: 512 },
  medium: { shadows: false, particles: true, postProcessing: true, renderScale: 0.9, maxDecals: 64, maxCorpses: 25, maxParticles: 1024 },
  high: { shadows: true, particles: true, postProcessing: true, renderScale: 1.0, maxDecals: 128, maxCorpses: 40, maxParticles: 2048 },
  ultra: { shadows: true, particles: true, postProcessing: true, renderScale: 1.0, maxDecals: 256, maxCorpses: 80, maxParticles: 4096 },
};

export function createSettingsMenu(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  const tabs = el('div', { className: 'tabs' });
  const body = el('div');
  let activeTab = 'game';

  const tabNames = ['game', 'graphics', 'audio', 'controls'] as const;
  const tabButtons = new Map<string, HTMLElement>();
  for (const name of tabNames) {
    const tab = el('button', { className: 'tab', text: name.toUpperCase() });
    tab.addEventListener('click', () => {
      playUiSound('click');
      activeTab = name;
      render();
    });
    tab.addEventListener('pointerenter', () => playUiSound('hover'));
    tabs.appendChild(tab);
    tabButtons.set(name, tab);
  }

  const render = (): void => {
    for (const [name, tab] of tabButtons) tab.classList.toggle('active', name === activeTab);
    body.replaceChildren();
    const s = api.saveData.settings;

    if (activeTab === 'game') {
      body.append(
        settingRow('Mouse sensitivity', slider(s.mouseSensitivity, 0.1, 3, 0.05, (v) => {
          s.mouseSensitivity = v;
          api.applySettings();
        })),
        settingRow('Field of view', slider(s.fov, 60, 110, 1, (v) => {
          s.fov = v;
          api.applySettings();
        })),
        settingRow('Invert Y axis', checkbox(s.invertY, (v) => {
          s.invertY = v;
          api.applySettings();
        })),
      );
    } else if (activeTab === 'graphics') {
      const g = s.graphics;
      body.append(
        settingRow('Quality preset', select(
          (['low', 'medium', 'high', 'ultra'] as const).map((q) => ({ value: q, label: q.toUpperCase() })),
          g.quality,
          (v) => {
            g.quality = v as GraphicsQuality;
            Object.assign(g, QUALITY_PRESETS[g.quality]);
            api.applySettings();
            render();
          },
        )),
        settingRow('Shadows', checkbox(g.shadows, (v) => { g.shadows = v; api.applySettings(); })),
        settingRow('Particles', checkbox(g.particles, (v) => { g.particles = v; api.applySettings(); })),
        settingRow('Post-processing', checkbox(g.postProcessing, (v) => { g.postProcessing = v; api.applySettings(); })),
        settingRow('Render scale', slider(g.renderScale, 0.5, 1.25, 0.05, (v) => { g.renderScale = v; api.applySettings(); })),
        settingRow('Max decals', slider(g.maxDecals, 0, 256, 16, (v) => { g.maxDecals = v; api.applySettings(); })),
        settingRow('Max corpses', slider(g.maxCorpses, 0, 100, 5, (v) => { g.maxCorpses = v; api.applySettings(); })),
        settingRow('Max particles', slider(g.maxParticles, 256, 4096, 256, (v) => { g.maxParticles = v; api.applySettings(); })),
        el('div', { className: 'muted', text: 'Shadow toggles apply fully on next run.' }),
      );
    } else if (activeTab === 'audio') {
      const a = s.audio;
      const buses = ['master', 'music', 'sfx', 'ui', 'weapons', 'enemies', 'ambient'] as const;
      for (const bus of buses) {
        body.append(settingRow(bus, slider(a[bus], 0, 1, 0.02, (v) => {
          a[bus] = v;
          api.applySettings();
        })));
      }
    } else {
      // Controls — rebinding
      body.append(el('div', { className: 'muted', text: 'Click a binding, then press any key or mouse button. ESC cancels.' }));
      for (const action of Object.keys(ACTION_LABELS) as GameAction[]) {
        const bindBtn = el('button', { className: 'bind-btn', text: prettyKey(s.keybinds[action]) });
        bindBtn.addEventListener('click', () => {
          playUiSound('click');
          bindBtn.classList.add('listening');
          bindBtn.textContent = 'PRESS KEY…';
          api.input.captureNextKey((code) => {
            if (code !== 'Escape') {
              s.keybinds[action] = code;
              api.applySettings();
            }
            bindBtn.classList.remove('listening');
            bindBtn.textContent = prettyKey(s.keybinds[action]);
          });
        });
        body.append(settingRow(ACTION_LABELS[action], bindBtn));
      }
      body.append(button('Reset to defaults', () => {
        s.keybinds = { ...DEFAULT_KEYBINDS };
        api.applySettings();
        render();
      }, 'btn btn-danger'));
    }
  };

  panel.append(
    el('div', { className: 'heading', text: 'Settings' }),
    tabs,
    body,
    button('Back', () => api.openScreen(api.ui.settingsReturnTo)),
  );
  root.appendChild(panel);

  return { root, onShow: render };
}

function prettyKey(code: string): string {
  return code
    .replace('Key', '')
    .replace('Digit', '')
    .replace('Mouse0', 'LMB')
    .replace('Mouse2', 'RMB')
    .replace('Mouse1', 'MMB')
    .replace('ControlLeft', 'L-CTRL')
    .replace('ShiftLeft', 'L-SHIFT')
    .replace('Backquote', '~');
}
