// A flag waving in sunlight. The cloth is a height field over the plane of the
// flag, ray-marched, with self-shadowing toward the sun, light passing through
// the fabric when it's lit from behind, and a plain weave of threads that
// shows when you get close. Loops seamlessly: every wave makes a whole number
// of cycles per loop. The artwork comes from tex_flag (see flags.ts).

float gH;   // flag height, flag width = 1
float gS;   // horizontal shrink from the folds taking up cloth
float gK;   // wave number of the main wave
float gT;   // TAU * phase
bool gSmooth; // skip the small wrinkles (shadow rays)
const float WEAVE_THREADS = 32.0; // per tile of tex_weave (weave.ts)
const float WEAVE_SIZE = 512.0;   // its size in pixels
const float AMP = 0.085; // wave amplitude at the fly, in flag widths

// ---- Cloth shape --------------------------------------------------------

// Displacement out of the flag's plane at cloth coords uv (0..1, v up).
float clothZ(vec2 uv) {
  float u = uv.x, v = uv.y;
  float n = u_waves;
  float tilt = (v - 0.5) * u_tilt; // diagonal folds
  float a = sin(gK * u - n * gT + 2.0 * tilt);
  a += 0.45 * sin(1.83 * gK * u - 2.0 * n * gT + 3.1 * tilt + 0.8 * v + 1.3);
  a += 0.22 * u_ripple * sin(3.07 * gK * u - 3.0 * n * gT - 2.0 * tilt + 2.0 * v + 2.7);
  a += 0.2 * u_ripple * u * u * sin(5.3 * gK * u - 5.0 * n * gT + 4.0 * v + 0.4); // flutter at the fly
  float gust = 1.0 + 0.2 * sin(gT + 0.7);
  float across = 1.0 + 0.25 * sin(1.4 * PI * v + gT + 3.0 * u);
  float z = AMP * u_wind * pow(u, 0.75) * gust * across * a;
  // Set-in wrinkles, from folding and storage.
  if (!gSmooth) {
    float c = kiln_snoise(vec3(u * 4.0, v * 4.0 * gH, 3.1)) + 0.35 * kiln_snoise(vec3(u * 9.0, v * 9.0 * gH, 8.7));
    z += u_wrinkles * 0.0012 * c * smoothstep(0.0, 0.15, u);
  }
  return z;
}

// Vertical displacement: the fly end droops and sways.
float clothY(float u, float v) {
  float droop = -u_droop * gH * u * u * (0.75 + 0.25 * (1.0 - v));
  float sway = 0.012 * u_wind * u * sin(0.9 * gK * u - u_waves * gT + 0.9);
  return droop + sway;
}

// World xy (flag in z = 0 at rest, hoist at x = 0, centred on y = 0) → cloth uv.
vec2 toUV(vec2 xy) {
  float u = xy.x / gS;
  float v = xy.y / gH + 0.5;
  v = (xy.y - clothY(u, v)) / gH + 0.5;
  v = (xy.y - clothY(u, v)) / gH + 0.5;
  return vec2(u, v);
}

bool onCloth(vec2 uv) { return uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0; }

float heightAt(vec2 xy) { return clothZ(toUV(xy)); }

// ---- Pole ---------------------------------------------------------------

const float POLE_R = 0.016;
vec2 poleC() { return vec2(-POLE_R * 0.4, 0.0); } // xz centre; the sleeve wraps it
float poleTop() { return 0.5 * gH + 0.035; }
vec3 finialC() { return vec3(poleC().x, poleTop() + 0.022, 0.0); }

// Nearest hit with the pole (cylinder) or finial (sphere); returns t, id in y.
vec2 hitPole(vec3 ro, vec3 rd) {
  vec2 best = vec2(1e9, 0.0);
  vec2 oc = ro.xz - poleC();
  float a = dot(rd.xz, rd.xz);
  float b = dot(oc, rd.xz);
  float c = dot(oc, oc) - POLE_R * POLE_R;
  float h = b * b - a * c;
  if (h > 0.0) {
    float t = (-b - sqrt(h)) / a;
    if (t > 0.0 && ro.y + t * rd.y < poleTop()) best = vec2(t, 1.0);
  }
  vec3 os = ro - finialC();
  float r = 0.024;
  b = dot(os, rd);
  h = b * b - dot(os, os) + r * r;
  if (h > 0.0) {
    float t = -b - sqrt(h);
    if (t > 0.0 && t < best.x) best = vec2(t, 2.0);
  }
  return best;
}

