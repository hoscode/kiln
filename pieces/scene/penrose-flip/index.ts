import {
  act,
  adjacency,
  adjust,
  bfs,
  bool,
  choice,
  color,
  getPalette,
  group,
  grow,
  int,
  mix,
  nearest,
  num,
  palette,
  penroseP3,
  spread,
  spreadOut,
  WAVE_PATTERNS,
  waveDirection,
  waveField,
  walkers,
  type Vec2,
} from '../../../engine2d';
import { defineScene, type Material, type SurfaceTexture } from '../../../enginegl';

// A Penrose P3 floor where tiles hop, turn over to reveal their other face,
// and settle. Every tile that moves turns twice per loop (over, then back),
// so the loop is seamless.
//
// Orders:
//  - grow: colonies start at random tiles and spread area-wise like an
//    organism, one edge tile joining at a time, with lobed, organic outlines.
//  - reaction: a flipping tile sets off its neighbours (each with some chance,
//    after a slightly random hand-off), branching outward like a real chain
//    reaction. Runs at its natural pace; tiles it never reaches stay still.
//  - chain: single-file strands, each tile setting off the next.
//  - cascade: perfect domino rings, stretched to fill the loop.
//  - radial / sweep / …: position-based waves.
// In the neighbour orders each tile tips away from the one that set it off.

const EDGES: Record<string, Omit<Material, 'color'> & { color?: string }> = {
  brass: { color: '#c9a15a', roughness: 0.28, metal: 1, texture: 'brushed', textureStrength: 0.7 },
  steel: { color: '#c3c8cf', roughness: 0.22, metal: 1, texture: 'brushed', textureStrength: 0.7 },
  matte: { roughness: 0.65, metal: 0 },
};

const FACE_ROUGHNESS: Record<SurfaceTexture, number> = { marble: 0.2, ceramic: 0.14, brushed: 0.36, plain: 0.45, matte: 0.85 };

interface Tile {
  /** When each of the tile's two turns starts, in loop units; empty = never moves. */
  starts: number[];
  axis: number;
  /** Half-width across the flip axis: how high the tile must rise to clear the floor. */
  reach: number;
}

