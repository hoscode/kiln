# kiln — Publishing

Where to sign up, what to upload, and how to get from a render to a post.
Platform limits change often — check each one's current upload specs before
a big render.

## Sign up (in order)

Use one handle everywhere (e.g. `kiln` or your name), and the same profile
picture and one-line bio: *"Programmable art — every frame is code."*

| # | Where | Why | Format |
|---|-------|-----|--------|
| 1 | **Instagram** | Biggest audience for generative / satisfying loops; Reels get discovered | 9:16 Reels, ≤ 90 s for reach; 4:5 or 1:1 feed posts |
| 2 | **TikTok** | Same audience, strong discovery for "oddly satisfying" | 9:16, 15–60 s |
| 3 | **YouTube** | Shorts for reach, plus full-length 16:9 loops that people leave running | Shorts 9:16 ≤ 60 s; full loops 16:9, 4K |
| 4 | **X / Bluesky** | Where the creative-coding community posts (#genart, #creativecoding) | 16:9 or 1:1, ≤ 2 min |
| 5 | **Vimeo** | Clean, ad-free home for the full-quality 4K versions; good to link to | 16:9 master |
| 6 | **Reddit** | r/generative, r/creativecoding, r/oddlysatisfying | Short clip + one line on how it's made |
| 7 | **Are.na / Behance** | Portfolio; where art directors and studios look | Stills + one video per project |

Later, once there's a body of work:

- **Stock footage** — Pond5, Adobe Stock, Shutterstock accept abstract
  4K loops; seamless loops sell. Needs clean masters (no watermark, no grain
  overlays you don't own).
- **Prints** — 16K PNG stills from the image mode: INPRNT, Society6, or a
  Shopify/Big Cartel shop.
- **On-chain editions** — fxhash or objkt (Tezos) if you want collectable
  editions; kiln is already deterministic (params + seed → same output),
  which is exactly what those platforms need.

## Stock footage: upload once, reach many

Check each service's current fees and terms before signing up.

- **Distributor — Blackbox (blackbox.global).** One account: upload and
  keyword once, it submits to Shutterstock, Adobe Stock, Pond5, Getty/iStock
  and others, and takes a share of each sale on top of the agencies' cut.
  Start here to test demand with no per-agency setup.
- **Multi-upload tools — Xpiks (free) or StockSubmitter (paid).** You hold
  your own account on each agency (approval needed per site); the tool sends
  files + titles + keywords to all of them at once (mostly FTP). You keep the
  full contributor share. Switch to this for the agencies that sell best.

Preparing clips:

- Cut each master into several **5–60 s clips** (10–30 s is the sweet spot):
  opening spark, mid-growth, full coverage, flip-back. Say "seamless loop"
  in the title when it is one.
- 4K (3840×2160); high-bitrate H.264/HEVC, or ProRes:
  `ffmpeg -ss 20 -i master.mp4 -t 20 -c:v prores_ks -profile:v 3 -an clip.mov`
- No audio, no watermark, no third-party overlays.
- Label as **computer-generated / 3D animation** — procedural code, not
  generative AI. Abstract CG needs no model or property releases.
- 25–50 keywords per clip: abstract, geometric, penrose tiling, tiles,
  flipping, motion background, seamless loop, minimal, pattern, mosaic, 3D,
  4K, backdrop.

## Science videos

For the science series (see PLAN.md → *Piece backlog*):

- **YouTube** — 3–8 min explainers (kiln visuals + narration / labels,
  Manim for equations); Shorts for one striking phenomenon with one caption.
- **Stock** — "science background", "simulation", "fractal", "particles"
  sell steadily to educational publishers and documentary editors.
- **Wikimedia Commons** — freely licensed animations used on Wikipedia;
  credibility and reach.
- **Labs, universities, journal covers** — accurate, beautiful visuals get
  commissioned; keep a portfolio page for them.
- Always cite the model and parameters in the caption
  (e.g. "Gray–Scott, F = 0.037, k = 0.06").

## Masters: what to render

Render one **master** per piece, then cut every platform version from it with
ffmpeg — never re-render per platform.

- Video mode → **MP4 · HEVC or H.264, 3840px, 8 sub-frames**, quality *max*.
  (Or PNG sequence → ProRes for an archival master; the app prints the
  ffmpeg command.)
- Keep the URL from the address bar with the master: it records the piece,
  seed and every param, so the video can be re-rendered later at any size.
- For Penrose Flip **reaction**, make sure it covers the whole frame before
  rendering: export is exactly one loop, and the reaction only reaches what
  fits in it. Raise *Tendrils* (or *Loop length*, or set *Starts at → center*)
  until every tile flips by the middle of the loop.

## Cutting versions (ffmpeg)

Replace `master.mp4` with the downloaded file.

```sh
# Just the spreading half of a reaction (first half of the loop)
ffmpeg -i master.mp4 -t 90 -c copy reaction.mp4

# 9:16 vertical (Reels / TikTok / Shorts): centre crop to 1080x1920
ffmpeg -i master.mp4 -vf "crop=ih*9/16:ih,scale=1080:1920" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -an vertical.mp4

# 4:5 feed post: centre crop to 1080x1350
ffmpeg -i master.mp4 -vf "crop=ih*4/5:ih,scale=1080:1350" -c:v libx264 -crf 18 -preset slow -pix_fmt yuv420p -an feed.mp4

# Speed up 2x for short-form (a 180 s loop → 90 s)
ffmpeg -i master.mp4 -vf "setpts=0.5*PTS" -c:v libx264 -crf 18 -pix_fmt yuv420p -an fast.mp4

# Any section: start at 30 s, keep 45 s
ffmpeg -ss 30 -i master.mp4 -t 45 -c:v libx264 -crf 18 -pix_fmt yuv420p -an clip.mp4
```

Centre crops of a 16:9 frame lose the sides; for vertical-first pieces it is
better to add a 9:16 aspect to the piece and render a vertical master (see
*Next* below).

## Posting

- **Cadence:** 3 posts a week beats bursts. Batch-render a week at a time.
- **Hook in the first second:** start short-form clips where something is
  already moving — trim off slow openings.
- **Loop it:** seamless loops replay automatically on Reels/TikTok and count
  as rewatches; kiln loops are seamless by design, so post whole loops when
  they fit.
- **Caption:** title, one line on the idea, the tools (`made with code`,
  `#generativeart #creativecoding #penrosetiling #proceduralart`).
  Keep the seed in the caption — collectors and coders like it.
- **Sound:** most posts are watched muted; for Reels/TikTok, a trending
  ambient track boosts reach. Only use the platform's licensed library.
- **Pin a link** (Linktree or a simple page) to Vimeo / shop once they exist.

## Next (in kiln)

- [ ] Aspect choice in Penrose Flip (16:9, 9:16, 4:5, 1:1) so vertical
      masters frame properly instead of being cropped.
- [ ] "Reaction covers frame" check in the panel: show whether every tile
      flips within the loop, and the Tendrils / Loop length needed if not.
- [ ] Export presets: *Master 4K*, *Reels 1080x1920*, *Feed 1080x1350*.
- [ ] Save the param URL into the MP4 metadata alongside the PNG text
      chunks we already write for stills.
