/**
 * Final-pass screen shader: vignette, subtle chromatic aberration, and a red
 * damage flash. Cheap single pass — all effects collapse to two texture taps
 * at rest.
 */

export const ScreenFxShader = {
  name: 'ScreenFxShader',
  uniforms: {
    tDiffuse: { value: null },
    damageFlash: { value: 0.0 },
    aberration: { value: 0.0 },
    vignette: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float damageFlash;
    uniform float aberration;
    uniform float vignette;
    varying vec2 vUv;

    void main() {
      vec2 center = vUv - 0.5;
      float dist = length(center);

      // Chromatic aberration scales with distance from center + pulse
      float ab = aberration * dist * 0.012;
      vec2 dir = dist > 0.0001 ? normalize(center) : vec2(0.0);
      float r = texture2D(tDiffuse, vUv + dir * ab).r;
      vec2 gb = texture2D(tDiffuse, vUv - dir * ab * 0.5).gb;
      vec3 color = vec3(r, gb);

      // Vignette
      float vig = smoothstep(0.85, 0.35, dist * (1.0 + vignette));
      color *= mix(1.0, vig, vignette + damageFlash * 0.3);

      // Damage flash: red wash strongest at the edges
      color = mix(color, vec3(0.75, 0.05, 0.07), damageFlash * (0.25 + dist * 0.9));

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
