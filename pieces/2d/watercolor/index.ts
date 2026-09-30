import { choice, definePiece, getPalette, int, jitter, num, palette, TAU, type Rng, type Vec2 } from '../../../engine2d';

interface Vertex {
  x: number;
  y: number;
  /** Per-vertex variance: uneven variance is what makes edges feel organic. */
  v: number;
}

// Tyler Hobbs-style watercolor: a polygon is recursively deformed into a base
// shape, then each of many translucent layers deforms the base again.
// Layers are interleaved across blobs so the colors glaze over each other.
export default definePiece({
  id: 'watercolor',
  title: 'Watercolor',
  tags: ['watercolor', 'texture', 'polygons'],
  aspect: 5 / 4,
  params: {
    palette: palette('desert'),
    blobs: int(7, 1, 24),
    layers: int(45, 5, 120),
    sides: int(10, 3, 24),
    size: num(170, 40, 400, 1),
    variance: num(1, 0.2, 3, 0.05),
    baseDepth: int(3, 1, 5, 'Base depth'),
    layerDepth: int(3, 1, 5, 'Layer depth'),
    alpha: num(0.03, 0.005, 0.15, 0.001),
    blend: choice(['source-over', 'multiply'], 'source-over'),
    margin: num(120, 0, 300, 1),
    grain: num(0.16, 0, 0.5, 0.01),
  },
  draw({ g, p, rng, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);

    const m = p.margin;
    // Best-candidate sampling keeps blobs spread out instead of clumping.
    const centers: Vec2[] = [];
    for (let i = 0; i < p.blobs; i++) {
      let best: Vec2 = [0, 0], bestD = -1;
      for (let k = 0; k < 12; k++) {
        const c: Vec2 = [rng.range(m, W - m), rng.range(m, H - m)];
        const d = Math.min(Infinity, ...centers.map(([x, y]) => Math.hypot(x - c[0], y - c[1])));
        if (d > bestD) [best, bestD] = [c, d];
      }
      centers.push(best);
    }

    const blobs = centers.map(([cx, cy]) => {
      const r = p.size * rng.range(0.6, 1.2);
      const poly: Vertex[] = Array.from({ length: p.sides }, (_, i) => {
        const a = (i / p.sides) * TAU;
        const rr = r * rng.range(0.85, 1.1);
        return { x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr, v: rng.range(0.4, 1.6) };
      });
      return { base: deform(poly, p.baseDepth, rng, p.variance), color: rng.pick(pal.colors) };
    });

    for (let l = 0; l < p.layers; l++) {
      for (const b of blobs) {
        const layer = deform(b.base, p.layerDepth, rng, p.variance);
        g.path(layer.map((v): Vec2 => [v.x, v.y]), { fill: jitter(b.color, rng, 0.015), alpha: p.alpha, blend: p.blend }, true);
      }
    }

    g.grain(p.grain);
  },
});

function deform(poly: Vertex[], depth: number, rng: Rng, variance: number): Vertex[] {
  let cur = poly;
  for (let d = 0; d < depth; d++) {
    const out: Vertex[] = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      const v = (a.v + b.v) / 2;
      const sd = Math.hypot(b.x - a.x, b.y - a.y) * 0.25 * v * variance;
      out.push(a, { x: (a.x + b.x) / 2 + rng.gauss(0, sd), y: (a.y + b.y) / 2 + rng.gauss(0, sd), v: v * rng.range(0.7, 1.15) });
    }
    cur = out;
  }
  return cur;
}
