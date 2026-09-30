import { choice, definePiece, delayed, ease, getPalette, gradient, int, num, palette, TAU, type Vec2 } from '../../../engine2d';

// A Bees & Bombs-style loop: every tile makes one eased turn per loop, delayed
// by its distance from the centre, so a wave ripples outward. Each turn is a
// symmetry of the shape, which makes the loop seamless. Export with motion
// blur (8–32 samples) for the silky look.
export default definePiece({
  id: 'tile-wave',
  title: 'Tile Wave',
  tags: ['loop', 'geometry', 'motion blur'],
  aspect: 1,
  animation: { duration: 4, fps: 60, loop: true },
  params: {
    palette: palette('noir'),
    grid: int(11, 3, 40),
    shape: choice(['square', 'bar', 'cross'], 'square'),
    size: num(0.62, 0.1, 1.2, 0.01),
    sharpness: num(4, 1, 10, 0.1),
    spread: num(0.9, 0, 3, 0.01, 'Delay spread'),
    margin: num(90, 0, 300, 1),
    grain: num(0.08, 0, 0.4, 0.01),
  },
  draw({ g, p, phase, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);

    const cell = (Math.min(W, H) - 2 * p.margin) / p.grid;
    const x0 = (W - cell * p.grid) / 2;
    const y0 = (H - cell * p.grid) / 2;
    const turn = p.shape === 'bar' ? TAU / 2 : TAU / 4;

    for (let i = 0; i < p.grid; i++) {
      for (let j = 0; j < p.grid; j++) {
        const cx = x0 + (i + 0.5) * cell;
        const cy = y0 + (j + 0.5) * cell;
        const d = Math.hypot(cx - W / 2, cy - H / 2) / (Math.min(W, H) / 2);
        const angle = turn * ease(delayed(phase, d * p.spread), p.sharpness);
        const fill = gradient(pal.colors, d / Math.SQRT2);
        const half = (cell * p.size) / 2;

        if (p.shape === 'square') {
          g.path(rect(cx, cy, half, half, angle), { fill }, true);
        } else {
          g.path(rect(cx, cy, half * 1.3, half * 0.22, angle), { fill }, true);
          if (p.shape === 'cross') g.path(rect(cx, cy, half * 1.3, half * 0.22, angle + TAU / 4), { fill }, true);
        }
      }
    }

    g.grain(p.grain);
  },
});

function rect(cx: number, cy: number, hw: number, hh: number, a: number): Vec2[] {
  const c = Math.cos(a), s = Math.sin(a);
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]): Vec2 => [cx + x * c - y * s, cy + x * s + y * c]);
}