// ---- Sky ----------------------------------------------------------------

vec3 sunDir() {
  float az = radians(u_sunAzimuth), el = radians(u_sunElevation);
  return normalize(vec3(sin(az) * cos(el), sin(el), cos(az) * cos(el)));
}

vec3 sunColor() {
  float el = clamp(u_sunElevation / 50.0, 0.0, 1.0);
  return u_sunIntensity * mix(vec3(1.0, 0.62, 0.36), vec3(1.0, 0.95, 0.88), sqrt(el));
}

vec3 skyZenith() { return mix(vec3(0.16, 0.24, 0.42), vec3(0.09, 0.27, 0.68), clamp(u_sunElevation / 40.0, 0.0, 1.0)); }
vec3 skyHorizon() { return mix(vec3(0.95, 0.62, 0.42), vec3(0.62, 0.75, 0.9), clamp(u_sunElevation / 30.0, 0.0, 1.0)); }

float clouds(vec3 rd) {
  if (rd.y < 0.02) return 0.0;
  vec2 p = rd.xz / (rd.y + 0.15) * 1.3;
  vec2 drift = 0.35 * vec2(cos(gT), sin(gT)); // circles back each loop
  float f = 0.0, amp = 0.55;
  for (int i = 0; i < 5; i++) {
    f += amp * kiln_snoise(vec3(p + drift, 0.3 * float(i)));
    p = p * 2.03 + 7.1;
    amp *= 0.5;
  }
  return smoothstep(0.55 - u_clouds, 1.1 - 0.6 * u_clouds, f + 0.35) * smoothstep(0.02, 0.2, rd.y);
}

vec3 sky(vec3 rd, bool withSun) {
  vec3 L = sunDir();
  float y = max(rd.y, 0.0);
  vec3 col = mix(skyHorizon(), skyZenith(), pow(y, 0.45));
  float mu = max(dot(rd, L), 0.0);
  col += sunColor() * (0.06 * pow(mu, 6.0) + 0.25 * pow(mu, 64.0)); // haze around the sun
  float c = clouds(rd);
  vec3 cloudCol = mix(skyHorizon() * 0.8, vec3(1.0), 0.6) * (0.55 + 0.35 * u_sunIntensity / 3.0) + sunColor() * 0.25 * pow(mu, 3.0);
  col = mix(col, cloudCol, c * 0.85);
  if (withSun) col += sunColor() * 40.0 * smoothstep(0.99996, 0.99999, mu) * (1.0 - c);
  if (rd.y < 0.0) col = mix(skyHorizon() * 0.9, vec3(0.16, 0.18, 0.14), smoothstep(0.0, 0.08, -rd.y));
  return col;
}

// Light arriving from the whole sky and ground, around normal n.
vec3 ambient(vec3 n) {
  return mix(vec3(0.16, 0.17, 0.14), mix(skyHorizon(), skyZenith(), 0.6), 0.5 + 0.5 * n.y);
}

// ---- Shadows ------------------------------------------------------------

// Soft shadow from the cloth folds along L, starting on the side `s` of the
// surface (s = +1 the camera side, -1 behind).
float gJitter; // per-pixel 0..1, breaks up stepping in the shadow rays

float clothShadow(vec3 p, vec3 L, float s) {
  gSmooth = true;
  // Start from the smooth surface, which is what the ray is tested against.
  p.z = clothZ(toUV(p.xy)) + s * 0.002;
  float res = 1.0;
  float t = 0.002 + 0.003 * gJitter;
  for (int i = 0; i < 96; i++) {
    vec3 q = p + L * t;
    vec2 uv = toUV(q.xy);
    if (onCloth(uv)) {
      float d = (q.z - clothZ(uv)) * s;
      if (d < 0.0) { res = 0.0; break; }
      res = min(res, 10.0 * d / t);
    }
    t += 0.0025 + t * 0.04;
    if (t > 2.0) break;
  }
  gSmooth = false;
  return smoothstep(0.0, 1.0, clamp(res, 0.0, 1.0));
}

