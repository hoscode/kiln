// Extrude a convex outline into a slab with chamfered edges. Flat normals per
// face keep bevel highlights crisp. Vertex layout: position(3) normal(3) part(1)
// where part 0 = top face, 1 = bottom face, 2 = bevels/sides, 3 = ground.
import type { Vec2 } from '../../engine2d';

export const PART = { top: 0, bottom: 1, edge: 2, ground: 3 } as const;
export const FLOATS_PER_VERTEX = 7;

type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function ccw(poly: Vec2[]): Vec2[] {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [a, b] = [poly[i], poly[(i + 1) % poly.length]];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area >= 0 ? poly : [...poly].reverse();
}

/** Offset a convex CCW polygon inward by d (mitred corners). */
function inset(poly: Vec2[], d: number): Vec2[] {
  const n = poly.length;
  const inward = (a: Vec2, b: Vec2): Vec2 => {
    const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey);
    return [-ey / l, ex / l];
  };
  return poly.map((p, i) => {
    const n1 = inward(poly[(i - 1 + n) % n], p);
    const n2 = inward(p, poly[(i + 1) % n]);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
  });
}

export function slabMesh(outline: Vec2[], thickness: number, bevel: number): Float32Array {
  const P = ccw(outline);
  const n = P.length;
  const h = thickness / 2;
  const b = Math.max(0, Math.min(bevel, h * 0.95));
  const Q = b > 0 ? inset(P, b) : P;
  const out: number[] = [];

  const tri = (a: V3, c: V3, d: V3, part: number, outward: V3) => {
    let nrm = normalize(cross(sub(c, a), sub(d, a)));
    if (dot(nrm, outward) < 0) nrm = [-nrm[0], -nrm[1], -nrm[2]];
    for (const v of [a, c, d]) out.push(v[0], v[1], v[2], nrm[0], nrm[1], nrm[2], part);
  };
  const quad = (a: V3, c: V3, d: V3, e: V3, part: number, outward: V3) => {
    tri(a, c, d, part, outward);
    tri(a, d, e, part, outward);
  };
  const at = (p: Vec2, z: number): V3 => [p[0], p[1], z];

  for (let i = 1; i < n - 1; i++) tri(at(Q[0], h), at(Q[i], h), at(Q[i + 1], h), PART.top, [0, 0, 1]);
  for (let i = 1; i < n - 1; i++) tri(at(Q[0], -h), at(Q[i + 1], -h), at(Q[i], -h), PART.bottom, [0, 0, -1]);

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = P[j][0] - P[i][0], ey = P[j][1] - P[i][1], l = Math.hypot(ex, ey);
    const o: V3 = [ey / l, -ex / l, 0]; // outward edge normal
    if (b > 0) {
      quad(at(P[i], h - b), at(P[j], h - b), at(Q[j], h), at(Q[i], h), PART.edge, [o[0], o[1], 1]);
      quad(at(P[i], -h + b), at(P[j], -h + b), at(Q[j], -h), at(Q[i], -h), PART.edge, [o[0], o[1], -1]);
    }
    quad(at(P[i], h - b), at(P[j], h - b), at(P[j], -h + b), at(P[i], -h + b), PART.edge, o);
  }
  return new Float32Array(out);
}

/** A large floor quad at height z. */
export function groundMesh(size: number, z: number): Float32Array {
  const s = size;
  const v = (x: number, y: number) => [x, y, z, 0, 0, 1, PART.ground];
  return new Float32Array([...v(-s, -s), ...v(s, -s), ...v(s, s), ...v(-s, -s), ...v(s, s), ...v(-s, s)]);
}
