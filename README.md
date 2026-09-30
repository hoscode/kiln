# kiln

An AI-native, open-source kiln for programmable art: 2D generative
drawings, interactive math objects, and path-traced 3D renders.

See [PLAN.md](PLAN.md) for architecture and milestones.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # type-check
npm run render:svg -- flow-field 42   # → renders/flow-field-42.svg
```

Keys: `←`/`→` seed · `R` random seed · `D` dice params · `S` save · `Space` play · `,`/`.` step frame.

## Writing a piece

Create `pieces/2d/<id>/index.ts` — it's picked up automatically:

```ts
import { definePiece, getPalette, int, num, palette } from '../../../engine2d';

export default definePiece({
  id: 'my-piece',
  title: 'My Piece',
  aspect: 1, // width / height; width is always 1000 units
  params: { palette: palette('kyoto'), count: int(100, 1, 1000), size: num(10, 1, 50) },
  draw({ g, p, rng, noise, W, H }) {
    const pal = getPalette(p.palette);
    g.background(pal.bg);
    for (let i = 0; i < p.count; i++)
      g.circle(rng.range(0, W), rng.range(0, H), p.size, { fill: rng.pick(pal.colors) });
    g.grain(0.1);
  },
});
```

All randomness must come from `rng` / `noise` so a (params, seed) pair always
reproduces the same image at any resolution.

## Animation

Add `animation` to make a piece animated. Stateless pieces are a pure function
of time. Use `phase` (0 → 1 over the loop) and seamless helpers such as
`noise.loop2` and `ease`:

```ts
animation: { duration: 4, fps: 60, loop: true },
draw({ g, phase, noise }) { /* … */ }
```

Simulations keep state and advance one frame at a time. Replaying them is
deterministic, so scrubbing and exports match what you saw:

```ts
persist: true, // keep the canvas between frames (trails)
setup({ rng }) { return { particles: [...] }; },
step(state, { noise, t }) { /* move particles */ },
draw({ g, state, frame }) { /* frame 0 paints the background */ },
```

Video export renders every frame exactly, optionally averaging sub-frames
for motion blur. It produces MP4 (H.264/HEVC/AV1) or a lossless PNG sequence
in `renders/<name>/`.

## Shader pieces

`pieces/shader/<id>/index.ts` + a `.frag` with a Shadertoy-style
`mainImage(out vec4 fragColor, in vec2 fragCoord)`. Params become uniforms
`u_<key>` (palettes: `u_<key>[8]`, `u_<key>_n`, `u_<key>_bg`, `u_<key>_ink`).
`iTime`, `iPhase`, `iResolution`, `kiln_snoise`, `kiln_hash12`, `kiln_rot`
are in scope; see `enginegl/prelude.ts`.
