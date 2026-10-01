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
  /** When stuck, back up along the path and branch (true), or let the strand end (false). */
  backtrack?: boolean;
}

/**
 * Several walkers grow paths at once, one tile per step each, always onto an
 * unvisited neighbour of their tip. rank = the step a tile was reached, so
 * tiles along a path act one after another. With backtracking and one start
 * this is a depth-first snake that covers everything; without, each strand
 * simply ends when boxed in.
 */
export function walkers(adj: number[][], starts: number[], rng: Rng, o: WalkOptions = {}): Walk {
  const include = o.include ?? (() => true);
  const wander = o.wander ?? 0.6;
  const backtrack = o.backtrack ?? true;
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
          if (backtrack) st.pop();
          else st.length = 0;
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

export interface SpreadOptions {
  include?: (i: number) => boolean;
  /** How many tendrils grow at once. */
  tendrils?: number;
  /** Chance a tip splits in two (only while there is room for more tendrils). */
  branching?: number;
  /** Tendrils added per generation until there are `tendrils` (a linear ramp). */
  ramp?: number;
  /** Tile centres: when given, tips prefer to keep heading the same way. */
  centers?: readonly Vec2[];
}

/**
 * A chain reaction creeping along tendrils: each generation, every live tip
 * sets off one unlit neighbour (sometimes two, a branch), favouring open floor
 * so tendrils stay thin. Tips beyond `tendrils` go dormant; when tips get
 * boxed in, the newest lit tiles bordering open floor sprout new ones — so
 * it keeps a steady number of tendrils and covers every reachable tile.
 * rank = generation lit; parent = who set it off.
 */
export function spread(adj: number[][], starts: number[], rng: Rng, o: SpreadOptions = {}): Walk {
  const include = o.include ?? (() => true);
  const tendrils = Math.max(1, Math.round(o.tendrils ?? 8));
  const branching = o.branching ?? 0.3;
  const rank = new Int32Array(adj.length).fill(-1);
  const parent = new Int32Array(adj.length).fill(-1);
  const lit: number[] = [];
  let count = 0;

  const light = (j: number, from: number, gen: number) => {
    rank[j] = gen;
    parent[j] = from;
    lit.push(j);
    count++;
  };
  const open = (i: number) => adj[i].filter((j) => rank[j] === -1 && include(j));
  // Where a tip goes next: into open floor, and (with centres) straight on.
  const next = (i: number, options: number[]) => {
    const from = parent[i];
    const weights = options.map((j) => {
      let w = (1 + open(j).length) ** 2;
      if (o.centers && from >= 0) {
        const c = o.centers;
        const ax = c[i][0] - c[from][0], ay = c[i][1] - c[from][1];
        const bx = c[j][0] - c[i][0], by = c[j][1] - c[i][1];
        w *= Math.exp(1.5 * (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1));
      }
      return w;
    });
    let pick = rng() * weights.reduce((a, b) => a + b, 0);
    return options[weights.findIndex((w) => (pick -= w) <= 0)] ?? options[options.length - 1];
  };

  let tips: number[] = [];
  for (const s of starts) if (rank[s] === -1) (light(s, -1, 0), tips.push(s));
  // Tendrils come in at a steady `ramp` per generation, so the reaction
  // catches and spreads out instead of bursting from its seeds all at once.
  let target = tips.length;
  const ramp = Math.max(1, Math.round(o.ramp ?? 1));

  for (let gen = 1; ; gen++) {
    target = Math.min(tendrils, target + ramp);
    const born: number[] = [];
    const step = (i: number) => {
      const options = open(i).filter((j) => !born.includes(j));
      if (!options.length) return;
      const j = next(i, options);
      light(j, i, gen);
      born.push(j);
    };
    // Every tip moves on first; then some branch, while there's room under the cap.
    const order = rng.shuffle([...tips]);
    for (const i of order) step(i);
    for (const i of order) if (born.length < target && rng() < branching) step(i);
    // Keep a steady number of tendrils: surplus tips go dormant, and boxed-in
    // ones are replaced by sprouts from the newest lit tiles beside open floor.
    tips = rng.shuffle(born).slice(0, target);
    for (let k = lit.length - 1; k >= 0 && tips.length < target; k--) {
      const i = lit[k];
      if (rank[i] === gen || !open(i).length) continue;
      const j = next(i, open(i));
      light(j, i, gen);
      tips.push(j);
    }
    if (!tips.length) break;
  }
  return { rank, parent, count };
}

export interface GrowOptions {
  include?: (i: number) => boolean;
  /**
   * How strongly tiles with more grown neighbours are preferred: 0 = any
   * frontier tile (ragged, coral-like), 2–3 = solid blobs.
   */
  compactness?: number;
  /** Extra per-tile preference (> 0), e.g. from a noise field for lobes. */
  weight?: (i: number) => number;
}

/**
 * Organic area growth (Eden model): colonies start at `seeds`; each step one
 * tile on a colony's edge joins it. rank = the step it joined; parent = a
 * grown neighbour, so it can tip outward from the colony.
 */
export function grow(adj: number[][], seeds: number[], rng: Rng, o: GrowOptions = {}): Walk {
  const include = o.include ?? (() => true);
  const k = o.compactness ?? 2;
  const weight = o.weight ?? (() => 1);
  const rank = new Int32Array(adj.length).fill(-1);
  const parent = new Int32Array(adj.length).fill(-1);
  const touching = new Map<number, number>(); // frontier tile → grown neighbours
  let count = 0;

  const join = (i: number, step: number) => {
    rank[i] = step;
    count++;
    touching.delete(i);
    for (const j of adj[i]) {
      if (rank[j] !== -1 || !include(j)) continue;
      touching.set(j, (touching.get(j) ?? 0) + 1);
      if (parent[j] === -1) parent[j] = i;
    }
  };
  for (const s of seeds) if (rank[s] === -1) join(s, 0);

  for (let step = 1; touching.size; step++) {
    let total = 0;
    for (const [j, n] of touching) total += n ** k * weight(j);
    let pick = rng() * total;
    let chosen = -1;
    for (const [j, n] of touching) {
      chosen = j;
      if ((pick -= n ** k * weight(j)) <= 0) break;
    }
    join(chosen, step);
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
