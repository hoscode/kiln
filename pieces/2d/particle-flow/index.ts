import { choice, definePiece, getPalette, int, num, palette, TAU, type Rng } from '../../../engine2d';

interface Particle {
  x: number;
  y: number;
  px: number;
  py: number;
  age: number;
  life: number;
  color: number;
}

// Particles drift through an evolving noise field. The canvas persists between
// frames and is faded a little each frame, so paths leave glowing trails.
export default definePiece({
  id: 'particle-flow',
  title: 'Particle Flow',
  tags: ['simulation', 'particles', 'trails'],
  aspect: 16 / 9,
  animation: { duration: 12, fps: 60 },
  persist: true,
  params: {
    palette: palette('nord'),
    particles: int(4000, 100, 30000),
    speed: num(1.6, 0.2, 6, 0.1),
    scale: num(2.2, 0.2, 8, 0.05, 'Noise scale'),
    turns: num(1.2, 0.2, 4, 0.05),
    evolve: num(0.12, 0, 1, 0.01, 'Field drift'),
    life: int(240, 20, 1000, 'Lifetime'),
    fade: num(0.03, 0.002, 0.3, 0.001),
    width: num(1.1, 0.2, 5, 0.1),
    alpha: num(0.35, 0.02, 1, 0.01),
    blend: choice(['lighter', 'screen', 'source-over'], 'lighter'),
  },
  setup({ p, rng, W, H }) {
    const colors = getPalette(p.palette).colors.length;
    const ps = Array.from({ length: p.particles }, () => spawn({} as Particle, rng, W, H, p.life, colors));
    // Stagger ages so particles don't all respawn together.
    for (const q of ps) q.age = rng.int(0, q.life);
    return { ps, colors };
  },
  step(state, { p, rng, noise, W, H, t }) {
    const f = p.scale / W;
    const z = t * p.evolve;
    for (const q of state.ps) {
      q.px = q.x;
      q.py = q.y;
      const a = noise.noise3(q.x * f, q.y * f, z) * TAU * p.turns;
      q.x += Math.cos(a) * p.speed;
      q.y += Math.sin(a) * p.speed;
      if (++q.age > q.life || q.x < 0 || q.x > W || q.y < 0 || q.y > H) spawn(q, rng, W, H, p.life, state.colors);
    }
  },
  draw({ g, p, state, frame, W, H }) {
    const pal = getPalette(p.palette);
    if (frame === 0) g.background(pal.bg);
    else
      g.path([[0, 0], [W, 0], [W, H], [0, H]], { fill: pal.bg, alpha: p.fade }, true);

    // One batched stroke per color keeps thousands of particles cheap.
    const buckets = pal.colors.map((): number[] => []);
    for (const q of state.ps) if (q.px !== q.x || q.py !== q.y) buckets[q.color % buckets.length].push(q.px, q.py, q.x, q.y);
    buckets.forEach((b, i) => g.segments(b, { stroke: pal.colors[i], width: p.width, alpha: p.alpha, blend: p.blend }));
  },
});

function spawn(q: Particle, rng: Rng, W: number, H: number, life: number, colors: number): Particle {
  q.x = q.px = rng.range(0, W);
  q.y = q.py = rng.range(0, H);
  q.age = 0;
  q.life = Math.round(life * rng.range(0.5, 1.5));
  q.color = rng.int(0, colors);
  return q;
}
