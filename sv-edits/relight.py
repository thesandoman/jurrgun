# relight.py: make a morning or a night copy of a scene saved by SV Blender (make-scenes-blender.py).
# The pinned SV script is never edited; this opens its saved <scene>.blend, changes only the light,
# and saves a new .blend that SV Blender's own-.blend route (--blend --face) then renders with the passes.
#   Blender -b --factory-startup --python relight.py -- --in scene.blend --mode morning|night --out scene-morning.blend [--inspect]
import sys
import math
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(name, default=None):
    return argv[argv.index(name) + 1] if name in argv else default

src, mode, out = arg("--in"), arg("--mode", "morning"), arg("--out")
bpy.ops.wm.open_mainfile(filepath=src)
scene = bpy.context.scene
world = scene.world

def nodes_of(tree, kind):
    return [n for n in tree.nodes if n.type == kind] if tree else []

if "--inspect" in argv:
    print("SV_RELIGHT world", world.name if world else None)
    if world and world.use_nodes:
        for n in world.node_tree.nodes:
            extra = {k: getattr(n, k) for k in ("sky_type", "sun_elevation", "sun_rotation", "sun_intensity", "air_density", "dust_density", "altitude") if hasattr(n, k)}
            print("SV_RELIGHT node", n.type, n.name, extra, [(i.name, getattr(i, "default_value", None)) for i in n.inputs if hasattr(i, "default_value") and not hasattr(i.default_value, "__len__")][:4])
    for o in scene.objects:
        if o.type == "LIGHT":
            print("SV_RELIGHT light", o.name, o.data.type, round(o.data.energy, 2), tuple(round(c, 2) for c in o.data.color))
    print("SV_RELIGHT view", scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure)
    sys.exit(0)

# --- the sky ---
if world and world.use_nodes:
    for sky in nodes_of(world.node_tree, "TEX_SKY"):
        if mode == "morning":
            sky.sun_elevation = math.radians(14)      # low morning sun
            sky.sun_rotation = math.radians(70)       # from the east, raking across the scene
            if hasattr(sky, "air_density"): sky.air_density = 1.2
            if hasattr(sky, "dust_density"): sky.dust_density = 2.0   # a little Bangkok morning haze
        else:
            sky.sun_elevation = math.radians(-12)     # well after sunset: deep blue to black
            if hasattr(sky, "sun_intensity"): sky.sun_intensity = 0.0
    for bg in nodes_of(world.node_tree, "BACKGROUND"):
        s = bg.inputs["Strength"]
        s.default_value = s.default_value * (1.0 if mode == "morning" else 0.08)

# --- the scene's own lights ---
for o in scene.objects:
    if o.type != "LIGHT":
        continue
    d = o.data
    if d.type == "SUN":
        if mode == "morning":
            d.energy = max(d.energy, 3.5)
            d.color = (1.0, 0.93, 0.82)
            o.rotation_euler = (math.radians(76), 0.0, math.radians(70))
        else:
            d.energy = 0.0
    else:
        # practical lamps: barely there in daylight, the main source at night
        d.energy = d.energy * (0.25 if mode == "morning" else 1.8)

# --- emissive signs and screens ---
for m in bpy.data.materials:
    if not (m.use_nodes and m.node_tree):
        continue
    for n in m.node_tree.nodes:
        for key in ("Emission Strength", "Strength"):
            if n.type in ("BSDF_PRINCIPLED", "EMISSION") and key in n.inputs and n.inputs[key].default_value > 0:
                n.inputs[key].default_value *= (0.35 if mode == "morning" else 1.4)

# --- haze: the presets' volume haze is tuned for dusk; daylight needs much less ---
for m in bpy.data.materials:
    if not (m.use_nodes and m.node_tree):
        continue
    for n in m.node_tree.nodes:
        if n.type in ("PRINCIPLED_VOLUME", "VOLUME_SCATTER", "VOLUME_ABSORPTION") and "Density" in n.inputs:
            n.inputs["Density"].default_value *= (0.22 if mode == "morning" else 1.0)

# --- exposure ---
scene.view_settings.exposure = scene.view_settings.exposure + (-0.5 if mode == "morning" else 0.6)

bpy.ops.wm.save_as_mainfile(filepath=out, copy=True)
print("SV_RELIGHT saved", mode, out)
