import {
  act,
  adjacency,
  adjust,
  bfs,
  bool,
  choice,
  color,
  getPalette,
  int,
  mix,
  nearest,
  num,
  palette,
  penroseP3,
  spreadOut,
  WAVE_PATTERNS,
  waveDirection,
  waveField,
  walkers,
  type Vec2,
} from '../../../engine2d';
import { defineScene, type Material, type SurfaceTexture } from '../../../enginegl';

// A Penrose P3 floor that ripples: tiles hop, turn over to reveal their other
// face, and settle. Two passes per loop (out, then back) bring every tile
// through a full turn, so the loop is seamless.
//
// Order: `cascade` spreads tile-to-neighbour like dominoes (rings of hops),
// `chain` grows a few wandering paths that flip one tile after another, the
// rest are position-based wave fields. In the neighbour orders each tile tips
// away from the tile that set it off, and a signal glow marks the message
// arriving (bright flash) and the path it took (fading trail).

const EDGES: Record<string, Omit<Material, 'color'> & { color?: string }> = {
  brass: { color: '#c9a15a', roughness: 0.28, metal: 1, texture: 'brushed', textureStrength: 0.7 },
  steel: { color: '#c3c8cf', roughness: 0.22, metal: 1, texture: 'brushed', textureStrength: 0.7 },
  matte: { roughness: 0.65, metal: 0 },
};

const FACE_ROUGHNESS: Record<SurfaceTexture, number> = { marble: 0.2, ceramic: 0.14, brushed: 0.36, plain: 0.45 };

interface Tile {
  delay: number;
  axis: number;
  /** Half-width across the flip axis: how high the tile must rise to clear the floor. */
  reach: number;
}

