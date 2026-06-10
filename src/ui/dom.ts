/**
 * Tiny DOM helpers — the UI layer builds elements imperatively (no framework)
 * and these keep that terse and consistent.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { id?: string; className?: string; text?: string; html?: string } = {},
  children: HTMLElement[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs.id) node.id = attrs.id;
  if (attrs.className) node.className = attrs.className;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.html !== undefined) node.innerHTML = attrs.html;
  for (const child of children) node.appendChild(child);
  return node;
}

export function button(label: string, onClick: () => void, className = 'btn', note?: string): HTMLButtonElement {
  const b = el('button', { className });
  b.appendChild(document.createTextNode(label));
  if (note) b.appendChild(el('span', { className: 'btn-note', text: note }));
  b.addEventListener('click', onClick);
  return b;
}

export function settingRow(label: string, control: HTMLElement): HTMLDivElement {
  const row = el('div', { className: 'setting-row' });
  row.appendChild(el('label', { text: label }));
  row.appendChild(control);
  return row;
}

export function slider(value: number, min: number, max: number, step: number, onChange: (v: number) => void): HTMLInputElement {
  const input = el('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => onChange(parseFloat(input.value)));
  return input;
}

export function checkbox(checked: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
}

export function select(options: { value: string; label: string }[], current: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = el('select');
  for (const opt of options) {
    const o = el('option', { text: opt.label });
    o.value = opt.value;
    if (opt.value === current) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
