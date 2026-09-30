import { definePiece, getPalette, int, jitter, num, palette, SpatialHash, TAU, type Vec2 } from '../../../engine2d';

// Lines traced through a (domain-warped) noise angle field. With spacing > 0,
// lines stop before touching others, giving the evenly-combed look.
export default definePiece({
  id: 'flow-field',
  title: 'Flow Field',
  tags: ['noise', 'lines', 'plotter'],
  aspect: 4 / 5,
  params: {
    palette: palette('kyoto'),
    lines: int(3000, 100, 12000),
    steps: int(220, 10, 800),
    stepLen: num(1.5, 0.5, 6, 0.1, 'Step length'),
    scale: num(1.8, 0.2, 8, 0.05, 'Noise scale'),
    octaves: int(2, 1, 5),
    turns: num(0.8, 0.1, 4, 0.05),
    warp: num(0.5, 0, 2, 0.05, 'Domain warp'),
    spacing: num(3.5, 0, 12, 0.5),
    width: num(1.6, 0.2, 8, 0.1),
    widthJitter: num(0.5, 0, 1, 0.05, 'Width jitter'),
    alpha: num(0.9, 0.1, 1, 0.01),
    margin: num(80, 0, 200, 1),
    grain: num(0.12, 0, 0.5, 0.01),
  },
  draw({ g, p, rng, noise, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);

    const f = p.scale / W;
    const angle = (x: number, y: number) => {
      let qx = x * f, qy = y * f;
      if (p.warp > 0) {
        qx += p.warp * noise.fbm2(qx + 5.2, qy + 1.3, 2);
        qy += p.warp * noise.fbm2(qx - 3.7, qy + 8.1, 2);
      }
      return noise.fbm2(qx, qy, p.octaves) * TAU * p.turns;
    };

    const m = p.margin;
    const inside = (x: number, y: number) => x > m && x < W - m && y > m && y < H - m;
    const taken = p.spacing > 0 ? new SpatialHash<{ x: number; y: number }>(p.spacing) : null;

    for (let i = 0; i < p.lines; i++) {
      let x = rng.range(m, W - m), y = rng.range(m, H - m);
      if (taken?.some(x, y, p.spacing)) continue;

      const pts: Vec2[] = [[x, y]];
      for (let s = 0; s < p.steps; s++) {
        const a = angle(x, y);
        x += Math.cos(a) * p.stepLen;
        y += Math.sin(a) * p.stepLen;
        if (!inside(x, y) || taken?.some(x, y, p.spacing)) break;
        pts.push([x, y]);
      }
      if (pts.length < 6) continue;
      if (taken) for (const [px, py] of pts) taken.insert({ x: px, y: py });

      g.path(pts, {
        stroke: jitter(rng.pick(pal.colors), rng, 0.025),
        width: p.width * (1 - p.widthJitter * rng()),
        alpha: p.alpha,
      });
    }

    g.grain(p.grain);
  },
});
