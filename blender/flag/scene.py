"""A flag in sunlight, for look-developing a realistic fabric.

Run inside Blender (UI or `blender -b -P`):

    import sys; sys.path.insert(0, "<repo>/blender/flag")
    import scene; scene.build(flag="es")      # whole scene
    scene.set_flag("fr")                      # swap the artwork only

Flag artwork comes from blender/flag/flags/<code>.png, exported from the
kiln flag list by `npx tsx scripts/export-flags.ts`. The cloth is held in a
cloth simulation blown by gusty, turbulent wind. Render settings are video-
ready (fixed fps and frame range), so the same scene can go to a sequence.
"""

import math
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
FLAGS = os.path.join(HERE, "flags")
COLLECTION = "Flag"

# One tile of the weave texture: vertical yarns (columns) and horizontal
# yarns (rows) it holds, and its size in pixels. Columns are fewer, thicker
# and flatter, packed edge to edge; rows finer and closer: each yarn segment
# on the surface is then a rectangle lying along the flag's length, like the
# flag itself.
WEAVE_COLS = 24
WEAVE_ROWS = 56
WEAVE_SIZE = 1024

DEFAULTS = dict(
    flag="es",
    width=1.5,              # metres, hoist to fly
    # Yarn counts, exaggerated ~3x coarser than real flag polyester
    # (about 11 x 18 per cm) so the weave reads at a distance.
    cols_per_cm=4,          # vertical yarns: fewer, thicker, flatter
    rows_per_cm=9.5,        # horizontal yarns: finer, packed closer
    fuzz=1.0,               # loose fibres: haze around yarns, strays across them
    uneven=1.0,             # cloudiness of the cloth (density, dye uptake)
    cloth_res=160,          # simulation cells along the flag's width
    cloth_mass=1000.0,      # whole flag, in the simulation's units (too light
                            # and the solver jitters the cloth into crumples)
    gravity=0.2,            # gravity on the cloth (light flag fabric: below 1)
    wind=4.0,               # strength of the steady wind
    air_damping=6.0,        # air resistance: calms the flapping, flies flatter
    turbulence=0.8,         # strength of the gusts and eddies on top of it
    preroll=48,             # frames simulated before the recorded ones, so
                            # the clip starts mid-motion
    sun_elevation=30.0,     # degrees above the horizon
    sun_azimuth=-60.0,      # degrees; 0 = sun behind the camera, 180 = behind the flag
    translucency=0.45,      # share of light that passes through the cloth
    exposure=-0.6,          # stops
    samples=256,
    fps=30,
    frames=180,
)


# ---- Entry points ---------------------------------------------------------

def build(**opts):
    """(Re)build the scene. Unknown options raise, so typos don't pass silently."""
    o = dict(DEFAULTS)
    for k, v in opts.items():
        if k not in o:
            raise KeyError(f"unknown option {k!r}; known: {sorted(o)}")
        o[k] = v

    scene = bpy.context.scene
    clear()
    coll = bpy.data.collections.new(COLLECTION)
    scene.collection.children.link(coll)

    setup_render(scene, o)
    setup_world(scene, o)

    image = load_flag(o["flag"])
    aspect = image.size[0] / image.size[1]
    height = o["width"] / aspect
    flag = make_flag(coll, o["width"], height, o["cloth_res"])
    flag.data.materials.append(fabric_material(image, o))
    make_cameras(coll, scene, o["width"], height)
    make_wind(coll, scene, flag, o)
    scene["kiln_flag"] = o  # remembered for set_flag and later steps
    return flag


def set_flag(code):
    """Swap the flag artwork, keeping everything else."""
    mat = bpy.data.materials.get("Flag Fabric")
    if mat is None:
        raise RuntimeError("build() the scene first")
    node = next(n for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.label == "Flag")
    node.image = load_flag(code)
    # The flag's proportions follow the artwork.
    flag = bpy.data.objects["Flag"]
    w = bpy.context.scene["kiln_flag"]["width"]
    aspect = node.image.size[0] / node.image.size[1]
    flag.scale.z = (w / aspect) / flag["rest_height"]


