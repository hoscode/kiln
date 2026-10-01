import { bool, choice, definePiece, ease, fract, getPalette, gradient, group, int, mix, num, palette, TAU, type Vec2 } from '../../../engine2d';

// A grid of tiles moved by a wave, three ways:
//  - turn: a Bees & Bombs-style loop. Every tile makes one slow eased turn per
//    loop, delayed by where it sits in the wave. Each turn is a symmetry of
//    the shape, so the loop is seamless. Neighbours can turn in opposite
//    directions, so the gaps between them open into rotating stars.
//  - heartbeat: tiles stay put and pulse with a lub-dub that ripples outward,
//    swelling and catching the light on every beat.
//  - equalizer: columns rise and fall like an audio level meter over a shared
//    bass pulse, with peak markers that hang and fall back.
// Everything is a function of the loop phase with whole-number frequencies, so
// every mode loops seamlessly. Export with motion blur (8–32 samples).
export default definePiece({
  id: 'tile-wave',
  title: 'Tile Wave',
  tags: ['loop', 'geometry', 'motion blur', 'music'],
  aspect: 1,
  animation: { duration: 8, fps: 60, loop: true, durationParam: 'loop' },
  params: {
    ...group('Motion', {
      motion: choice(['turn', 'heartbeat', 'equalizer'], 'turn'),
      loop: num(8, 2, 30, 0.5, 'Loop (s)'),
      beats: int(4, 1, 16, 'Beats per loop'),
      wave: choice(['radial', 'diagonal', 'spiral', 'twin'], 'radial'),
      spread: num(0.9, 0, 3, 0.01, 'Delay spread'),
      sharpness: num(2.2, 1, 10, 0.1),
      alternate: bool(true, 'Counter-rotate'),
      swell: num(0.14, 0, 0.6, 0.01),
    }),
    ...group('Grid', {
      grid: int(15, 3, 40),
      shape: choice(['square', 'bar', 'cross'], 'square'),
      size: num(0.7, 0.1, 1.2, 0.01),
      roundness: num(0.18, 0, 0.5, 0.01),
      margin: num(90, 0, 300, 1),
    }),
    ...group('Look', {
      palette: palette('noir'),
      glow: num(0.6, 0, 1, 0.01, 'Light'),
      shadow: num(0.5, 0, 1, 0.01),
      edge: num(0.35, 0, 1, 0.01),
      grain: num(0.06, 0, 0.4, 0.01),
    }),
  },
  draw({ g, p, phase, rng, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);

    const n = p.grid;
    const cell = (Math.min(W, H) - 2 * p.margin) / n;
    const x0 = (W - cell * n) / 2;
    const y0 = (H - cell * n) / 2;
    const R = Math.min(W, H) / 2;

    // Where each tile sits in the wave, roughly 0 (first) .. 1 (last).
    const waveDelay = (x: number, y: number) => {
      const u = (x - W / 2) / R, v = (y - H / 2) / R;
      switch (p.wave) {
        case 'diagonal':
          return (u + v + 2) / 4;
        case 'spiral':
          return Math.hypot(u, v) / Math.SQRT2 + Math.atan2(v, u) / TAU;
        case 'twin':
          return Math.min(Math.hypot(u - 0.5, v - 0.5), Math.hypot(u + 0.5, v + 0.5)) / 1.6;
        default:
          return Math.hypot(u, v) / Math.SQRT2;
      }
    };

    // Equalizer: a few voices at whole-number multiples of the beat (so it
    // loops), each drifting gradually in phase across the columns, so the bars
    // move together like a spectrum instead of at random. Lower columns ride
    // the bass harder.
    const voices = [1, 2, 3].map((k) => ({ f: p.beats * k, phi: rng(), shift: rng.range(0.04, 0.12) * (rng() < 0.5 ? -1 : 1), a: 1 / k }));
    const weight = voices.reduce((sum, v) => sum + v.a, 0);
    const level = (i: number, ph: number) => {
      const bass = heartbeat(fract(ph * p.beats)) * (1 - (0.7 * i) / n);
      let tone = 0;
      for (const { f, phi, shift, a } of voices) tone += a * (0.5 + 0.5 * Math.sin(TAU * (f * ph + phi + shift * i)));
      return Math.min(1, 0.12 + 0.4 * bass + 0.8 * (tone / weight) ** 1.4);
    };
    // Peak markers hang at the recent maximum and fall back slowly.
    const peak = (i: number) => {
      let m = 0;
      for (let k = 0; k <= 12; k++) {
        const back = (k / 12) * (0.6 / p.beats);
        m = Math.max(m, level(i, phase - back) - back * p.beats * 0.9);
      }
      return m;
    };

    type Tile = { cx: number; cy: number; lift: number; angle: number; scale: number; fill: string; dim?: boolean };
    const tiles: Tile[] = [];
    const peaks: { cx: number; y: number; fill: string }[] = [];

    for (let i = 0; i < n; i++) {
      const top = p.motion === 'equalizer' ? level(i, phase) : 0;
      if (p.motion === 'equalizer') {
        const y = y0 + cell * n * (1 - peak(i));
        peaks.push({ cx: x0 + (i + 0.5) * cell, y, fill: gradient(pal.colors, peak(i)) });
      }
      for (let j = 0; j < n; j++) {
        const cx = x0 + (i + 0.5) * cell;
        const cy = y0 + (j + 0.5) * cell;
        const base = gradient(pal.colors, Math.hypot(cx - W / 2, cy - H / 2) / (R * Math.SQRT2));
        const d = waveDelay(cx, cy) * p.spread;

        if (p.motion === 'turn') {
          const turn = p.shape === 'bar' ? TAU / 2 : TAU / 4;
          const t = ease(fract(phase - d), p.sharpness);
          const lift = Math.sin(Math.PI * t); // 0 at rest, 1 mid-turn
          const dir = p.alternate && (i + j) % 2 ? -1 : 1;
          tiles.push({ cx, cy, lift, angle: dir * turn * t, scale: 1 + p.swell * lift, fill: mix(base, pal.ink, p.glow * 0.55 * lift) });
        } else if (p.motion === 'heartbeat') {
          // The beat reaches outer tiles a little later, so each pulse ripples out.
          const lift = heartbeat(fract(phase * p.beats - d * 0.5));
          tiles.push({ cx, cy, lift, angle: 0, scale: 1 + p.swell * 2 * lift, fill: mix(base, pal.ink, p.glow * 0.7 * lift) });
        } else {
          // Rows count up from the bottom; a cell is lit up to the column's level.
          const row = (n - 1 - j + 0.5) / n;
          // Crisp LED segments, with a short soft edge so levels glide between cells.
          const lit = Math.min(1, Math.max(0, (top - row) * n * 2 + 0.5));
          const hue = gradient(pal.colors, row);
          tiles.push({
            cx,
            cy,
            lift: lit,
            angle: 0,
            scale: 0.92 + 0.08 * lit,
            fill: mix(mix(pal.bg, hue, 0.12), mix(hue, pal.ink, p.glow * 0.25 * lit), lit),
            dim: lit < 0.02,
          });
        }
      }
    }
    // Lifted tiles are drawn last, so they pass over their neighbours.
    tiles.sort((a, b) => a.lift - b.lift);

    const equalizer = p.motion === 'equalizer';
    const outline = (cx: number, cy: number, scale: number, angle: number): Vec2[][] => {
      const half = (cell * p.size * scale) / 2;
      // Equalizer cells are wide, flat segments, like an LED level meter.
      if (equalizer) return [rounded(cx, cy, half * 1.25, half * 0.62, half * 0.62 * p.roundness * 2, 0)];
      if (p.shape === 'square') return [rounded(cx, cy, half, half, half * p.roundness * 2, angle)];
      const bar = (a: number) => rounded(cx, cy, half * 1.3, half * 0.22, half * 0.22 * Math.min(1, p.roundness * 4), a);
      return p.shape === 'cross' ? [bar(angle), bar(angle + TAU / 4)] : [bar(angle)];
    };

    // Shadows first, softer and further away the higher a tile lifts.
    if (p.shadow > 0) {
      for (const { cx, cy, lift, angle, scale, dim } of tiles) {
        if (dim) continue;
        const off = cell * (equalizer ? 0.03 : 0.04 + 0.14 * lift);
        for (const [grow, alpha] of [
          [1.08, 0.12],
          [1.0, 0.2],
        ]) {
          for (const shape of outline(cx + off, cy + off * 1.4, scale * grow, angle))
            g.path(shape, { fill: '#000000', alpha: alpha * p.shadow * (0.6 + 0.4 * lift) }, true);
        }
      }
    }

    for (const { cx, cy, lift, angle, scale, fill, dim } of tiles) {
      for (const shape of outline(cx, cy, scale, angle)) {
        g.path(shape, { fill }, true);
        if (p.edge > 0 && !dim) g.path(shape, { stroke: mix(fill, pal.ink, 0.5), width: cell * 0.012, alpha: p.edge * (0.4 + 0.6 * lift) }, true);
      }
    }

    for (const { cx, y, fill } of peaks) {
      const half = (cell * p.size) / 2;
      g.path(rounded(cx, y, half * 1.25, cell * 0.035, cell * 0.035, 0), { fill: mix(fill, pal.ink, 0.4) }, true);
    }

    g.grain(p.grain);
  },
});

