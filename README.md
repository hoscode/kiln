# studio

An AI-native, open-source studio for programmable art: 2D generative
drawings, interactive math objects, and path-traced 3D renders.

See [PLAN.md](PLAN.md) for architecture and milestones.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run check      # type-check
npm run render:svg -- flow-field 42   # → renders/flow-field-42.svg
```

Keys: `←`/`→` seed · `R` random seed · `D` dice params.

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