def clear():
    """Remove everything build() made, so it can run again."""
    coll = bpy.data.collections.get(COLLECTION)
    if coll:
        for ob in list(coll.objects):
            data = ob.data
            bpy.data.objects.remove(ob)
            if data is not None and data.users == 0:
                (bpy.data.meshes if isinstance(data, bpy.types.Mesh) else bpy.data.cameras
                 if isinstance(data, bpy.types.Camera) else bpy.data.lights).remove(data)
        bpy.data.collections.remove(coll)
    for name in ("Flag Fabric",):
        if name in bpy.data.materials:
            bpy.data.materials.remove(bpy.data.materials[name])
    # The default startup scene's objects.
    for name in ("Cube", "Light", "Camera"):
        ob = bpy.data.objects.get(name)
        if ob and not ob.get("kiln"):
            bpy.data.objects.remove(ob)


# ---- Render ---------------------------------------------------------------

def setup_render(scene, o):
    try:
        scene.render.engine = "CYCLES"
    except TypeError as e:
        raise RuntimeError(f"Cycles not available: {e}")
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = kind
        except TypeError:
            continue
        prefs.get_devices()
        gpus = [d for d in prefs.devices if d.type != "CPU"]
        if gpus:
            for d in prefs.devices:
                d.use = d.type != "CPU"
            scene.cycles.device = "GPU"
            break

    c = scene.cycles
    c.samples = o["samples"]
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.01
    c.use_denoising = True
    c.max_bounces = 8
    c.transmission_bounces = 8
    c.diffuse_bounces = 4

    r = scene.render
    r.resolution_x, r.resolution_y = 1920, 1080
    r.resolution_percentage = 100
    r.fps = o["fps"]
    scene.frame_start, scene.frame_end = 1, o["frames"]
    r.film_transparent = False

    vs = scene.view_settings
    for view in ("AgX", "Filmic"):
        try:
            vs.view_transform = view
            break
        except TypeError:
            pass
    vs.exposure = o["exposure"]
    try:
        vs.look = "AgX - Medium High Contrast"
    except TypeError:
        pass


def setup_world(scene, o):
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = True
    sky.sun_elevation = math.radians(o["sun_elevation"])
    # The sky's rotation 0 puts the sun at +Y, ahead of the camera (which looks
    # along +Y). Our azimuth 0 is the sun behind the camera, positive to the right.
    sky.sun_rotation = math.radians(180.0 - o["sun_azimuth"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 0.08  # physical sky → film-friendly range
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])


# ---- Flag -----------------------------------------------------------------

def load_flag(code):
    path = os.path.join(FLAGS, f"{code}.png")
    if not os.path.exists(path):
        have = sorted(f[:-4] for f in os.listdir(FLAGS) if f.endswith(".png"))
        raise FileNotFoundError(f"no artwork for {code!r} (have {have}); run scripts/export-flags.ts")
    name = f"flag-{code}"
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(path)
        img.name = name
    else:
        img.reload()  # pick up a fresh export
    return img