float poleShadow(vec3 p, vec3 L) {
  vec2 oc = p.xz - poleC();
  float a = dot(L.xz, L.xz);
  if (a < 1e-5) return 1.0;
  float tc = -dot(oc, L.xz) / a; // closest approach to the pole's axis
  if (tc < 0.0 || p.y + tc * L.y > poleTop()) return 1.0;
  float miss = length(oc + tc * L.xz);
  float pen = 0.0047 * tc * sqrt(a) + 0.001; // the sun's disc blurs the edge
  return smoothstep(POLE_R - pen, POLE_R + pen, miss);
}

// ---- Fabric -------------------------------------------------------------

// Stitched hems: the fly end (four rows, a wide hem) and top and bottom.
// Returns hem amount (extra layers of cloth) and stitch relief.
vec2 hems(vec2 uv, float foot) {
  float fly = 1.0 - uv.x;
  float px = fly;            // in flag widths
  float py = min(uv.y, 1.0 - uv.y) * gH;
  float hem = max(step(px, 0.016), step(py, 0.008));
  float stitch = 0.0;
  // Stitches: short dashes along the hem, ~4 per cm on a 1.5 m flag.
  float dash = smoothstep(0.15, 0.3, fract(uv.y * gH * 270.0)) * smoothstep(0.85, 0.7, fract(uv.y * gH * 270.0));
  for (int i = 0; i < 4; i++) {
    float at = 0.0025 + 0.0038 * float(i);
    stitch = max(stitch, dash * smoothstep(0.0007, 0.0002, abs(px - at)));
  }
  float dashX = smoothstep(0.15, 0.3, fract(uv.x * 270.0)) * smoothstep(0.85, 0.7, fract(uv.x * 270.0));
  stitch = max(stitch, dashX * smoothstep(0.0007, 0.0002, abs(py - 0.006)) * step(0.016, px));
  return vec2(hem, stitch * (1.0 - smoothstep(0.0004, 0.0012, foot))); // too small to see → gone
}

