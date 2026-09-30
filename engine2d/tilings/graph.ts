// Neighbourhood graphs for tilings: which tiles share an edge, and orders that
// walk from tile to neighbouring tile. Works for any edge-to-edge tiling.
import type { Vec2 } from '../geom';
import type { Rng } from '../prng';

/** Tiles sharing an edge are neighbours. Endpoints are matched to `precision`. */
export function adjacency(polys: readonly (readonly Vec2[])[], precision = 1e4): number[][] {
  const key = (p: Vec2) => `${Math.round(p[0] * precision)},${Math.round(p[1] * precision)}`;
  const byEdge = new Map<string, number>();
  const adj: number[][] = polys.map(() => []);
  polys.forEach((poly, i) => {
    for (let v = 0; v < poly.length; v++) {
      const a = key(poly[v]), b = key(poly[(v + 1) % poly.length]);
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      const other = byEdge.get(edge);
      if (other === undefined) byEdge.set(edge, i);
      else {
        adj[i].push(other);
        adj[other].push(i);
      }
    }
  });
  return adj;
}

export interface Walk {
  /** Visit rank per tile (−1 = never reached). */
  rank: Int32Array;
  /** The neighbour each tile was reached from (−1 for the start / unreached). */
  parent: Int32Array;
  /** Number of tiles reached. */
  count: number;
}

/** Breadth-first: rank = hop distance from `start` (rings spreading outward). */
export function bfs(adj: number[][], start: number, include: (i: number) => boolean = () => true): Walk {
  const rank = new Int32Array(adj.length).fill(-1);
  const parent = new Int32Array(adj.length).fill(-1);
  rank[start] = 0;
  const queue = [start];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of adj[i]) {
      if (rank[j] !== -1 || !include(j)) continue;
      rank[j] = rank[i] + 1;
      parent[j] = i;
      queue.push(j);
    }
  }
  return { rank, parent, count: queue.length };
}

export interface WalkOptions {
  include?: (i: number) => boolean;
  /** Tile centres; when given, walkers prefer to keep going straight. */
  centers?: readonly Vec2[];
  /** 0 = as straight as possible, higher = more meandering. */
  wander?: number;
}

/**
 * Several walkers grow paths at once, one tile per step each, always onto an
 * unvisited neighbour of their tip (backtracking along their own path when
 * stuck). rank = the step a tile was reached, so tiles along a path act one
 * after another. With one start this is a depth-first snake.
 */
export function walkers(adj: number[][], starts: number[], rng: Rng, o: WalkOptions = {}): Walk {
  const include = o.include ?? (() => true);
  const wander = o.wander ?? 0.6;
  const rank = new Int32Array(adj.length).fill(-1);
  const parent = new Int32Array(adj.length).fill(-1);
  let count = 0;
  const stacks: number[][] = [];
  for (const s of starts) {
    if (rank[s] !== -1) continue;
    rank[s] = 0;
    count++;
    stacks.push([s]);
  }

  const heading = (from: number, to: number): Vec2 => {
    const c = o.centers!;
    const dx = c[to][0] - c[from][0], dy = c[to][1] - c[from][1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };

  for (let step = 1; stacks.some((st) => st.length); step++) {
    for (const st of stacks) {
      while (st.length) {
        const tip = st[st.length - 1];
        const options = adj[tip].filter((j) => rank[j] === -1 && include(j));
        if (!options.length) {
          st.pop();
          continue;
        }
        let next = options[0];
        if (o.centers && st.length > 1) {
          const dir = heading(st[st.length - 2], tip);
          let best = -Infinity;
          for (const j of options) {
            const [hx, hy] = heading(tip, j);
            const score = hx * dir[0] + hy * dir[1] + rng() * wander * 2;
            if (score > best) [best, next] = [score, j];
          }
        } else next = rng.pick(options);
        rank[next] = step;
        parent[next] = tip;
        st.push(next);
        count++;
        break;
      }
    }
  }
  return { rank, parent, count };
}

/** `k` indices from `candidates`, spread apart (farthest-point sampling from `first`). */
export function spreadOut(points: readonly Vec2[], candidates: number[], first: number, k: number): number[] {
  const chosen = [first];
  const dist = new Map(candidates.map((i) => [i, Infinity]));
  while (chosen.length < Math.min(k, candidates.length)) {
    const last = points[chosen[chosen.length - 1]];
    let far = -1, farD = -1;
    for (const i of candidates) {
      const d = Math.min(dist.get(i)!, (points[i][0] - last[0]) ** 2 + (points[i][1] - last[1]) ** 2);
      dist.set(i, d);
      if (d > farD) [far, farD] = [i, d];
    }
    chosen.push(far);
  }
  return chosen;
}

/** Index of the point nearest (x, y). */
export function nearest(points: readonly Vec2[], x: number, y: number): number {
  let best = 0, bestD = Infinity;
  points.forEach(([px, py], i) => {
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}