def make_flag(coll, width, height, res=160):
    """A flat sheet in the XZ plane, hoist at x = 0, with a "Hoist" vertex
    group pinning the pole-side edge for the cloth simulation."""
    nu, nv = res, max(2, round(res * height / width))
    u = np.linspace(0.0, 1.0, nu + 1)
    v = np.linspace(0.0, 1.0, nv + 1)
    U, V = np.meshgrid(u, v)                     # (nv+1, nu+1)
    X = U * width
    Z = V * height
    Y = np.zeros_like(U)

    verts = np.stack([X, Y, Z], axis=-1).reshape(-1, 3)
    idx = np.arange((nu + 1) * (nv + 1)).reshape(nv + 1, nu + 1)
    quads = np.stack([idx[:-1, :-1], idx[:-1, 1:], idx[1:, 1:], idx[1:, :-1]], axis=-1).reshape(-1, 4)

    mesh = bpy.data.meshes.new("Flag")
    mesh.vertices.add(len(verts))
    mesh.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set("vertex_index", quads.astype(np.int32).ravel())
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
    mesh.polygons.foreach_set("loop_total", np.full(len(quads), 4, dtype=np.int32))
    uv = mesh.uv_layers.new(name="UVMap")
    uvs = np.stack([U, V], axis=-1).reshape(-1, 2)[quads.ravel()]
    uv.data.foreach_set("uv", uvs.astype(np.float32).ravel())
    mesh.update()
    mesh.validate()
    mesh.shade_smooth()

    ob = bpy.data.objects.new("Flag", mesh)
    ob["kiln"] = True
    ob["rest_height"] = height
    ob.location = (-0.485 * width, 0.0, -height / 2)  # centred on the origin
    coll.objects.link(ob)
    hoist = ob.vertex_groups.new(name="Hoist")
    hoist.add([int(i) for i in idx[:, 0]], 1.0, "REPLACE")
    return ob