// ---- Tone mapping -------------------------------------------------------

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// ---- Main ---------------------------------------------------------------

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  gSmooth = false;
  gJitter = kiln_hash12(fragCoord * 1.37 + fract(iTime * 7.13) * 91.0);
  vec2 tex = vec2(textureSize(tex_flag, 0));
  gH = tex.y / tex.x;
  gT = TAU * iPhase;
  gK = TAU / u_wavelength;
  float slope = AMP * u_wind * gK;
  gS = 1.0 / (1.0 + 0.18 * slope * slope);

  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  // Camera orbiting the middle of the flag.
  vec3 target = vec3(0.47 * gS, -0.03, 0.0);
  float yaw = radians(u_yaw), pitch = radians(u_pitch);
  vec3 ro = target + (2.4 / u_zoom) * vec3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch));
  vec3 ww = normalize(target - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + u_focal * ww);
  float pixAngle = 1.0 / (u_focal * iResolution.y);

  vec3 L = sunDir();
  vec3 sunCol = sunColor();
  vec3 col = sky(rd, true);
  float tHit = 1e9;

  // ---- March the cloth's bounding box.
  float zMax = 0.2 * u_wind + 0.02;
  vec3 bmin = vec3(-0.01, -0.5 * gH - u_droop * gH - 0.05, -zMax);
  vec3 bmax = vec3(gS + 0.01, 0.5 * gH + 0.05, zMax);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (bmin - ro) * inv, t1 = (bmax - ro) * inv;
  float tn = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  float tf = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  bool hit = false;
  float side = 1.0;
  if (tf > max(tn, 0.0)) {
    tn = max(tn, 0.0);
    const int STEPS = 160;
    float dt = (tf - tn) / float(STEPS);
    float tPrev = tn, dPrev = 0.0;
    bool prevOn = false;
    for (int i = 0; i <= STEPS; i++) {
      float t = tn + float(i) * dt;
      vec3 p = ro + rd * t;
      vec2 cuv = toUV(p.xy);
      bool on = onCloth(cuv);
      float d = on ? p.z - clothZ(cuv) : 0.0;
      if (on && prevOn && sign(d) != sign(dPrev)) {
        // Refine between the two samples.
        float a = tPrev, b = t, da = dPrev;
        for (int j = 0; j < 10; j++) {
          float m = 0.5 * (a + b);
          vec3 q = ro + rd * m;
          float dm = q.z - heightAt(q.xy);
          if (sign(dm) == sign(da)) { a = m; da = dm; } else b = m;
        }
        tHit = 0.5 * (a + b);
        side = sign(dPrev);
        hit = true;
        break;
      }
      tPrev = t; dPrev = d; prevOn = on;
    }
  }

  vec2 pole = hitPole(ro, rd);
  if (u_pole > 0.5 && pole.x < tHit) {
    // ---- Pole: white painted metal, gold finial.
    vec3 p = ro + rd * pole.x;
    vec3 n = pole.y < 1.5 ? normalize(vec3(p.x - poleC().x, 0.0, p.z)) : normalize(p - finialC());
    vec3 H = normalize(L - rd);
    float sh = 1.0;
    if (pole.y < 1.5) sh = clothShadow(p + n * 0.002, L, sign(L.z + 1e-4)); // the flag shades the pole
    float dif = max(dot(n, L), 0.0) * sh;
    vec3 refl = sky(reflect(rd, n), false);
    float fre = pow(1.0 - max(dot(n, -rd), 0.0), 5.0);
    if (pole.y < 1.5) {
      vec3 base = vec3(0.78);
      col = base * (dif * sunCol + ambient(n)) + (0.04 + 0.5 * fre) * refl + sunCol * 0.6 * pow(max(dot(n, H), 0.0), 80.0) * sh;
    } else {
      vec3 gold = vec3(1.0, 0.71, 0.29);
      col = gold * (refl * 0.9 + dif * sunCol * 0.3) + gold * sunCol * 2.0 * pow(max(dot(n, H), 0.0), 120.0);
    }
  } else if (hit) {
    // ---- Cloth.
    vec3 p = ro + rd * tHit;
    vec2 cuv = clamp(toUV(p.xy), 0.0, 1.0);

    // Macro normal from the height field (world xy).
    float e = 0.0015;
    float hc = heightAt(p.xy);
    float hx1 = heightAt(p.xy + vec2(e, 0.0)), hx0 = heightAt(p.xy - vec2(e, 0.0));
    float hy1 = heightAt(p.xy + vec2(0.0, e)), hy0 = heightAt(p.xy - vec2(0.0, e));
    vec2 grad = vec2(hx1 - hx0, hy1 - hy0) / (2.0 * e);
    vec3 n = normalize(vec3(-grad, 1.0));
    float curv = (hx1 + hx0 + hy1 + hy0 - 4.0 * hc) / (e * e); // >0 in valleys seen from the front
    vec3 Tu = normalize(vec3(1.0, 0.0, grad.x));
    vec3 Tv = normalize(vec3(0.0, 1.0, grad.y));

    // Facing side: flip everything if we see the back of the cloth.
    n *= side;
    // Which side the sun is on comes from the smooth surface, so small
    // creases can shade but not flip it.
    gSmooth = true;
    vec2 sgrad = vec2(heightAt(p.xy + vec2(e, 0.0)) - heightAt(p.xy - vec2(e, 0.0)),
                      heightAt(p.xy + vec2(0.0, e)) - heightAt(p.xy - vec2(0.0, e))) / (2.0 * e);
    gSmooth = false;
    vec3 ns = normalize(vec3(-sgrad, 1.0)) * side;
    vec3 V = -rd;

    // Pixel footprint on the cloth, in flag widths.
    float foot = tHit * pixAngle / max(abs(dot(n, V)), 0.2);

    // Weave, from a mipmapped tile: R, G normal tilt, B height, A thread tone.
    // Mip levels average it out at a distance, so it never aliases.
    vec2 wuv = vec2(cuv.x, cuv.y * gH) * u_threads / WEAVE_THREADS;
    float wlod = log2(max(foot * u_threads / WEAVE_THREADS * WEAVE_SIZE, 1.0));
    vec4 wt = textureLod(tex_weave, wuv, wlod);
    vec2 wn = (wt.rg * 2.0 - 1.0) * u_weave;
    vec2 hm = hems(cuv, foot);
    wn += hm.y * vec2(0.25, 0.35); // stitch relief
    vec3 nf = normalize(n + side * (wn.x * Tu + wn.y * Tv));

    // Flag colour: printed polyester reads a touch deeper than the artwork.
    float lod = log2(max(foot * tex.x, 1.0)) + 0.6; // + a little dye bleed
    vec3 albedo = textureLod(tex_flag, cuv, lod).rgb * 0.82;
    albedo *= 1.0 + (wt.a - 0.5) * 0.6 * u_weave;               // uneven yarns
    albedo *= 1.0 - 0.12 * min(u_weave, 1.0) * (0.6 - wt.b);    // shade between threads
    albedo = mix(albedo, albedo * 0.8, hm.y * 0.6);             // thread sinks into the hem

    // Folds: valleys get less sky.
    float ao = clamp(1.0 - 0.04 * max(curv * side, 0.0), 0.5, 1.0);

    // Sun. Reflected on our side, transmitted through from the far side.
    float NL = dot(nf, L);
    float NLmacro = dot(ns, L);
    float lit = sign(NLmacro + 1e-4); // +1: the sun is on our side of the cloth
    float sh = clothShadow(p, L, side * lit);
    sh *= smoothstep(-0.1, 0.25, dot(n, L) * lit); // wrinkles turned from the sun
    if (u_pole > 0.5) sh *= poleShadow(p, L);
    vec3 Hh = normalize(L + V);
    vec3 direct = vec3(0.0);
    if (NLmacro > 0.0) {
      float wrap = clamp((NL + 0.15) / 1.15, 0.0, 1.0);
      direct += albedo * wrap * sunCol;
      // Polyester is rough: a broad, faint highlight and a soft rim of sheen.
      float spec = 0.05 * u_sheen * pow(max(dot(nf, Hh), 0.0), 14.0);
      float rim = 0.2 * u_sheen * pow(1.0 - max(dot(nf, V), 0.0), 4.0);
      direct += (spec + rim) * sunCol * max(NL, 0.0) * mix(vec3(1.0), albedo * 2.0, 0.4);
      direct *= sh;
    } else {
      // Sunlight through the cloth, coloured by the dye, brighter through the
      // gaps between threads, dimmer through the doubled hem.
      vec3 through = albedo * albedo * 2.0 * mix(1.15, 0.9, wt.b) + 0.02;
      through *= mix(1.0, 0.35, hm.x);
      direct += u_translucency * through * pow(-NLmacro, 1.5) * sunCol * sh;
      // The sunlit side still glows a little where it faces us.
      direct += u_sheen * 0.05 * sunCol * pow(1.0 - max(dot(nf, V), 0.0), 3.0) * sh;
    }

    vec3 amb = albedo * ambient(nf) * ao * 0.7;
    // Sunlight bounced between neighbouring folds, tinted by the cloth.
    amb += albedo * albedo * sunCol * 0.12 * ao * (1.0 - 0.5 * sh);
    // A little sky light reaches through as well.
    amb += u_translucency * 0.15 * albedo * albedo * ambient(-nf);
    col = direct + amb;
  }

  // ---- Lens: exposure, filmic curve, grain.
  col *= u_exposure;
  col = aces(col);
  col = kiln_srgb(col);
  col += (kiln_hash12(floor(fragCoord) + fract(u_frame * 0.1618) * 1000.0) - 0.5) * u_grain;
  fragColor = vec4(col, 1.0);
}
