/**
 * Bridges the replay viewer onto the Game's presentation stack: mounts the
 * read-only replay Simulation under the normal renderer/HUD/audio WITHOUT
 * wiring achievements, run-recording, or persistence.
 */

import type { Game } from './Game';
import type { Simulation } from '../sim/Simulation';
import type { ReplayHost } from './replayMode';
import { GameRenderer } from '../render/GameRenderer';
import { wireAudio } from '../audio/audioWiring';

export function createReplayHost(game: Game): ReplayHost {
  return {
    mount: (sim: Simulation): void => {
      game.teardownRun();
      game.sim = sim;
      game.recorder = null; // viewing, not recording
      game.renderer = new GameRenderer(game.canvas, sim, game.saveData.settings.graphics, game.saveData.settings.fov);
      game.audioUnwire = wireAudio(sim.bus, game.audio);
      game.hud.wire(sim);
      game.hud.setVisible(true);
      game.minimap.setVisible(true);
      game.ui.show('none');
      game.input.gameplayEnabled = false;
    },
    unmount: (): void => {
      game.teardownRun();
      game.hud.setVisible(false);
      game.minimap.setVisible(false);
      game.ui.show('main-menu');
    },
    setFreeCam: (on: boolean): void => {
      if (game.renderer) game.renderer.freeCam = on;
    },
  };
}
