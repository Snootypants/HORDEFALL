/**
 * Static checker behind the sim dependency-boundary test. Scans TypeScript
 * source text (comments stripped) for imports or globals that would couple
 * the headless sim to Three.js, the DOM, or presentation layers.
 */

/** Layers src/sim must never import from. */
const FORBIDDEN_LAYERS = ['render', 'ui', 'audio', 'save', 'input', 'game', 'debug'];

/** DOM/platform globals the sim must never reference. */
const FORBIDDEN_GLOBALS = [
  /\bwindow\s*\./,
  /\bdocument\s*\./,
  /\blocalStorage\b/,
  /\bsessionStorage\b/,
  /\bnavigator\s*\./,
  /\brequestAnimationFrame\s*\(/,
  /\bcancelAnimationFrame\s*\(/,
  /\bHTML\w*Element\b/,
  /\bCanvasRenderingContext2D\b/,
  /\bAudioContext\b/,
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** Returns human-readable violation descriptions; empty array means clean. */
export function findBoundaryViolations(source: string): string[] {
  const code = stripComments(source);
  const violations: string[] = [];

  const importRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(code)) !== null) {
    const spec = m[1] ?? m[2];
    if (spec === 'three' || spec.startsWith('three/')) {
      violations.push(`imports three.js ('${spec}')`);
      continue;
    }
    const layer = FORBIDDEN_LAYERS.find((l) => spec.includes(`/${l}/`) || spec.endsWith(`/${l}`));
    if (layer) violations.push(`imports presentation layer '${layer}' ('${spec}')`);
  }

  for (const re of FORBIDDEN_GLOBALS) {
    const hit = code.match(re);
    if (hit) violations.push(`references forbidden global '${hit[0].trim()}'`);
  }

  return violations;
}
