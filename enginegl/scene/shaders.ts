// GLSL for the scene engine.
import { GLSL_HELPERS } from '../prelude';

const HEADER = `#version 300 es
precision highp float;
precision highp int;
`;

// Shared tile placement: orient in the plane, flip about an in-plane axis
// through the tile's centre, then lift and translate.
const PLACE = /* glsl */ `
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in float a_part;
layout(location = 3) in vec4 i_place;  // x, y, angle, seed
layout(location = 4) in vec2 i_mats;   // front, back material
layout(location = 5) in vec4 i_motion; // flip, axis angle, lift, scale
layout(location = 6) in float i_glow;

uniform mat4 u_viewProj;
uniform float u_gap;

vec3 rotZ(vec3 p, float a) {
  float c = cos(a), s = sin(a);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

vec3 rotAxis(vec3 p, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c);
}

vec3 place(vec3 p, out vec3 n) {
  n = a_normal;
  if (a_part > 2.5) return p; // ground
  float s = i_motion.w;
  p *= vec3(u_gap * s, u_gap * s, s);
  p = rotZ(p, i_place.z);
  n = rotZ(n, i_place.z);
  vec3 k = vec3(cos(i_motion.y), sin(i_motion.y), 0.0);
  p = rotAxis(p, k, i_motion.x);
  n = rotAxis(n, k, i_motion.x);
  return p + vec3(i_place.xy, i_motion.z);
}
`;

export const SCENE_VS =
  HEADER +
  PLACE +
  /* glsl */ `
out vec3 v_world;
out vec3 v_normal;
out vec3 v_local;
out float v_part;
out vec2 v_mats;
out float v_seed;
out float v_glow;

void main() {
  vec3 n;
  vec3 w = place(a_pos, n);
  v_glow = a_part > 2.5 ? 0.0 : i_glow;
  v_world = w;
  v_normal = n;
  v_local = a_part > 2.5 ? a_pos : a_pos + vec3(i_place.w * 37.0, i_place.w * 11.0, 0.0);
  v_part = a_part;
  v_mats = i_mats;
  v_seed = i_place.w;
  gl_Position = u_viewProj * vec4(w, 1.0);
}
`;

export const DEPTH_VS =
  HEADER +
  PLACE +
  /* glsl */ `
void main() {
  vec3 n;
  gl_Position = u_viewProj * vec4(place(a_pos, n), 1.0);
}
`;

export const DEPTH_FS = HEADER + `void main() {}\n`;

