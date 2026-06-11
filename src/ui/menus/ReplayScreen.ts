/**
 * Replay loader screen: paste (or pick) replay JSON and start the viewer.
 * Validation problems show inline; loading never touches save data.
 */

import { el, button } from '../dom';
import type { GameApi } from './api';
import type { Screen } from '../../ui/UIManager';

export function createReplayScreen(api: GameApi): Screen {
  const root = el('div', { className: 'screen' });
  const panel = el('div', { className: 'panel' });
  panel.style.minWidth = '560px';

  const jsonBox = el('textarea');
  jsonBox.rows = 10;
  jsonBox.style.width = '100%';
  jsonBox.placeholder = 'paste replay JSON here';
  const errorLine = el('div', { className: 'muted' });
  errorLine.id = 'replay-load-error';

  const fileInput = el('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    void file.text().then((text) => { jsonBox.value = text; });
  });

  panel.append(
    el('div', { className: 'heading', text: 'Replay Viewer' }),
    el('div', { className: 'muted', text: 'Replays are read-only — nothing here writes to your profile.' }),
    jsonBox,
    button('Load replay file…', () => fileInput.click()),
    fileInput,
    button('Start replay', () => {
      const error = api.startReplay(jsonBox.value);
      errorLine.textContent = error ? `load failed: ${error}` : '';
    }, 'btn btn-phosphor'),
    errorLine,
    button('Back', () => api.openScreen('main-menu')),
  );
  root.appendChild(panel);
  return { root, onShow: () => { errorLine.textContent = ''; } };
}
