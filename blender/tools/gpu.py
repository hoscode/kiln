"""Turn on GPU rendering for a headless Blender run:
    blender -b scene.blend -P blender/tools/gpu.py -a
(device choice lives in user preferences, which -b runs don't carry over)."""
import bpy

prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
    try:
        prefs.compute_device_type = kind
    except TypeError:
        continue
    prefs.get_devices()
    if any(d.type != "CPU" for d in prefs.devices):
        for d in prefs.devices:
            d.use = d.type != "CPU"
        for scene in bpy.data.scenes:
            scene.cycles.device = "GPU"
        print("GPU rendering on", kind, [d.name for d in prefs.devices if d.use])
        break
