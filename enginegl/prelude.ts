// GLSL wrapped around every shader piece. Pieces write a Shadertoy-style
// `mainImage(out vec4 fragColor, in vec2 fragCoord)`; kiln supplies the
// uniforms, helpers and a `main` that supersamples for AA + motion blur.
import type { ParamSchema } from '../engine2d';

/** Hashing, color and noise helpers, shared by every GPU engine. */
export const GLSL_HELPERS = /* glsl */ `
#ifndef PI
#define PI 3.14159265359
#define TAU 6.28318530718
#endif

float kiln_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 kiln_linear(vec3 c) { return pow(max(c, 0.0), vec3(2.2)); }
vec3 kiln_srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT), with the r² = 0.5
// kernel that stays continuous across cells (no flicker in animation).
vec3 kiln_mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 kiln_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 kiln_permute(vec4 x) { return kiln_mod289(((x * 34.0) + 1.0) * x); }
vec4 kiln_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float kiln_snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = kiln_mod289(i);
  vec4 p = kiln_permute(kiln_permute(kiln_permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = kiln_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

mat2 kiln_rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
`;

export const PRELUDE = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2 u_resolution;   // full image size in pixels
uniform vec2 u_offset;       // this tile's origin within the full image (bottom-left, px)
uniform float u_time;        // frame time, seconds
uniform float u_duration;    // loop length, seconds (0 for stills)
uniform float u_fps;
uniform float u_frame;
uniform float u_seed;
uniform int u_samples;       // sub-samples per pixel
uniform float u_shutter;     // fraction of a frame the shutter stays open

out vec4 kiln_out;

// Time of the current sub-sample; use iTime / iPhase rather than u_time.
float kiln_t;

#define PI 3.14159265359
#define TAU 6.28318530718
#define iResolution vec3(u_resolution, 1.0)
#define iTime kiln_t
#define iFrame int(u_frame)
#define iPhase (u_duration > 0.0 ? fract(kiln_t / u_duration) : 0.0)

` + GLSL_HELPERS;

export const MAIN = /* glsl */ `
void main() {
  vec3 acc = vec3(0.0);
  for (int s = 0; s < u_samples; s++) {
    float fs = float(s);
    // Low-discrepancy sub-pixel jitter (R2 sequence) + stratified shutter time.
    vec2 jitter = u_samples > 1 ? fract(0.5 + fs * vec2(0.7548776662, 0.5698402910)) - 0.5 : vec2(0.0);
    kiln_t = u_time + ((fs + 0.5) / float(u_samples) - 0.5) * u_shutter / u_fps;
    vec4 c = vec4(0.0);
    mainImage(c, gl_FragCoord.xy + u_offset + jitter);
    acc += kiln_linear(c.rgb);
  }
  kiln_out = vec4(kiln_srgb(acc / float(u_samples)), 1.0);
}
`;

/** Uniform declarations generated from a piece's param schema (prefix u_). */
export function paramUniforms(schema: ParamSchema): string {
  return Object.entries(schema)
    .map(([k, p]) => {
      switch (p.kind) {
        case 'color':
          return `uniform vec3 u_${k};`;
        case 'palette':
          return `uniform vec3 u_${k}[8]; uniform float u_${k}_n; uniform vec3 u_${k}_bg; uniform vec3 u_${k}_ink;`;
        default:
          return `uniform float u_${k};`; // number, int, bool (0/1), choice (option index)
      }
    })
    .join('\n');
}