export const SCENE_FS =
  HEADER +
  GLSL_HELPERS +
  /* glsl */ `
in vec3 v_world;
in vec3 v_normal;
in vec3 v_local;
in float v_part;
in vec2 v_mats;
in float v_seed;
in float v_glow;
out vec4 o_color;

uniform vec3 u_glowColor;    // linear, intensity folded in
uniform vec3 u_eye;
uniform vec3 u_viewDir;
uniform float u_ortho;
uniform vec3 u_target;

uniform vec3 u_lightDir;     // towards the light
uniform vec3 u_lightColor;   // linear, intensity folded in
uniform vec3 u_sky;
uniform vec3 u_horizon;
uniform vec3 u_envGround;
uniform float u_fog;

uniform vec4 u_matA[8];      // linear rgb, roughness
uniform vec4 u_matB[8];      // metal, texture, scale, strength
uniform float u_edgeMat;
uniform float u_groundMat;

uniform sampler2D u_shadowMap;
uniform mat4 u_shadowMatrix;
uniform float u_shadowRange;
uniform float u_shadowSoft;
uniform sampler2D u_aoMap;
uniform mat4 u_aoMatrix;
uniform float u_aoRange;
uniform float u_aoRadius;
uniform float u_sample;

const vec2 POISSON[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870), vec2(0.34495938, 0.29387760),
  vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464), vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379),
  vec2(0.44323325, -0.97511554), vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367), vec2(0.14383161, -0.14100790));

// Per-pixel rotation of the sample disk; varies per sub-sample so noise averages out.
mat2 diskRotation() {
  return kiln_rot(kiln_hash12(gl_FragCoord.xy + u_sample * 17.31) * TAU);
}

float shadow(vec3 w, vec3 n, float ndl) {
  vec4 s = u_shadowMatrix * vec4(w + n * 0.01, 1.0);
  vec3 c = s.xyz / s.w * 0.5 + 0.5;
  if (any(lessThan(c, vec3(0.0))) || any(greaterThan(c, vec3(1.0)))) return 1.0;
  float bias = (0.006 + 0.02 * (1.0 - ndl)) / u_shadowRange;
  mat2 r = diskRotation();
  float lit = 0.0;
  for (int i = 0; i < 16; i++) {
    float d = texture(u_shadowMap, c.xy + r * POISSON[i] * u_shadowSoft).r;
    lit += c.z - bias <= d ? 1.0 : 0.0;
  }
  return lit / 16.0;
}

// Occlusion from above: how much nearby geometry sits over this point.
// Gives soft contact shadows in the grout and under lifted tiles.
float topOcclusion(vec3 w) {
  vec4 s = u_aoMatrix * vec4(w, 1.0);
  vec3 c = s.xyz / s.w * 0.5 + 0.5;
  if (any(lessThan(c, vec3(0.0))) || any(greaterThan(c, vec3(1.0)))) return 1.0;
  mat2 r = diskRotation();
  float occ = 0.0;
  for (int i = 0; i < 16; i++) {
    float d = texture(u_aoMap, c.xy + r * POISSON[i] * u_aoRadius).r;
    float dh = (c.z - d) * u_aoRange;
    occ += smoothstep(0.004, 0.06, dh) * (1.0 - smoothstep(0.5, 2.0, dh));
  }
  return 1.0 - 0.8 * occ / 16.0;
}

// Studio environment: sky/horizon/floor gradient, a key softbox toward the
// light and a cool rim strip opposite it. Rougher surfaces see it blurrier.
vec3 environment(vec3 d, float rough) {
  float y = d.z;
  vec3 c = y >= 0.0 ? mix(u_horizon, u_sky, pow(clamp(y, 0.0, 1.0), 0.5))
                    : mix(u_horizon, u_envGround, pow(clamp(-y, 0.0, 1.0), 0.4));
  float spread = mix(0.02, 0.8, rough);
  float key = smoothstep(1.0 - spread - 0.05, 1.0 - spread * 0.3, dot(d, u_lightDir));
  c += u_lightColor * key * (1.0 - 0.7 * rough) * 0.6;
  vec3 rimDir = normalize(vec3(-u_lightDir.xy, 0.3));
  float rim = smoothstep(1.0 - spread - 0.1, 1.0 - spread * 0.3, dot(d, rimDir));
  c += (u_sky + 0.15) * rim * (1.0 - 0.6 * rough) * 0.5;
  return c;
}

struct Surface { vec3 albedo; float rough; float metal; };

Surface material(float id, vec3 lp, float seed) {
  int i = int(id + 0.5);
  vec4 a = u_matA[i];
  vec4 b = u_matB[i];
  Surface s = Surface(a.rgb, a.a, b.x);
  int tex = int(b.y + 0.5);
  float k = b.w;
  vec3 q = lp * b.z;

  if (tex == 1) {
    // Marble: soft clouding plus sharp, turbulent veins.
    float n = kiln_snoise(q * 0.55) * 0.6 + kiln_snoise(q * 1.7) * 0.3 + kiln_snoise(q * 4.1) * 0.1;
    float vein = pow(1.0 - abs(sin((q.x + q.y * 0.45) * 1.4 + n * 5.0)), 22.0);
    float lum = dot(s.albedo, vec3(0.2126, 0.7152, 0.0722));
    vec3 veinColor = lum > 0.2 ? s.albedo * 0.35 : s.albedo * 3.0 + 0.04;
    s.albedo = mix(s.albedo * (1.0 + n * 0.12 * k), veinColor, vein * 0.8 * k);
    s.rough = mix(s.rough, s.rough * 1.4, vein * k);
  } else if (tex == 2) {
    // Brushed: fine directional streaks in colour and roughness.
    float n = kiln_snoise(vec3(q.x * 0.35, q.y * 70.0, seed * 13.0)) * 0.7 + kiln_snoise(vec3(q.x * 2.0, q.y * 220.0, 3.0)) * 0.3;
    s.albedo *= 1.0 + n * 0.07 * k;
    s.rough = clamp(s.rough + n * 0.08 * k, 0.04, 1.0);
  } else if (tex == 3) {
    // Glazed ceramic: pooled glaze and tiny iron specks.
    float glaze = kiln_snoise(q * 0.9) * 0.6 + kiln_snoise(q * 3.0) * 0.4;
    float speck = step(0.992, kiln_hash12(floor(q.xy * 70.0) + seed * 101.0));
    s.albedo *= (1.0 + glaze * 0.09 * k) * (1.0 - speck * 0.55 * k);
    s.rough = clamp(s.rough + glaze * 0.05 * k, 0.04, 1.0);
  }
  // Every tile slightly different, like real stone or glaze batches.
  s.albedo *= 1.0 + (seed - 0.5) * 0.1;
  return s;
}

void main() {
  vec3 N = normalize(v_normal);
  vec3 V = u_ortho > 0.5 ? -u_viewDir : normalize(u_eye - v_world);
  float id = v_part < 0.5 ? v_mats.x : v_part < 1.5 ? v_mats.y : v_part < 2.5 ? u_edgeMat : u_groundMat;
  Surface s = material(id, v_local, v_seed);

  vec3 L = u_lightDir;
  vec3 H = normalize(L + V);
  float ndl = max(dot(N, L), 0.0);
  float ndv = max(dot(N, V), 1e-4);
  float ndh = max(dot(N, H), 0.0);
  float vdh = max(dot(V, H), 0.0);

  // Cook-Torrance: GGX distribution, Smith-Schlick geometry, Schlick Fresnel.
  float a = max(s.rough * s.rough, 0.002);
  float a2 = a * a;
  float dd = ndh * ndh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float kg = (s.rough + 1.0) * (s.rough + 1.0) / 8.0;
  float G = (ndl / (ndl * (1.0 - kg) + kg)) * (ndv / (ndv * (1.0 - kg) + kg));
  vec3 F0 = mix(vec3(0.04), s.albedo, s.metal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - vdh, 5.0);
  vec3 spec = D * G * F / max(4.0 * ndl * ndv, 1e-4);
  vec3 kd = (1.0 - F) * (1.0 - s.metal);

  float sh = ndl > 0.0 ? shadow(v_world, N, ndl) : 0.0;
  float ao = topOcclusion(v_world);

  vec3 direct = (kd * s.albedo / PI + spec) * u_lightColor * ndl * sh;
  vec3 Fr = F0 + (max(vec3(1.0 - s.rough), F0) - F0) * pow(1.0 - ndv, 5.0);
  vec3 ambient = kd * s.albedo * environment(N, 1.0) * ao
               + Fr * environment(reflect(-V, N), s.rough) * mix(ao, 1.0, 0.4);
  vec3 col = direct + ambient;

  if (v_glow > 0.0) {
    // Bevels light up fully; faces get a rim that brightens at grazing angles.
    float rim = v_part > 1.5 ? 1.0 : 0.18 + 0.6 * pow(1.0 - ndv, 2.0);
    col += u_glowColor * v_glow * rim;
  }

  float dist = length(v_world.xy - u_target.xy);
  col = mix(col, u_horizon, 1.0 - exp(-u_fog * dist * dist));
  o_color = vec4(col, 1.0);
}
`;