export default defineScene({
  id: 'penrose-flip',
  title: 'Penrose Flip',
  tags: ['3d', 'tiling', 'loop', 'broadcast'],
  aspect: 16 / 9,
  animation: { duration: 60, fps: 30, loop: true, durationParam: 'duration' },
  params: {
    ...group('Camera', {
      drift: bool(true, 'Drift'),
      sway: num(0.12, 0, 0.6, 0.01, 'Drift amount'),
      tilt: num(35, 0, 80, 1, 'Tilt'),
      turn: num(-62, -180, 180, 1, 'Turn'),
      projection: choice(['perspective', 'orthographic'], 'perspective'),
      fov: num(30, 10, 70, 1, 'Lens (fov)'),
      zoom: num(6, 2, 20, 0.1),
      dof: num(0.35, 0, 1, 0.01, 'Depth of field'),
    }),
    ...group('Motion', {
      duration: num(60, 8, 180, 1, 'Loop length (s)'),
      motion: choice(['ripple', 'assemble'], 'ripple'),
      pattern: choice(['grow', 'reaction', 'chain', 'cascade', ...WAVE_PATTERNS], 'grow', 'Order'),
      origin: choice(['random', 'center', 'edge'], 'random', 'Starts at'),
      axis: choice(['travel', 'diagonal'], 'travel', 'Flip axis'),
      sources: int(2, 1, 24),
      compactness: num(2.5, 0, 5, 0.1),
      lobes: num(1, 0, 3, 0.05),
      handoff: num(0.55, 0.15, 1.5, 0.01, 'Hand-off'),
      chance: num(0.75, 0.3, 1, 0.01, 'Spread chance'),
      flipTime: num(3, 0.2, 8, 0.1, 'Flip time (s)'),
      hold: num(4, 0, 30, 0.5, 'Hold (s)'),
      sharpness: num(2, 1, 8, 0.1),
      jitter: num(0.3, 0, 1, 0.01),
      lift: num(0.2, 0, 2, 0.05),
    }),
    ...group('Signal', {
      glow: bool(false, 'Glow'),
      signal: num(1, 0, 4, 0.05, 'Strength'),
      trail: num(2, 0.1, 10, 0.1, 'Trail (s)'),
      signalColor: color('#ffc46b', 'Color'),
      bloom: num(0.4, 0, 2, 0.05),
    }),
    ...group('Look', {
      palette: palette('midnight'),
      texture: choice(['marble', 'matte', 'ceramic', 'brushed', 'plain'], 'marble'),
      edge: choice(['brass', 'steel', 'matte'], 'brass'),
      thickness: num(0.12, 0.03, 0.4, 0.005),
      bevel: num(0.45, 0, 1, 0.01),
      grout: num(0.035, 0, 0.2, 0.005),
      generations: int(7, 5, 9, 'Detail'),
    }),
    ...group('Light & finish', {
      sunHeight: num(38, 8, 85, 1, 'Sun height'),
      sunAngle: num(215, 0, 360, 1, 'Sun angle'),
      softness: num(0.45, 0, 1, 0.01, 'Shadow softness'),
      fog: num(0.35, 0, 1, 0.01),
      exposure: num(1, 0.3, 3, 0.05),
      grain: num(0.02, 0, 0.1, 0.005),
    }),
  },

  build({ p, noise, rng }) {
    const pal = getPalette(p.palette);
    const { rhombi, prototypes } = penroseP3(p.generations);
    const centers = rhombi.map((r) => r.center);

    // Choreograph the tiles around the visible area; tiles beyond it stay put.
    const radius = p.zoom * 2.4;
    const inView = (i: number) => Math.hypot(centers[i][0], centers[i][1]) < radius;
    const startAt: Vec2 =
      p.origin === 'edge'
        ? [-radius * 0.9, 0]
        : p.origin === 'random'
          ? [rng.range(-1, 1) * radius * 0.6, rng.range(-1, 1) * radius * 0.4]
          : [0, 0];

    // Timing per tile, in loop units (settings are in seconds). Each pass moves,
    // then holds still for `hold` before the next; it must fit its half-loop.
    const len = Math.min(p.flipTime / p.duration, p.motion === 'ripple' ? 0.3 : 0.2);
    const hold = Math.min(p.hold / p.duration, (p.motion === 'ripple' ? 0.45 : 0.4) - len);
    const window = (p.motion === 'ripple' ? 0.5 : 0.45) - hold - len;
    const firstStart = new Float32Array(rhombi.length).fill(-1); // −1: never moves
    const parents = new Int32Array(rhombi.length).fill(-1);
    const directions: Vec2[] = rhombi.map(() => [1, 0]);
    let replay = false; // graph orders replay the same order; waves come back like a tide

    if (p.pattern === 'grow') {
      // Area growth: tiles join colonies one at a time, spread evenly over the pass.
      const adj = adjacency(rhombi.map((r) => r.verts));
      const inside = [...centers.keys()].filter(inView);
      const first = p.origin === 'random' ? inside[rng.int(0, inside.length)] : nearest(centers, startAt[0], startAt[1]);
      const seeds = p.origin === 'random' ? [first, ...rng.shuffle(inside.filter((i) => i !== first)).slice(0, p.sources - 1)] : spreadOut(centers, inside, first, p.sources);
      const lobe = (i: number) => Math.exp(p.lobes * 2 * noise.fbm2(centers[i][0] * 0.12, centers[i][1] * 0.12, 2));
      const walk = grow(adj, seeds, rng.fork('grow'), { include: inView, compactness: p.compactness, weight: lobe });
      const last = Math.max(1, walk.count - 1);
      walk.rank.forEach((r, i) => r >= 0 && (firstStart[i] = (r / last) * window));
      parents.set(walk.parent);
      replay = true;
    } else if (p.pattern === 'reaction' || p.pattern === 'chain') {
      const adj = adjacency(rhombi.map((r) => r.verts));
      const inside = [...centers.keys()].filter(inView);
      const seeds = spreadOut(centers, inside, nearest(centers, startAt[0], startAt[1]), p.sources);
      const walkRng = rng.fork('walk');
      // hops[i]: how many hand-offs it takes the signal to reach tile i (−1 = never).
      let hops: ArrayLike<number>;
      if (p.pattern === 'reaction') {
        const r = spread(adj, seeds, walkRng, { include: inView, chance: p.chance, jitter: p.jitter });
        hops = r.time;
        parents.set(r.parent);
      } else {
        const walk = walkers(adj, seeds, walkRng, { include: inView, centers, backtrack: false });
        hops = walk.rank;
        parents.set(walk.parent);
      }
      // The next tile starts when the previous is `handoff` of the way through its
      // flip — unless that is too slow to reach every tile within the half-loop,
      // in which case hand-offs tighten so the reaction still covers the floor.
      let last = 1;
      for (let i = 0; i < hops.length; i++) last = Math.max(last, hops[i]);
      const hop = Math.min(p.handoff * len, window / last);
      for (let i = 0; i < hops.length; i++) if (hops[i] >= 0) firstStart[i] = hops[i] * hop;
      replay = true;
    } else if (p.pattern === 'cascade') {
      const adj = adjacency(rhombi.map((r) => r.verts));
      const walk = bfs(adj, nearest(centers, startAt[0], startAt[1]), inView);
      const last = Math.max(1, ...walk.rank);
      walk.rank.forEach((r, i) => r >= 0 && (firstStart[i] = mixJitter(r / last, p.jitter * 0.3, rng) * window));
      parents.set(walk.parent);
    } else {
      const field = waveField(p.pattern, { radius, angle: 0.5, noise });
      rhombi.forEach(({ center: [x, y] }, i) => {
        if (!inView(i)) return;
        firstStart[i] = mixJitter(field(x - startAt[0], y - startAt[1]), p.jitter * 0.3, rng) * window;
        directions[i] = waveDirection(field, x - startAt[0], y - startAt[1]);
      });
    }
    parents.forEach((from, i) => {
      if (from >= 0) directions[i] = [centers[i][0] - centers[from][0], centers[i][1] - centers[from][1]];
    });

    const second = p.motion === 'ripple' ? 0.5 : 0.72;
    const tiles = rhombi.map((r, i): Tile => {
      const [x, y] = r.center;
      const [dx, dy] = directions[i];
      // Tip forward across the direction of travel, or along the tile's own diagonal.
      const axis = p.axis === 'travel' ? Math.atan2(dy, dx) + Math.PI / 2 : r.angle;
      const perp: Vec2 = [-Math.sin(axis), Math.cos(axis)];
      const reach = Math.max(...r.verts.map(([vx, vy]) => Math.abs((vx - x) * perp[0] + (vy - y) * perp[1])));
      const s = firstStart[i];
      if (s < 0) return { starts: [], axis, reach };
      // Assemble compresses the way out into the last quarter of the loop.
      const back = replay ? s : window - s;
      return { starts: [s, second + (p.motion === 'ripple' ? back : (back / window) * (0.26 - len))], axis, reach };
    });

    const c = pal.colors;
    const face = (color: string): Material => ({
      color,
      roughness: FACE_ROUGHNESS[p.texture],
      metal: 0,
      texture: p.texture,
      textureScale: 1,
      textureStrength: 1,
    });
    const edge = EDGES[p.edge];

    return {
      shapes: [prototypes.thick, prototypes.thin],
      thickness: p.thickness,
      bevel: (p.bevel * p.thickness) / 2,
      gap: 1 - p.grout,
      instances: rhombi.map((r) => {
        const thick = r.kind === 'thick';
        return { shape: thick ? 0 : 1, x: r.center[0], y: r.center[1], angle: r.angle, front: thick ? 0 : 1, back: thick ? 2 : 3 };
      }),
      materials: [
        face(c[0]),
        face(c[1 % c.length]),
        face(c[2 % c.length]),
        face(c[3 % c.length]),
        { ...edge, color: edge.color ?? adjust(c[0], -0.12) },
        { color: mix(pal.bg, '#000000', 0.55), roughness: 0.85, metal: 0 },
      ],
      edge: 4,
      ground: 5,
      camera: {
        tilt: p.tilt,
        turn: p.turn,
        projection: p.projection,
        fov: p.fov,
        zoom: p.zoom,
        sway: p.drift ? p.sway : 0,
        dof: p.dof,
        fog: p.fog,
      },
      light: { azimuth: p.sunAngle, elevation: p.sunHeight, color: '#fff2df', intensity: 3.2, softness: p.softness },
      environment: { sky: adjust(pal.bg, 0.2, 0.8), horizon: pal.bg, ground: adjust(pal.bg, -0.05) },
      glow: { color: p.signalColor, intensity: 3 },
      post: { exposure: p.exposure, vignette: 0.35, grain: p.grain, bloom: p.glow ? p.bloom : 0 },
      data: { tiles, len, trail: p.trail / p.duration },
    };
  },

  animate({ p, phase }, scene, out) {
    const { tiles, len, trail } = scene.data;
    const k = p.sharpness;
    for (let i = 0; i < tiles.length; i++) {
      const { starts, axis, reach } = tiles[i];
      if (!starts.length) {
        // Never reached: rest in place (or stay away when assembling).
        out.flip[i] = out.lift[i] = out.glow[i] = 0;
        out.scale[i] = p.motion === 'ripple' ? 1 : 0;
        continue;
      }
      const a = act(phase, starts[0], len, k);
      const b = act(phase, starts[1], len, k);
      let angle: number;
      let scale = 1;
      if (p.motion === 'ripple') {
        angle = Math.PI * (a + b);
      } else {
        // Swing down into place, hold, swing away: empty ↔ empty loops.
        angle = (1 - a) * (-Math.PI / 2) + b * (Math.PI / 2);
        scale = Math.min(1, a * 4, (1 - b) * 4);
      }
      out.flip[i] = angle;
      out.axis[i] = axis;
      out.lift[i] = Math.abs(Math.sin(angle)) * reach * (1 + p.lift) * scale;
      out.scale[i] = scale;
      out.glow[i] = p.glow ? p.signal * Math.max(...starts.map((s) => signal(phase - s, len, trail))) * scale : 0;
    }
  },
});

/** Blend a 0..1 delay with per-tile randomness. */
function mixJitter(d: number, j: number, rng: () => number) {
  return Math.min(1, Math.max(0, (1 - j) * d + j * rng()));
}

/**
 * Glow of a tile `x` loop-units after the signal reaches it: lights up as it
 * starts to turn (never before), then fades into a trail. Evaluated across
 * the loop boundary so it wraps seamlessly.
 */
function signal(x: number, len: number, trail: number): number {
  const pulse = (d: number) => {
    if (d < 0) return 0;
    const rise = Math.min(1, d / (len * 0.25));
    return rise * (0.3 + 0.7 * Math.exp(-d / (len * 0.8))) * Math.exp(-d / trail);
  };
  return Math.max(pulse(x - 1), pulse(x), pulse(x + 1));
}
