// A geodesic sphere for tiling a globe: an icosahedron with each face split
// `f` times, normalised onto the unit sphere. Its vertices become the cells —
// hexagons everywhere except 12 pentagons at the icosahedron's corners
// (10f² + 2 cells in all), the same layout as a football or a Goldberg sphere.

export type Vec3 = [number, number, number];

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS: Vec3[] = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
];
const ICO_FACES: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const normalize = ([x, y, z]: Vec3): Vec3 => {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};

/** Cell centres on the unit sphere and each cell's neighbours (5 or 6). */
export function geodesic(f: number): { centers: Vec3[]; neighbors: number[][] } {
  const centers: Vec3[] = [];
  const index = new Map<string, number>();
  const neighbors: Set<number>[] = [];
  const vertex = (p: Vec3) => {
    const n = normalize(p);
    const key = n.map((c) => Math.round(c * 1e6)).join(',');
    let i = index.get(key);
    if (i === undefined) {
      i = centers.length;
      index.set(key, i);
      centers.push(n);
      neighbors.push(new Set());
    }
    return i;
  };
  const link = (a: number, b: number) => (neighbors[a].add(b), neighbors[b].add(a));

  for (const [ia, ib, ic] of ICO_FACES) {
    const [A, B, C] = [ICO_VERTS[ia], ICO_VERTS[ib], ICO_VERTS[ic]];
    // Points i·(B−A)/f + j·(C−A)/f on the face, i + j ≤ f.
    const at = (i: number, j: number) =>
      vertex([0, 1, 2].map((k) => A[k] + ((B[k] - A[k]) * i) / f + ((C[k] - A[k]) * j) / f) as Vec3);
    for (let i = 0; i <= f; i++)
      for (let j = 0; i + j <= f; j++) {
        const v = at(i, j);
        if (i + j < f) {
          link(v, at(i + 1, j));
          link(v, at(i, j + 1));
          link(at(i + 1, j), at(i, j + 1));
        }
      }
  }
  return { centers, neighbors: neighbors.map((s) => [...s]) };
}

/**
 * Express a world direction in a tile's own frame, the inverse of the
 * shader's `orient()` (which turns z up onto the tile's normal).
 */
export function toLocal(normal: Vec3, d: Vec3): Vec3 {
  const [nx, ny, nz] = normal;
  const s = Math.hypot(nx, ny);
  if (s < 1e-5) return nz > 0 ? d : [d[0], -d[1], -d[2]];
  const k: Vec3 = [-ny / s, nx / s, 0];
  const a = -Math.atan2(s, nz);
  const c = Math.cos(a), sn = Math.sin(a);
  const dot = k[0] * d[0] + k[1] * d[1] + k[2] * d[2];
  const cross: Vec3 = [k[1] * d[2] - k[2] * d[1], k[2] * d[0] - k[0] * d[2], k[0] * d[1] - k[1] * d[0]];
  return [0, 1, 2].map((i) => d[i] * c + cross[i] * sn + k[i] * dot * (1 - c)) as Vec3;
}
