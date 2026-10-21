"""Render the scene's animation and time every frame, for a headless run:

    blender -b scene.blend -P blender/tools/gpu.py -P blender/tools/render_timed.py -- <out_dir>

Frames go to <out_dir>/frames/, and <out_dir>/timing.json + timing.txt record
per-frame times and what a longer video would cost on this machine."""
import json
import os
import platform
import sys
import time

import bpy

out = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "renders/timed"
os.makedirs(os.path.join(out, "frames"), exist_ok=True)
scene = bpy.context.scene
scene.render.filepath = os.path.join(os.path.abspath(out), "frames", "")
scene.render.image_settings.file_format = "PNG"

times = []
started = {}


def pre(scene, *_):
    started["t"] = time.perf_counter()


def post(scene, *_):
    dt = time.perf_counter() - started["t"]
    times.append({"frame": scene.frame_current, "seconds": round(dt, 2)})
    done = len(times)
    total = scene.frame_end - scene.frame_start + 1
    print(f"[timer] frame {scene.frame_current}: {dt:.1f}s  ({done}/{total})", flush=True)


bpy.app.handlers.render_pre.append(pre)
bpy.app.handlers.render_post.append(post)

t0 = time.perf_counter()
bpy.ops.render.render(animation=True)
wall = time.perf_counter() - t0

r = scene.render
secs = [t["seconds"] for t in times]
mean = sum(secs) / len(secs)
fps = r.fps / r.fps_base
prefs = bpy.context.preferences.addons["cycles"].preferences
report = {
    "machine": platform.platform(),
    "device": [d.name for d in prefs.devices if d.use] or ["CPU"],
    "engine": r.engine,
    "resolution": [r.resolution_x * r.resolution_percentage // 100, r.resolution_y * r.resolution_percentage // 100],
    "samples": scene.cycles.samples,
    "fps": fps,
    "frames": len(secs),
    "video_seconds": round(len(secs) / fps, 2),
    "wall_seconds": round(wall, 1),
    "frame_seconds": {"mean": round(mean, 2), "min": min(secs), "max": max(secs)},
    "per_frame": times,
}
estimates = {f"{s}s": round(mean * s * fps / 60, 1) for s in (10, 30, 60)}
report["estimated_minutes_at_this_quality"] = estimates
with open(os.path.join(out, "timing.json"), "w") as f:
    json.dump(report, f, indent=2)
lines = [
    f"{report['frames']} frames ({report['video_seconds']} s at {fps:g} fps), "
    f"{report['resolution'][0]}x{report['resolution'][1]}, {report['samples']} samples, {', '.join(report['device'])}",
    f"wall time {wall / 60:.1f} min; per frame mean {mean:.1f} s (min {min(secs):.1f}, max {max(secs):.1f})",
    "a longer video at this quality: " + ", ".join(f"{k} → {v} min" for k, v in estimates.items()),
]
with open(os.path.join(out, "timing.txt"), "w") as f:
    f.write("\n".join(lines) + "\n")
print("\n".join("[timer] " + l for l in lines), flush=True)
