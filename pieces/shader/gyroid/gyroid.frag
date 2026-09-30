// Raymarched gyroid carved from a sphere. Loops seamlessly: the gyroid slides
// exactly one period and the camera makes a whole number of orbits per loop.
// Uniforms u_<param> come from index.ts; helpers from enginegl/prelude.ts.

float gyroid(vec3 p) {
  p.z += iPhase * TAU / u_scale; // one period per loop
  vec3 q = p * u_scale;
  float g = abs(dot(sin(q), cos(q.yzx)) - u_bias) / u_scale - u_thickness;
  return g * 0.6; // not a true distance: step conservatively
}

float map(vec3 p) {
  return max(length(p) - 1.0, gyroid(p));
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0007;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

float calcAO(vec3 p, vec3 n) {
  float occ = 0.0, sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.01 + 0.06 * float(i);
    occ += (h - map(p + h * n)) * sca;
    sca *= 0.8;
  }
  return clamp(1.0 - 3.0 * occ, 0.0, 1.0);
}

float softShadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.02;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t);
    res = min(res, 8.0 * h / t);
    t += clamp(h, 0.01, 0.15);
    if (res < 0.002 || t > 2.5) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 paletteAt(float x) {
  int n = int(u_palette_n);
  float f = fract(x) * u_palette_n;
  int i = int(f);
  return mix(u_palette[i % n], u_palette[(i + 1) % n], smoothstep(0.0, 1.0, fract(f)));
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = (fragCoord - 0.5 * iResolution.xy) / iResolution.y;

  vec3 ro = vec3(0.0, 0.0, u_distance);
  ro.yz *= kiln_rot(-0.4);
  ro.xz *= kiln_rot(TAU * iPhase * u_orbits);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + u_focal * ww);

  vec3 bg = kiln_linear(u_palette_bg);
  vec3 col = bg * (1.0 - 0.45 * dot(uv, uv));

  // March only inside the bounding sphere.
  float b = dot(ro, rd);
  float h = b * b - dot(ro, ro) + 1.0;
  if (h > 0.0) {
    h = sqrt(h);
    float t = max(-b - h, 0.0);
    float tmax = -b + h;
    bool hit = false;
    for (int i = 0; i < 200; i++) {
      float d = map(ro + rd * t);
      if (d < 0.0004 * t) { hit = true; break; }
      t += d;
      if (t > tmax) break;
    }

    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = calcNormal(p);
      vec3 lig = normalize(vec3(0.7, 0.9, 0.5));
      float dif = clamp(dot(n, lig), 0.0, 1.0) * softShadow(p + n * 0.002, lig);
      float ao = calcAO(p, n);
      float amb = 0.5 + 0.5 * n.y;
      float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 4.0);
      float spe = pow(clamp(dot(n, normalize(lig - rd)), 0.0, 1.0), 48.0) * dif;

      // The sphere's skin and the inner channels take different palette positions.
      float skin = smoothstep(0.97, 1.0, length(p));
      vec3 base = kiln_linear(paletteAt(u_colorShift + length(p) * u_colorSpread + 0.5 * skin));
      vec3 lin = 1.4 * dif * vec3(1.0, 0.96, 0.9) + 0.35 * amb * ao + 0.5 * fre * ao;
      vec3 surf = 1.0 - exp(-(base * lin + 0.35 * spe) * u_exposure);
      col = mix(bg, surf, exp(-0.02 * t * t)); // faint depth haze
    }
  }

  col += (kiln_hash12(floor(fragCoord) + fract(u_frame * 0.1618) * 1000.0) - 0.5) * u_grain;
  fragColor = vec4(kiln_srgb(col), 1.0);
}