export default defineScene({
  id: 'penrose-flip',
  title: 'Penrose Flip',
  tags: ['3d', 'tiling', 'loop', 'broadcast'],
  aspect: 16 / 9,
  animation: { duration: 16, fps: 30, loop: true },
  params: {
    palette: palette('midnight'),
    tilt: num(35, 0, 80, 1, 'Camera tilt'),
    turn: num(-62, -180, 180, 1, 'Camera turn'),
    projection: choice(['perspective', 'orthographic'], 'perspective'),
    fov: num(30, 10, 70, 1, 'Lens (fov)'),
    zoom: num(6, 2, 20, 0.1),
    motion: choice(['ripple', 'assemble'], 'ripple'),
    pattern: choice(['chain', 'cascade', ...WAVE_PATTERNS], 'chain', 'Order'),
    origin: choice(['center', 'edge', 'random'], 'center', 'Starts at'),
    strands: int(8, 1, 24, 'Chain strands'),
    axis: choice(['wave', 'diagonal'], 'wave', 'Flip axis'),
    flipLength: num(0.03, 0.005, 0.45, 0.005, 'Flip length'),
    sharpness: num(3, 1, 8, 0.1),
    jitter: num(0.02, 0, 0.6, 0.01),
    lift: num(0.35, 0, 2, 0.05),
    signal: num(1.2, 0, 4, 0.05, 'Signal glow'),
    trail: num(0.06, 0.005, 0.4, 0.005, 'Signal trail'),
    signalColor: color('#ffc46b', 'Signal color'),
    bloom: num(0.6, 0, 2, 0.05),
    texture: choice(['marble', 'ceramic', 'brushed', 'plain'], 'marble'),
    edge: choice(['brass', 'steel', 'matte'], 'brass'),
    thickness: num(0.12, 0.03, 0.4, 0.005),
    bevel: num(0.45, 0, 1, 0.01),
    grout: num(0.035, 0, 0.2, 0.005),
    generations: int(7, 5, 9, 'Detail'),
    sunHeight: num(38, 8, 85, 1, 'Sun height'),
    sunAngle: num(215, 0, 360, 1, 'Sun angle'),
    softness: num(0.45, 0, 1, 0.01, 'Shadow softness'),
    drift: bool(true, 'Camera drift'),
    sway: num(0.12, 0, 0.6, 0.01, 'Drift amount'),
    dof: num(0.35, 0, 1, 0.01, 'Depth of field'),
    fog: num(0.35, 0, 1, 0.01),
    exposure: num(1, 0.3, 3, 0.05),
    grain: num(0.02, 0, 0.1, 0.005),
  },

  build({ p, noise, rng }) {
    const pal = getPalette(p.palette);
    const { rhombi, prototypes } = penroseP3(p.generations);
    const centers = rhombi.map((r) => r.center);

    // Choreograph the tiles around the visible area; tiles beyond it stay put.
    const radius = p.zoom * 2.4;
    const inView = (i: number) => Math.hypot(centers[i][0], centers[i][1]) < radius;
    const startAt: Vec2 = p.origin === 'edge' ? [-radius * 0.9, 0] : p.origin === 'random' ? [rng.range(-1, 1) * radius * 0.6, rng.range(-1, 1) * radius * 0.4] : [0, 0];

    const delays = new Float32Array(rhombi.length).fill(-1); // −1: never moves
    const directions: Vec2[] = rhombi.map(() => [1, 0]);
    if (p.pattern === 'cascade' || p.pattern === 'chain') {
      const adj = adjacency(rhombi.map((r) => r.verts));
      const start = nearest(centers, startAt[0], startAt[1]);
      const walk =
        p.pattern === 'cascade'
          ? bfs(adj, start, inView)
          : walkers(adj, spreadOut(centers, [...centers.keys()].filter(inView), start, p.strands), rng.fork('walk'), {
              include: inView,
              centers,
            });
      const last = Math.max(1, ...walk.rank);
      rhombi.forEach((_, i) => {
        if (walk.rank[i] < 0) return;
        delays[i] = walk.rank[i] / last;
        const from = walk.parent[i];
        if (from >= 0) directions[i] = [centers[i][0] - centers[from][0], centers[i][1] - centers[from][1]];
      });
    } else {
      const field = waveField(p.pattern, { radius, angle: 0.5, noise });
      rhombi.forEach(({ center: [x, y] }, i) => {
        if (!inView(i)) return;
        delays[i] = field(x - startAt[0], y - startAt[1]);
        directions[i] = waveDirection(field, x - startAt[0], y - startAt[1]);
      });
    }

    const tiles = rhombi.map((r, i): Tile => {
      const [x, y] = r.center;
      const [dx, dy] = directions[i];
      // Axis perpendicular to the direction of travel: the tile tips forward.
      const axis = p.axis === 'wave' ? Math.atan2(dy, dx) + Math.PI / 2 : r.angle;
      const perp: Vec2 = [-Math.sin(axis), Math.cos(axis)];
      const reach = Math.max(...r.verts.map(([vx, vy]) => Math.abs((vx - x) * perp[0] + (vy - y) * perp[1])));
      const d = delays[i];
      // Chains are already ordered tile by tile; jitter would scramble them.
      const j = p.pattern === 'chain' ? 0 : p.jitter;
      return { delay: d < 0 ? -1 : Math.min(1, Math.max(0, (1 - j) * d + j * rng())), axis, reach };
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
      post: { exposure: p.exposure, vignette: 0.35, grain: p.grain, bloom: p.bloom },
      data: tiles,
    };
  },

  animate({ p, phase }, scene, out) {
    const tiles = scene.data;
    const k = p.sharpness;
    for (let i = 0; i < tiles.length; i++) {
      const { delay, axis, reach } = tiles[i];
      if (delay < 0) {
        // Outside the choreographed area: rest in place (or stay away when assembling).
        out.flip[i] = out.lift[i] = out.glow[i] = 0;
        out.scale[i] = p.motion === 'ripple' ? 1 : 0;
        continue;
      }
      let angle: number;
      let scale = 1;
      let starts: number[];
      let len: number;
      if (p.motion === 'ripple') {
        // Out: centre → edge over the first half. Back: edge → centre over the second.
        len = p.flipLength;
        starts = [delay * (0.5 - len), 0.5 + (1 - delay) * (0.5 - len)];
        angle = Math.PI * (act(phase, starts[0], len, k) + act(phase, starts[1], len, k));
      } else {
        // Tiles swing down into place, hold, then swing away; empty ↔ empty loops.
        len = Math.min(p.flipLength, 0.24);
        starts = [delay * (0.45 - len), 0.72 + delay * (0.26 - len)];
        const arrive = act(phase, starts[0], len, k);
        const leave = act(phase, starts[1], len, k);
        angle = (1 - arrive) * (-Math.PI / 2) + leave * (Math.PI / 2);
        scale = Math.min(Math.min(1, arrive * 4), Math.min(1, (1 - leave) * 4));
      }
      out.flip[i] = angle;
      out.axis[i] = axis;
      out.lift[i] = Math.abs(Math.sin(angle)) * reach * (1 + p.lift) * scale;
      out.scale[i] = scale;
      out.glow[i] = p.signal * Math.max(...starts.map((s) => signal(phase - s, len, p.trail))) * scale;
    }
  },
});

/**
 * Glow of a tile `x` loop-units after its signal arrives: a short rise, a
 * bright flash as it flips, then a faint trail. Evaluated across the loop
 * boundary so the glow wraps seamlessly.
 */
function signal(x: number, len: number, trail: number): number {
  const pulse = (d: number) => {
    const rise = len * 0.6;
    if (d < -rise) return 0;
    if (d < 0) return (1 + d / rise) ** 2;
    return (0.3 + 0.7 * Math.exp(-d / (len * 0.8))) * Math.exp(-d / trail);
  };
  return Math.max(pulse(x - 1), pulse(x), pulse(x + 1));
}
