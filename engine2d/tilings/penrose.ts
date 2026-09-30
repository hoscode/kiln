// Penrose P3 tiling (thick + thin rhombi) by Robinson-triangle subdivision.
// Coordinates are scaled so every tile edge has length 1.
import type { Vec2 } from '../geom';

const PHI = (1 + Math.sqrt(5)) / 2;

interface Tri {
  /** 0: 36° apex (half a thin rhombus), 1: 108° apex (half a thick rhombus). */
  kind: 0 | 1;
  a: Vec2;
  b: Vec2;
  c: Vec2;
}

export interface Rhombus {
  kind: 'thick' | 'thin';
  center: Vec2;
  /** Rotation of this tile relative to its kind's prototype. */
  angle: number;
  verts: Vec2[];
}

export interface PenroseTiling {
  rhombi: Rhombus[];
  /** Each kind's outline centred at the origin, unrotated. */
  prototypes: Record<Rhombus['kind'], Vec2[]>;
  /** Radius of the decagonal patch, in edge lengths. */
  radius: number;
}

const lerp = (p: Vec2, q: Vec2, t: number): Vec2 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * `generations` subdivisions of a 10-triangle "sun"; each generation
 * multiplies the tile count by ~2.6 (7 → ~4k tiles, 8 → ~11k).
 */
export function penroseP3(generations: number, rotation = 0): PenroseTiling {
  let tris: Tri[] = [];
  for (let i = 0; i < 10; i++) {
    let b: Vec2 = [Math.cos(((2 * i - 1) * Math.PI) / 10 + rotation), Math.sin(((2 * i - 1) * Math.PI) / 10 + rotation)];
    let c: Vec2 = [Math.cos(((2 * i + 1) * Math.PI) / 10 + rotation), Math.sin(((2 * i + 1) * Math.PI) / 10 + rotation)];
    if (i % 2 === 0) [b, c] = [c, b];
    tris.push({ kind: 0, a: [0, 0], b, c });
  }

  for (let g = 0; g < generations; g++) {
    const next: Tri[] = [];
    for (const { kind, a, b, c } of tris) {
      if (kind === 0) {
        const p = lerp(a, b, 1 / PHI);
        next.push({ kind: 0, a: c, b: p, c: b }, { kind: 1, a: p, b: c, c: a });
      } else {
        const q = lerp(b, a, 1 / PHI);
        const r = lerp(b, c, 1 / PHI);
        next.push({ kind: 1, a: r, b: c, c: a }, { kind: 1, a: q, b: r, c: b }, { kind: 0, a: r, b: q, c: a });
      }
    }
    tris = next;
  }

  // Two mirror-image triangles sharing a base (b–c) make one rhombus.
  const scale = 1 / Math.hypot(tris[0].b[0] - tris[0].a[0], tris[0].b[1] - tris[0].a[1]);
  const key = (t: Tri) => `${t.kind}:${Math.round((t.b[0] + t.c[0]) * 5e5)}:${Math.round((t.b[1] + t.c[1]) * 5e5)}`;
  const open = new Map<string, Tri>();
  const rhombi: Rhombus[] = [];
  for (const t of tris) {
    const k = key(t);
    const mate = open.get(k);
    if (!mate) {
      open.set(k, t);
      continue;
    }
    open.delete(k);
    const verts = [t.a, t.b, mate.a, t.c].map(([x, y]): Vec2 => [x * scale, y * scale]);
    const center = lerp(verts[0], verts[2], 0.5);
    const angle = Math.atan2(verts[2][1] - verts[0][1], verts[2][0] - verts[0][0]);
    rhombi.push({ kind: t.kind === 1 ? 'thick' : 'thin', center, angle, verts });
  }
  // Unpaired triangles lie on the patch boundary and are dropped.

  const prototype = (kind: Rhombus['kind']): Vec2[] => {
    const r = rhombi.find((x) => x.kind === kind)!;
    const c = Math.cos(-r.angle), s = Math.sin(-r.angle);
    return r.verts.map(([x, y]): Vec2 => {
      const dx = x - r.center[0], dy = y - r.center[1];
      return [dx * c - dy * s, dx * s + dy * c];
    });
  };

  return { rhombi, prototypes: { thick: prototype('thick'), thin: prototype('thin') }, radius: scale };
}
