import { adjust, choice, definePiece, getPalette, int, jitter, num, palette, SpatialHash } from '../../../engine2d';

interface Circle {
  x: number;
  y: number;
  r: number;
}

// Random-attempt circle packing: each candidate grows until it would touch a
// neighbour or the margin, capped by a size drawn from a biased distribution.
export default definePiece({
  id: 'circle-packing',
  title: 'Circle Packing',
  tags: ['packing', 'geometry'],
  aspect: 1,
  params: {
    palette: palette('sunset'),
    attempts: int(30000, 1000, 200000),
    minR: num(2, 0.5, 20, 0.5, 'Min radius'),
    maxR: num(90, 5, 300, 1, 'Max radius'),
    sizeBias: num(3, 0.5, 8, 0.1, 'Size bias'),
    padding: num(2.5, 0, 12, 0.5),
    margin: num(60, 0, 200, 1),
    style: choice(['solid', 'rings', 'outline'], 'solid'),
    ringStep: num(5, 1.5, 30, 0.5, 'Ring step'),
    shadow: num(0.12, 0, 0.5, 0.01),
    grain: num(0.14, 0, 0.5, 0.01),
  },
  draw({ g, p, rng, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);

    const m = p.margin;
    const circles: Circle[] = [];
    const hash = new SpatialHash<Circle>(Math.max(8, p.maxR * 2));

    for (let i = 0; i < p.attempts; i++) {
      const x = rng.range(m, W - m), y = rng.range(m, H - m);
      let r = Math.min(x - m, W - m - x, y - m, H - m - y);
      r = Math.min(r, p.minR + (p.maxR - p.minR) * Math.pow(rng(), p.sizeBias));
      if (r < p.minR) continue;
      hash.forEach(x, y, r + p.maxR + p.padding, (c) => {
        r = Math.min(r, Math.hypot(c.x - x, c.y - y) - c.r - p.padding);
      });
      if (r < p.minR) continue;
      const c = { x, y, r };
      circles.push(c);
      hash.insert(c);
    }

    for (const { x, y, r } of circles) {
      const col = jitter(rng.pick(pal.colors), rng, 0.03);
      if (p.shadow > 0) g.circle(x + r * 0.05, y + r * 0.08, r, { fill: pal.ink, alpha: p.shadow, blend: 'multiply' });

      if (p.style === 'solid') {
        g.circle(x, y, r, { fill: col });
      } else if (p.style === 'outline') {
        g.circle(x, y, r, { fill: pal.bg, stroke: pal.ink, width: Math.max(0.6, r * 0.04) });
      } else {
        g.circle(x, y, r, { fill: pal.bg });
        const ringCol = adjust(col, -0.08);
        for (let rr = r - p.ringStep * 0.5; rr > p.ringStep * 0.3; rr -= p.ringStep) {
          g.circle(x, y, rr, { stroke: rng.chance(0.8) ? col : ringCol, width: p.ringStep * 0.45 });
        }
      }
    }

    g.grain(p.grain);
  },
});
