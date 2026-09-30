# Studio — Plan

A personal, open-source, AI-native studio for programmable art: 2D generative
drawings, interactive mathematical objects, and path-traced 3D renders at
print quality. Built for fun first, and good enough to sell.

## Principles

- **Pieces are code, written by us.** AI is a collaborator inside the tool
  (reads code, tweaks params, looks at renders) — not a black-box generator.
- **Deterministic.** Every piece is a pure function of `(params, seed, t)`.
  Same inputs → same image, at any resolution. Required for editions and
  re-rendering for print.
- **Typed parameters.** Each piece declares a param schema; the UI builds
  controls from it and Claude edits params through it.
- **Resolution independent.** Pieces draw in abstract units; output size is
  a render setting (1080p preview → 16K print).
- **Open source stack.** Cycles, OIDN, OpenUSD, OpenVDB, OCIO, WebGPU.
  Mojo is used for kernels behind a small interface (stdlib is open; check
  compiler status) so it stays swappable.
- **Finishing matters.** Palettes (OKLCH), grain, paper, line quality,
  composition, color management (AgX/ACES) are first-class features.

## Architecture

```
                 ┌─────────── UI (web, ours) ──────────┐
                 │ params · seeds · timeline · gallery │
                 └──────┬───────────────────────┬──────┘
         live, 60fps    │                       │   queued, offline
   ┌────────────────────▼───┐       ┌───────────▼───────────────┐
   │ 2D / real-time engine  │       │ 3D render engine          │
   │ TypeScript + WebGPU    │       │ Python + Mojo + Cycles    │
   │ Canvas2D / SVG         │       │ meshes, curves, volumes   │
   └──────────┬─────────────┘       └───────────┬───────────────┘
              ▼                                  ▼
   SVG (plotter) · 16K PNG · video      EXR / 16-bit PNG · video
                 ▲                                  ▲
                 └────── Claude via MCP (both) ─────┘
```

### Piece contract (shared by both engines)

```
meta:    id, title, engine ("2d" | "3d"), tags
params:  typed schema (number/range, int, bool, color, palette, enum, vec)
seed:    integer; all randomness flows from a seeded PRNG
t:       time in seconds (animation), optional
render:  (params, seed, t, target) -> image / svg / scene
```

### Repo layout (target)

```
studio/
  PLAN.md
  apps/ui/            web UI (Vite + TS) — shell, param panels, gallery
  engine2d/           TS: canvas/SVG/WebGPU renderer, PRNG, noise, palettes, export
  pieces/2d/          2D pieces (one folder each)
  worker3d/           Python: render server, bpy/Cycles scene builders, OIDN, OCIO
  kernels/            Mojo: SDF grids, meshing, attractors, sims, volumes
  pieces/3d/          3D pieces (Python + optional Mojo kernels)
  mcp/                MCP server exposing the studio to Claude
  references/         notes + links on pieces we want to recreate
  renders/            outputs (gitignored)
```

## Stack

| Area | Choice |
|---|---|
| UI | Vite + Svelte 5 + TypeScript |
| 2D render | Canvas2D and SVG first; WebGPU for shaders / heavy real-time |
| 3D render | Blender Cycles via `bpy` (headless), GPU via Metal locally, OptiX on rented NVIDIA later |
| Alt renderer | Mitsuba 3 (spectral / differentiable experiments) |
| Denoise | Intel Open Image Denoise |
| Scene / materials | bpy directly first; OpenUSD + MaterialX later |
| Volumes | OpenVDB |
| Color | OCIO, AgX view transform; OKLCH for palettes |
| Kernels | Mojo (CPU SIMD first; GPU where supported) |
| Env | `pixi` for Python + Mojo; `npm` for web |
| AI | MCP server: list pieces, get/set params, render preview (returns image), edit piece |

## Milestones

### M0 — Environment
- [ ] Install `pixi`; create env with Python 3.11 (required by `bpy`) + numpy + bpy
- [ ] Upgrade Mojo (local is 24.4 via the old `modular` CLI) to current via pixi
- [ ] Verify Cycles renders headless on Metal (M1 Pro)
- [ ] Verify Python ↔ Mojo interop with a trivial kernel

### M1 — 2D engine + UI shell
- [x] Vite + Svelte 5 + TS app; pieces auto-discovered from `pieces/2d/*/index.ts`, hot reload
- [x] Param schema → auto-generated controls; per-piece seed with prev/next/random; dice/reset params
- [x] Core libs: seeded PRNG (sfc32), simplex 2D/3D + fbm + curl, OKLab/OKLCH color, palettes, grain, spatial hash
- [x] Surface abstraction: same piece code → canvas (any resolution) or SVG
- [x] Export: PNG (2K–16K, single canvas) and SVG; `npm run render:svg` CLI
- [x] First pieces: flow field, circle packing, watercolor
- [ ] Tiled PNG export beyond browser canvas limits (Safari caps far below 16K)
- [ ] Render in a Web Worker so heavy pieces don't block the UI
- [ ] Watercolor: per-layer texture masking (Hobbs-style) for more paper-like variation
- [ ] Snapshot/favorites: save (piece, params, seed) combos to a gallery
- [ ] URL state for sharing a specific variation

### M2 — 3D worker
- [ ] Python render worker (HTTP/WebSocket) with job queue
- [ ] Scene builder helpers: camera, HDRI, lights, materials (glass, metal, iridescent, subsurface)
- [ ] AgX color management, OIDN denoising, 16-bit PNG / EXR output
- [ ] First piece: path-traced glass gyroid (numpy marching cubes to start)
- [ ] UI: render button, progress, preview vs final quality presets

### M3 — Mojo kernels
- [ ] SDF → grid → mesh (marching cubes / dual contouring) in Mojo
- [ ] Strange attractor / IFS density grids → points, curves, or VDB volumes
- [ ] Benchmark vs numpy; keep a Python fallback for each kernel

### M4 — MCP / AI-native
- [ ] MCP server: `list_pieces`, `get_params`, `set_params`, `render_preview`, `edit_piece`
- [ ] Claude can see previews and iterate on params with us

### M5 — Animation + interactivity
- [ ] Timeline, param keyframes, frame-exact video export (WebCodecs / ffmpeg)
- [ ] Interactive pieces (mouse / input-driven), standalone shareable build per piece

### M6 — Sell-ready output
- [ ] Print pipeline: 16K+ tiled stills, color profiles, contact sheets of seeds
- [ ] Plotter-ready SVG (path optimization, pen layers)
- [ ] Edition workflow: seed lists, metadata, reproducibility checks

## Piece backlog

2D (r/generative-style):
flow fields · circle packing · Truchet tiles · differential growth · substrate
cracks · DLA · reaction-diffusion · halftone / dithering · plotter line work ·
watercolor · space colonization · Voronoi / Delaunay stipple

3D / math:
gyroid & TPMS · Clifford torus · knots & tubes · strange attractors (volumetric) ·
Mandelbulb / fractals · minimal surfaces · parametric shells · caustics studies

## Open questions

- Where heavy renders run long-term: local M1 Pro vs rented NVIDIA box?
- Reference pieces from r/generative to recreate first (collect in `references/`)
- Mojo compiler licensing status — acceptable, or keep kernels swappable only?