/**
 * A lub-dub over one beat (x in 0..1): a sharp strong pulse, a softer second
 * one just after, then rest. Quick attack, slow release; wraps seamlessly.
 */
function heartbeat(x: number): number {
  const pulse = (at: number, width: number) => {
    const dt = fract(x - at + 0.5) - 0.5; // signed distance, wrapped
    return dt < 0 ? Math.exp(-((dt / (width * 0.35)) ** 2)) : Math.exp(-dt / width);
  };
  return Math.min(1, pulse(0.02, 0.07) + 0.6 * pulse(0.2, 0.09));
}

/** A rectangle with rounded corners as a polygon, rotated by `a` about its centre. */
function rounded(cx: number, cy: number, hw: number, hh: number, r: number, a: number): Vec2[] {
  r = Math.min(r, hw, hh);
  const c = Math.cos(a), s = Math.sin(a);
  const pts: Vec2[] = [];
  const corners: [number, number, number][] = [
    [hw - r, hh - r, 0],
    [-hw + r, hh - r, TAU / 4],
    [-hw + r, -hh + r, TAU / 2],
    [hw - r, -hh + r, (3 * TAU) / 4],
  ];
  const steps = r > 0 ? 6 : 0;
  for (const [x, y, start] of corners) {
    for (let k = 0; k <= steps; k++) {
      const t = start + (k / Math.max(1, steps)) * (TAU / 4);
      pts.push([x + r * Math.cos(t), y + r * Math.sin(t)]);
    }
  }
  return pts.map(([x, y]): Vec2 => [cx + x * c - y * s, cy + x * s + y * c]);
}
