/**
 * Architecture guardrail: src/sim is a headless simulation. It must never
 * import Three.js, presentation/platform modules (render, ui, audio, save,
 * input, game, debug), or touch DOM globals. This test fails the build the
 * moment someone leaks a dependency across that boundary.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { findBoundaryViolations } from './helpers/boundary';

const SIM_DIR = join(__dirname, '..', 'src', 'sim');

function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectTsFiles(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('findBoundaryViolations (checker behavior)', () => {
  it('flags a three.js import', () => {
    const v = findBoundaryViolations(`import * as THREE from 'three';`);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatch(/three/);
  });

  it('flags a three.js subpath import', () => {
    const v = findBoundaryViolations(`import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';`);
    expect(v).toHaveLength(1);
  });

  it('flags imports reaching into presentation layers', () => {
    for (const layer of ['render', 'ui', 'audio', 'save', 'input', 'game', 'debug']) {
      const v = findBoundaryViolations(`import { X } from '../${layer}/Thing';`);
      expect(v, `should flag ../${layer}/`).toHaveLength(1);
    }
  });

  it('flags DOM global usage', () => {
    expect(findBoundaryViolations(`const w = window.innerWidth;`)).toHaveLength(1);
    expect(findBoundaryViolations(`document.getElementById('x');`)).toHaveLength(1);
    expect(findBoundaryViolations(`localStorage.setItem('a', 'b');`)).toHaveLength(1);
    expect(findBoundaryViolations(`requestAnimationFrame(() => {});`)).toHaveLength(1);
    expect(findBoundaryViolations(`const el: HTMLCanvasElement = x;`)).toHaveLength(1);
  });

  it('flags browser input/network APIs', () => {
    expect(findBoundaryViolations(`function onKey(e: KeyboardEvent) {}`)).toHaveLength(1);
    expect(findBoundaryViolations(`function onMove(e: MouseEvent) {}`)).toHaveLength(1);
    expect(findBoundaryViolations(`function onPoint(e: PointerEvent) {}`)).toHaveLength(1);
    expect(findBoundaryViolations(`await fetch('/balance.json');`)).toHaveLength(1);
    expect(findBoundaryViolations(`const xhr = new XMLHttpRequest();`)).toHaveLength(1);
  });

  it('allows config/core/sim-internal imports and guarded performance use', () => {
    const ok = `
      import { BALANCE } from '../config/balance';
      import { Rng } from '../core/Rng';
      import { EnemyManager } from './enemies/EnemyManager';
      const t = typeof performance !== 'undefined' ? performance.now() : 0;
    `;
    expect(findBoundaryViolations(ok)).toHaveLength(0);
  });

  it('ignores mentions inside comments', () => {
    const ok = `
      // No DOM, no Three.js — the render layer reads window size, not us.
      /* document and localStorage live in src/save */
      export const x = 1;
    `;
    expect(findBoundaryViolations(ok)).toHaveLength(0);
  });
});

describe('src/sim dependency boundary', () => {
  it('contains no Three.js/DOM/presentation dependencies', () => {
    const files = collectTsFiles(SIM_DIR);
    expect(files.length).toBeGreaterThan(10); // sanity: we are scanning the real tree
    const report: string[] = [];
    for (const file of files) {
      const violations = findBoundaryViolations(readFileSync(file, 'utf8'));
      for (const v of violations) report.push(`${file}: ${v}`);
    }
    expect(report, report.join('\n')).toHaveLength(0);
  });
});
