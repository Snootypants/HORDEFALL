/**
 * Quake-style developer console (~ key): command registry with help text,
 * recent-log echo, and command history. Commands act through GameApi —
 * the console knows nothing about engine internals.
 */

import { el } from '../ui/dom';
import type { GameApi } from '../ui/menus/api';
import { validateAllConfigs, formatValidationReport } from '../config/validation';

interface Command {
  usage: string;
  help: string;
  run: (args: string[], api: GameApi, print: (s: string, cls?: string) => void) => void;
}

export class DevConsole {
  readonly root: HTMLElement;
  private readonly log: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly history: string[] = [];
  private historyIdx = -1;
  visible = false;

  private readonly commands = new Map<string, Command>();

  constructor(parent: HTMLElement, private readonly api: GameApi) {
    this.root = el('div', { id: 'dev-console' });
    this.log = el('div', { id: 'console-log' });
    this.input = el('input', { id: 'console-input' });
    this.input.spellcheck = false;
    this.root.append(this.log, this.input);
    parent.appendChild(this.root);

    this.input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.execute(this.input.value);
        this.input.value = '';
      } else if (e.key === 'ArrowUp') {
        this.historyIdx = Math.min(this.historyIdx + 1, this.history.length - 1);
        this.input.value = this.history[this.history.length - 1 - this.historyIdx] ?? '';
      } else if (e.key === 'ArrowDown') {
        this.historyIdx = Math.max(this.historyIdx - 1, -1);
        this.input.value = this.historyIdx === -1 ? '' : this.history[this.history.length - 1 - this.historyIdx];
      } else if (e.key === 'Backquote' || e.key === '`' || e.key === 'Escape') {
        this.toggle(false);
      }
    });

    this.registerDefaults();
    this.print('HORDEFALL dev console — type "help"', 'log-echo');
  }

  toggle(show = !this.visible): void {
    this.visible = show;
    this.root.style.display = show ? 'flex' : 'none';
    if (show) this.input.focus();
    else this.input.blur();
  }

  print(text: string, cls = ''): void {
    const line = el('div', { text });
    if (cls) line.className = cls;
    this.log.appendChild(line);
    while (this.log.childElementCount > 200) this.log.firstElementChild?.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }

  private execute(raw: string): void {
    const trimmed = raw.trim();
    if (!trimmed) return;
    this.history.push(trimmed);
    this.historyIdx = -1;
    this.print(`> ${trimmed}`, 'log-echo');
    const [name, ...args] = trimmed.split(/\s+/);
    const cmd = this.commands.get(name.toLowerCase());
    if (!cmd) {
      this.print(`unknown command "${name}" — try "help"`, 'log-error');
      return;
    }
    try {
      cmd.run(args, this.api, (s, cls) => this.print(s, cls));
    } catch (err) {
      this.print(`error: ${(err as Error).message}`, 'log-error');
    }
  }

  private register(name: string, usage: string, help: string, run: Command['run']): void {
    this.commands.set(name, { usage, help, run });
  }

  private registerDefaults(): void {
    const needSim = (api: GameApi): NonNullable<GameApi['sim']> => {
      if (!api.sim) throw new Error('no active run');
      return api.sim;
    };

    this.register('help', 'help', 'list commands', (_a, _api, print) => {
      for (const [name, c] of [...this.commands.entries()].sort()) {
        print(`${c.usage.padEnd(26)} ${c.help}`, name ? '' : '');
      }
    });
    this.register('god', 'god', 'toggle god mode', (_a, api, print) =>
      print(`god mode: ${api.devGod()}`));
    this.register('noclip', 'noclip', 'toggle noclip flight', (_a, api, print) =>
      print(`noclip: ${api.devNoclip()}`));
    this.register('give', 'give <credits|xp> <n>', 'grant credits or xp', (a, api, print) => {
      const sim = needSim(api);
      const n = parseInt(a[1] ?? '100', 10);
      if (a[0] === 'credits') {
        sim.credits += n;
        print(`+${n} credits`);
      } else if (a[0] === 'xp') {
        sim.progression.addXp(n);
        print(`+${n} xp (level ${sim.progression.level})`);
      } else print('usage: give <credits|xp> <n>', 'log-warn');
    });
    this.register('spawn', 'spawn <enemyId> [n]', 'spawn enemies near player', (a, api, print) => {
      api.devSpawn(a[0] ?? 'rusher', parseInt(a[1] ?? '1', 10));
      print(`spawned ${a[1] ?? 1}× ${a[0] ?? 'rusher'}`);
    });
    this.register('stress', 'stress <n>', 'stress test: spawn n enemies in a ring', (a, api, print) => {
      api.devStress(parseInt(a[0] ?? '500', 10));
      print(`stress: ${a[0] ?? 500} enemies inbound`);
    });
    this.register('killall', 'killall', 'kill every enemy', (_a, api, print) => {
      api.devKillAll();
      print('horde deleted');
    });
    this.register('wave', 'wave <n>', 'jump to wave n', (a, api, print) => {
      needSim(api).waves.jumpToWave(parseInt(a[0] ?? '1', 10));
      print(`jumping to wave ${a[0]}`);
    });
    this.register('skipwave', 'skipwave', 'end break / clear current wave', (_a, api, print) => {
      api.devSkipWave();
      print('wave skipped');
    });
    this.register('forceboss', 'forceboss', 'force a boss next wave', (_a, api, print) => {
      api.devForceBoss();
      print('boss signal sent');
    });
    this.register('unlockall', 'unlockall', 'unlock all weapons', (_a, api, print) => {
      api.devUnlockAll();
      print('arsenal unlocked');
    });
    this.register('heal', 'heal', 'restore health/armor', (_a, api, print) => {
      const sim = needSim(api);
      sim.player.heal(9999);
      sim.player.addArmor(9999);
      print('restored');
    });
    this.register('upgrade', 'upgrade <id>', 'grant an upgrade stack', (a, api, print) => {
      const sim = needSim(api);
      if (sim.applyUpgrade(a[0] ?? '')) print(`applied ${a[0]}`);
      else print(`unknown or maxed upgrade "${a[0]}"`, 'log-warn');
    });
    this.register('validate', 'validate', 'run config validation report', (_a, _api, print) => {
      const report = validateAllConfigs();
      for (const line of formatValidationReport(report).split('\n')) {
        print(line, report.errors.length ? 'log-error' : '');
      }
    });
    this.register('seed', 'seed', 'print current run seed', (_a, api, print) =>
      print(`seed: ${needSim(api).seed} (map ${needSim(api).map.config.id})`));
    this.register('clear', 'clear', 'clear console output', () => this.log.replaceChildren());
  }
}