def make_wind(coll, scene, flag, o):
    """Cloth simulation on the flag, blown along +X by a steady wind with
    turbulence on top, so the motion never settles into a repeating pattern.
    The simulation starts `preroll` frames before the recorded range."""
    first = scene.frame_start
    scene.frame_start = first + o["preroll"]
    scene.frame_end = first + o["preroll"] + o["frames"] - 1

    cloth = flag.modifiers.new("Cloth", "CLOTH")
    c = cloth.settings
    c.quality = 10
    c.mass = o["cloth_mass"] / len(flag.data.vertices)  # per vertex, from the whole flag's
    c.air_damping = o["air_damping"]
    c.tension_stiffness = 15.0
    c.compression_stiffness = 15.0
    c.shear_stiffness = 5.0
    c.bending_stiffness = 0.5        # large smooth folds, not crumples
    c.vertex_group_mass = "Hoist"    # pinned edge
    c.effector_weights.gravity = o["gravity"]
    cache = cloth.point_cache
    cache.frame_start = first
    cache.frame_end = scene.frame_end
    sub = flag.modifiers.new("Smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 2

    def field(name, kind, rotation, **settings):
        # Force fields only attach through the operator.
        bpy.ops.object.effector_add(type=kind, location=(-1.5, 0.0, 0.0), rotation=rotation)
        ob = bpy.context.active_object
        ob.name = name
        ob["kiln"] = True
        for c in list(ob.users_collection):
            c.objects.unlink(ob)
        coll.objects.link(ob)
        for k, v in settings.items():
            setattr(ob.field, k, v)
        return ob

    # Wind blows along the empty's local +Z: turned to point along +X, and
    # 15 degrees into the cloth (wind only pushes on cloth facing it).
    field("Wind", "WIND", (0.0, math.pi / 2, math.radians(15)), strength=30000.0 * o["wind"] * o["cloth_mass"] / 1000.0, flow=0.0, noise=0.0)
    field("Turbulence", "TURBULENCE", (0.0, 0.0, 0.0),
          strength=4000.0 * o["turbulence"] * o["cloth_mass"] / 1000.0, size=1.0, noise=0.0, flow=0.5)
    scene.frame_set(first)


def fabric_material(image, o):
    """Printed polyester: the flag dyed into a plain weave of threads, with
    cloth sheen and light passing through the thin sheet."""
    mat = bpy.data.materials.new("Flag Fabric")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    L = nt.links.new

    out = N("ShaderNodeOutputMaterial")
    bsdf = N("ShaderNodeBsdfPrincipled")
    # Thin cloth: light reflects off the threads and also passes through,
    # coloured by the dye (the Translucent half).
    through = N("ShaderNodeBsdfTranslucent")
    mix = N("ShaderNodeMixShader")
    mix.label = "Translucency"
    mix.inputs["Fac"].default_value = o["translucency"]
    L(bsdf.outputs["BSDF"], mix.inputs[1])
    L(through.outputs["BSDF"], mix.inputs[2])
    L(mix.outputs["Shader"], out.inputs["Surface"])

    uv = N("ShaderNodeTexCoord")
    # Flag artwork, from UVs.
    art = N("ShaderNodeTexImage")
    art.label = "Flag"
    art.image = image
    art.interpolation = "Cubic"
    art.extension = "EXTEND"
    L(uv.outputs["UV"], art.inputs["Vector"])

    # Weave, tiled at the real yarn counts.
    width_cm = o["width"] * 100
    aspect = image.size[0] / image.size[1]
    tiles_u = width_cm * o["cols_per_cm"] / WEAVE_COLS
    tiles_v = width_cm / aspect * o["rows_per_cm"] / WEAVE_ROWS
    mapping = N("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (tiles_u, tiles_v, 1.0)
    L(uv.outputs["UV"], mapping.inputs["Vector"])
    normal_img, data_img = weave_images(o["fuzz"])
    wn = N("ShaderNodeTexImage")
    wn.label = "Weave Normal"
    wn.image = normal_img
    wn.interpolation = "Cubic"
    wd = N("ShaderNodeTexImage")
    wd.label = "Weave Data"
    wd.image = data_img
    wd.interpolation = "Cubic"
    for t in (wn, wd):
        L(mapping.outputs["Vector"], t.inputs["Vector"])
    nmap = N("ShaderNodeNormalMap")
    nmap.uv_map = "UVMap"
    nmap.inputs["Strength"].default_value = 1.0
    L(wn.outputs["Color"], nmap.inputs["Color"])

    # Unevenness: soft clouds of slightly denser or thinner cloth, a few
    # centimetres across, in both colour and surface.
    cloud_map = N("ShaderNodeMapping")
    cloud_map.inputs["Scale"].default_value = (1.0, 1.0 / aspect, 1.0)
    L(uv.outputs["UV"], cloud_map.inputs["Vector"])
    cloud = N("ShaderNodeTexNoise")
    cloud.label = "Unevenness"
    cloud.inputs["Scale"].default_value = 45.0
    cloud.inputs["Detail"].default_value = 8.0
    cloud.inputs["Roughness"].default_value = 0.6
    L(cloud_map.outputs["Vector"], cloud.inputs["Vector"])
    bump = N("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06 * o["uneven"]
    bump.inputs["Distance"].default_value = 0.002
    L(cloud.outputs["Fac"], bump.inputs["Height"])
    L(nmap.outputs["Normal"], bump.inputs["Normal"])
    L(bump.outputs["Normal"], bsdf.inputs["Normal"])
    cloud_tone = N("ShaderNodeMapRange")  # 0..1 → ±5 % brightness
    cloud_tone.inputs["To Min"].default_value = 1.0 - 0.05 * o["uneven"]
    cloud_tone.inputs["To Max"].default_value = 1.0 + 0.05 * o["uneven"]
    L(cloud.outputs["Fac"], cloud_tone.inputs["Value"])

    # Colour: artwork × thread tone × a little shade between threads.
    sep = N("ShaderNodeSeparateColor")
    L(wd.outputs["Color"], sep.inputs["Color"])
    shade = N("ShaderNodeMapRange")       # height 0..1 → 0.82..1
    shade.inputs["To Min"].default_value = 0.82
    L(sep.outputs["Red"], shade.inputs["Value"])
    tone = N("ShaderNodeMapRange")        # tone 0..1 → 0.9..1.1
    tone.inputs["To Min"].default_value = 0.9
    tone.inputs["To Max"].default_value = 1.1
    L(sep.outputs["Green"], tone.inputs["Value"])
    mul = N("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    L(shade.outputs["Result"], mul.inputs[0])
    L(tone.outputs["Result"], mul.inputs[1])
    mul2 = N("ShaderNodeMath")
    mul2.operation = "MULTIPLY"
    L(mul.outputs["Value"], mul2.inputs[0])
    L(cloud_tone.outputs["Result"], mul2.inputs[1])
    mul = mul2
    col = N("ShaderNodeMix")
    col.data_type = "RGBA"
    col.blend_type = "MULTIPLY"
    col.inputs["Factor"].default_value = 1.0
    L(art.outputs["Color"], col.inputs["A"])
    L(mul.outputs["Value"], col.inputs["B"])
    L(col.outputs["Result"], bsdf.inputs["Base Color"])
    # Light through dyed cloth is the dye colour, deepened (passing through
    # more pigment than a reflection does), and lifted where threads part.
    deep = N("ShaderNodeMix")
    deep.data_type = "RGBA"
    deep.blend_type = "MULTIPLY"
    deep.inputs["Factor"].default_value = 0.35
    L(col.outputs["Result"], deep.inputs["A"])
    L(col.outputs["Result"], deep.inputs["B"])
    L(deep.outputs["Result"], through.inputs["Color"])
    L(bump.outputs["Normal"], through.inputs["Normal"])

    # Fabric response.
    bsdf.inputs["Roughness"].default_value = 0.7
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    # Sheen is Blender's model of fibre fuzz: soft light skimming the surface.
    bsdf.inputs["Sheen Weight"].default_value = min(1.0, 0.7 + 0.3 * o["fuzz"])
    bsdf.inputs["Sheen Roughness"].default_value = 0.5

    tidy(nt)
    return mat


def weave_images(fuzz=1.0):
    """Normal map (RGB) and data (R height, G tone) of a tileable plain weave,
    generated once per fuzz level and packed into the .blend."""
    names = (f"Weave Normal {fuzz:g}", f"Weave Data {fuzz:g}")
    if all(n in bpy.data.images for n in names):
        return tuple(bpy.data.images[n] for n in names)
    height, tone = weave_fields(WEAVE_SIZE, WEAVE_COLS, WEAVE_ROWS, fuzz)
    gy, gx = np.gradient(np.pad(height, 1, mode="wrap"))
    gx, gy = gx[1:-1, 1:-1], gy[1:-1, 1:-1]
    s = 3.0 * WEAVE_SIZE / 512  # height per pixel → slope
    n = np.stack([-gx * s, -gy * s, np.ones_like(height)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)

    def image(name, rgb):
        img = bpy.data.images.new(name, WEAVE_SIZE, WEAVE_SIZE, alpha=False)
        img.colorspace_settings.name = "Non-Color"
        px = np.concatenate([rgb, np.ones(rgb.shape[:2] + (1,))], axis=-1)
        img.pixels.foreach_set(px.astype(np.float32).ravel())
        img.pack()
        return img

    normal = image(names[0], n * 0.5 + 0.5)
    data = image(names[1], np.stack([height, tone, np.zeros_like(height)], axis=-1))
    return normal, data


def weave_fields(size, cols, rows, fuzz=1.0, seed=0x5EED):
    """Height (0 in the gaps, 1 atop a crossing) and tone (0.5 average) of a
    plain weave, tiling seamlessly.

    Columns are fewer, thicker, flatter yarns packed nearly edge to edge;
    rows finer, closer, with visible gaps between them. Every yarn segment
    on the surface is a rectangle lying along the flag, and the visible
    seams between rows run along it too. Yarns wander a little in place and
    thickness, with slubs, fibre streaks and twist. Fuzz: a haze of loose
    fibres around each yarn, part-filling the gaps, and stray fibres lying
    across the weave."""
    rng = np.random.default_rng(seed)
    pxc, pxr = size / cols, size / rows          # pixels per column / row
    x = np.arange(size, dtype=float)[None, :] + 0.5
    y = np.arange(size, dtype=float)[:, None] + 0.5
    X, Y = np.broadcast_arrays(x, y)
    gc, gr = X / pxc, Y / pxr                     # column / row coordinates
    ci = np.floor(gc).astype(int) % cols
    ri = np.floor(gr).astype(int) % rows

    def yarns(n, width, spread):
        return dict(offset=(rng.random(n) - 0.5) * spread,
                    width=width + rng.random(n) * 0.12,
                    tone=(rng.random(n) - 0.5) * 2,
                    slub=rng.random((n, 6)) - 0.5)

    col, row = yarns(cols, 0.93, 0.06), yarns(rows, 0.7, 0.2)

    def loop_lerp(table, t):  # smooth periodic interpolation along a yarn
        n = table.shape[-1]
        f = (t % 1.0) * n
        k = np.floor(f).astype(int)
        e = f - k
        e = e * e * (3 - 2 * e)
        a = np.take_along_axis(table, (k % n)[..., None], -1)[..., 0]
        b = np.take_along_axis(table, ((k + 1) % n)[..., None], -1)[..., 0]
        return a * (1 - e) + b * e

    def noise(cells_x, cells_y):  # value noise tiling over the texture
        g = rng.random((cells_y, cells_x)) * 2 - 1
        def at(px, py):
            fx, fy = px / size * cells_x, py / size * cells_y
            ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
            sx, sy = fx - ix, fy - iy
            sx, sy = sx * sx * (3 - 2 * sx), sy * sy * (3 - 2 * sy)
            i0, i1 = ix % cells_x, (ix + 1) % cells_x
            j0, j1 = iy % cells_y, (iy + 1) % cells_y
            a = g[j0, i0] * (1 - sx) + g[j0, i1] * sx
            b = g[j1, i0] * (1 - sx) + g[j1, i1] * sx
            return a * (1 - sy) + b * sy
        return at

    def profile(s, flat):
        # Filament yarns spread flat where they cross: a squashed ellipse.
        return np.clip(1 - s * s, 0, None) ** flat

    # Over-under: each column rises over alternate rows, and vice versa.
    c_elev = (0.5 + 0.5 * np.cos(np.pi * (gr - 0.5) + np.pi * ci)) ** 0.7
    r_elev = (0.5 - 0.5 * np.cos(np.pi * (gc - 0.5) + np.pi * ri)) ** 0.7
    c_slub = 1 + 0.2 * loop_lerp(col["slub"][ci], Y / size)
    r_slub = 1 + 0.2 * loop_lerp(row["slub"][ri], X / size)
    c_s = (gc - np.floor(gc) - 0.5 - col["offset"][ci]) / (0.5 * col["width"][ci] * c_slub)
    r_s = (gr - np.floor(gr) - 0.5 - row["offset"][ri]) / (0.5 * row["width"][ri] * r_slub)
    c_prof, r_prof = profile(c_s, 0.35), profile(r_s, 0.6)

    # Fibre streaks run along each yarn, and the yarn's filaments show as
    # fine parallel lines down its length (multifilament polyester has
    # little twist).
    streak_c = noise(cols * 6, 12)
    streak_r = noise(12, rows * 6)
    c_fib = streak_c(X, Y + 97.0)
    r_fib = streak_r(X + 31.0, Y)
    c_fil = 0.4 * np.sin(2 * np.pi * c_s * 5.5 + 2.0 * c_fib)  # faint: don't stripe the cloth vertically
    r_fil = np.sin(2 * np.pi * r_s * 4.5 + 2.0 * r_fib)

    hc = np.where(c_prof > 0, (0.25 + 0.75 * c_elev) * (0.45 + 0.55 * c_prof) + 0.03 * c_fib + 0.02 * c_fil * c_prof, 0)
    hr = np.where(r_prof > 0, (0.25 + 0.75 * r_elev) * (0.45 + 0.55 * r_prof) + 0.03 * r_fib + 0.02 * r_fil * r_prof, 0)
    height = np.maximum(hc, hr)
    tone = np.where(hc >= hr, 0.06 * col["tone"][ci] + 0.05 * c_fib, 0.06 * row["tone"][ri] + 0.05 * r_fib)

    # Hairiness: loose fibres hover around every yarn and part-fill the gaps.
    haze = height.copy()
    for _ in range(3):  # cheap wrap-around blur
        haze = (haze + np.roll(haze, 2, 0) + np.roll(haze, -2, 0) + np.roll(haze, 2, 1) + np.roll(haze, -2, 1)) / 5
    patchy = 0.5 + 0.5 * noise(48, 48)(X, Y)
    height = np.maximum(height, min(0.8, 0.55 * fuzz) * haze * patchy)

    # Stray fibres: thin curved strands lying across the weave, catching light.
    stray = np.zeros((size, size))
    n_fibres = int(600 * fuzz)
    for _ in range(n_fibres):
        x0, y0 = rng.random(2) * size
        ang = rng.random() * np.pi * 2
        bend = (rng.random() - 0.5) * 0.08
        length = (0.4 + rng.random() * 1.6) * max(pxc, pxr)
        steps = max(4, int(length))
        t = np.arange(steps)
        a = ang + bend * t
        xs = (x0 + np.cumsum(np.cos(a))) % size
        ys = (y0 + np.cumsum(np.sin(a))) % size
        np.add.at(stray, (ys.astype(int), xs.astype(int)), 1.0)
        if rng.random() < 0.5:  # some fibres are thicker bundles
            np.add.at(stray, (((ys + 1) % size).astype(int), xs.astype(int)), 0.6)
    stray = np.minimum(stray, 1.0)
    stray *= 0.4 + 0.6 * rng.random(stray.shape)  # fibres fade in and out of focus
    height = np.minimum(1.0, height + 0.2 * fuzz * stray)
    tone = tone + 0.06 * fuzz * stray  # loose fibres scatter, reading a touch lighter

    return np.clip(height, 0, 1), np.clip(0.5 + tone * 2.5, 0, 1)


# ---- Cameras -------------------------------------------------------------


def make_cameras(coll, scene, width, height):
    """Wide: the whole flag against the sky. Macro: close on the cloth, to
    judge the fabric."""
    def camera(name, lens, loc, target, dof=None):
        cam = bpy.data.cameras.new(name)
        cam.lens = lens
        if dof:
            cam.dof.use_dof = True
            cam.dof.focus_distance = dof[0]
            cam.dof.aperture_fstop = dof[1]
        ob = bpy.data.objects.new(name, cam)
        ob["kiln"] = True
        ob.location = loc
        d = (target[0] - loc[0], target[1] - loc[1], target[2] - loc[2])
        ob.rotation_euler = (math.atan2(math.hypot(d[0], d[1]), -d[2]), 0.0, math.atan2(d[1], d[0]) - math.pi / 2)
        coll.objects.link(ob)
        return ob

    # From below, looking up a little: sky behind, horizon out of frame.
    wide = camera("Cam Wide", 50, (-0.35 * width, -2.9 * width, -1.1 * height), (0.0, 0.0, 0.0))
    # A few centimetres of cloth, over the coat of arms on Spain's flag.
    macro_target = (-0.15 * width, 0.0, 0.0)
    macro = camera("Cam Macro", 100, (-0.17 * width, -0.15, -0.03), macro_target, dof=(0.15, 11.0))
    focus_on_surface(scene, macro)
    make_dolly(coll, scene, width, height)
    make_emblem_camera(coll, scene, width, height)
    scene.camera = wide


def make_emblem_camera(coll, scene, width, height):
    """The coat of arms and the cloth around it (Spain: a third of the way
    along), sitting on the left third of the frame rather than dead centre.
    The camera doesn't move."""
    from mathutils import Vector
    bpy.context.view_layer.update()
    aim = Vector((-0.485 * width + 0.97 * width / 3, 0.0, 0.0))
    hit, loc, *_ = scene.ray_cast(bpy.context.evaluated_depsgraph_get(), aim + Vector((0, -1.0, 0)), Vector((0, 1.0, 0)))
    focus = bpy.data.objects.new("Emblem Focus", None)
    focus["kiln"] = True
    focus.location = loc if hit else aim
    coll.objects.link(focus)

    cam = bpy.data.cameras.new("Cam Emblem")
    cam.lens = 75
    cam.dof.use_dof = True
    cam.dof.focus_object = focus
    cam.dof.aperture_fstop = 5.6
    ob = bpy.data.objects.new("Cam Emblem", cam)
    ob["kiln"] = True
    coll.objects.link(ob)
    # Aim right of the emblem (a sixth of the ~1.1 m frame) so it sits on
    # the left third; focus stays on the emblem itself.
    look = bpy.data.objects.new("Emblem Aim", None)
    look["kiln"] = True
    # Only cloth in view through the whole clip, the whole emblem inside the
    # frame (checked by ray casts over the baked motion).
    look.location = focus.location + Vector((0.14, 0.0, -0.12))
    coll.objects.link(look)
    track = ob.constraints.new("TRACK_TO")
    track.target = look
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"
    # The emblem, the yellow band and the red bands, seen from a little below
    # (~9 degrees up). Locked off: the flag is the only thing that moves.
    ob.location = look.location + Vector((-0.08, -2.45, -0.4))


def make_dolly(coll, scene, width, height):
    """A slow push-in over the scene's frame range: from most of the flag down
    to a hand's width of cloth, focus held on the surface. The hardest test
    of fine detail in motion (shimmer, flicker, moiré)."""
    from mathutils import Vector
    bpy.context.view_layer.update()
    aim = Vector((-0.15 * width, 0.0, 0.0))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    hit, loc, *_ = scene.ray_cast(depsgraph, aim + Vector((0, -1.0, 0)), Vector((0, 1.0, 0)))
    focus = bpy.data.objects.new("Dolly Focus", None)
    focus["kiln"] = True
    focus.location = loc if hit else aim
    coll.objects.link(focus)

    cam = bpy.data.cameras.new("Cam Dolly")
    cam.lens = 85
    cam.dof.use_dof = True
    cam.dof.focus_object = focus
    cam.dof.aperture_fstop = 8.0
    ob = bpy.data.objects.new("Cam Dolly", cam)
    ob["kiln"] = True
    coll.objects.link(ob)
    track = ob.constraints.new("TRACK_TO")
    track.target = focus
    track.track_axis = "TRACK_NEGATIVE_Z"
    track.up_axis = "UP_Y"

    start, end = scene.frame_start, scene.frame_end
    ob.location = focus.location + Vector((-0.1, -2.2, -0.35))
    ob.keyframe_insert("location", frame=start)
    ob.location = focus.location + Vector((-0.03, -0.22, -0.03))
    ob.keyframe_insert("location", frame=end)  # default Bézier keys ease in and out


def focus_on_surface(scene, cam_ob):
    """Focus exactly where the camera's centre ray meets the cloth."""
    from mathutils import Vector
    bpy.context.view_layer.update()
    origin = cam_ob.matrix_world.translation
    direction = cam_ob.matrix_world.to_quaternion() @ Vector((0.0, 0.0, -1.0))
    hit, loc, *_ = scene.ray_cast(bpy.context.evaluated_depsgraph_get(), origin, direction)
    if hit:
        cam_ob.data.dof.focus_distance = (loc - origin).length


def tidy(nt):
    """Lay nodes out left to right in link order, so the tree is readable."""
    depth = {n: 0 for n in nt.nodes}
    for _ in range(len(nt.nodes)):
        for link in nt.links:
            depth[link.from_node] = max(depth[link.from_node], depth[link.to_node] + 1)
    rows = {}
    for n, d in depth.items():
        n.location = (-d * 260, -rows.get(d, 0) * 220)
        rows[d] = rows.get(d, 0) + 1