// Adds one sub-sample into the accumulation buffer (additive blending).
export const ACCUM_FS =
  HEADER +
  /* glsl */ `
uniform sampler2D u_src;
uniform float u_weight;
out vec4 o_color;
void main() {
  o_color = texelFetch(u_src, ivec2(gl_FragCoord.xy), 0) * u_weight;
}
`;

// Exposure, vignette, filmic tone map, sRGB, grain + dither.
export const POST_FS =
  HEADER +
  GLSL_HELPERS +
  /* glsl */ `
uniform sampler2D u_accum;
uniform float u_bloom;
uniform float u_levels;
uniform vec2 u_resolution;
uniform vec2 u_offset;
uniform float u_exposure;
uniform float u_vignette;
uniform float u_grain;
uniform float u_frame;
out vec4 o_color;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 c = texelFetch(u_accum, ivec2(px), 0).rgb;
  if (u_bloom > 0.0) {
    // Soft-thresholded glow from progressively blurrier mip levels.
    vec2 uv = px / vec2(textureSize(u_accum, 0));
    vec3 b = vec3(0.0);
    float wsum = 0.0;
    for (int l = 1; l <= 7; l++) {
      float lod = float(l);
      if (lod > u_levels) break;
      vec2 o = exp2(lod) / vec2(textureSize(u_accum, 0));
      vec3 s = (textureLod(u_accum, uv + vec2(o.x, o.y) * 0.5, lod).rgb + textureLod(u_accum, uv - vec2(o.x, o.y) * 0.5, lod).rgb
              + textureLod(u_accum, uv + vec2(o.x, -o.y) * 0.5, lod).rgb + textureLod(u_accum, uv - vec2(o.x, -o.y) * 0.5, lod).rgb) * 0.25;
      float w = 1.0 / lod;
      b += max(s - 0.8, 0.0) * w;
      wsum += w;
    }
    c += b / max(wsum, 1e-4) * u_bloom * 2.0;
  }
  c *= u_exposure;
  vec2 q = (px + u_offset) / u_resolution - 0.5;
  q.x *= u_resolution.x / u_resolution.y;
  c *= 1.0 - u_vignette * dot(q, q);
  c = kiln_srgb(aces(c));
  c += (kiln_hash12(px + u_offset + fract(u_frame * 0.6180339) * 997.0) - 0.5) * (u_grain + 1.0 / 255.0);
  o_color = vec4(c, 1.0);
}
`;
