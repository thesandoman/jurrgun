# jurrgun-scenes.py: three Bangkok ad scenes for the Jurrgun brand kit, built from code (no downloads).
# Each saves a .blend with one flat design face named "AdFace", a camera, lights and real-world sizes,
# ready for SV Blender's own-.blend route:
#   make-scenes-blender.py -- --blend <scene>.blend --face AdFace [--kind emissive] --out <dir>
# Run:  Blender -b --factory-startup --python jurrgun-scenes.py -- --scene mrt|highway-morning|highway-night|bus-shelter --out <file.blend>
import sys
import math
import random
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d

SCENE = arg("--scene", "mrt")
OUT = arg("--out")
random.seed(7)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.render.resolution_x, sc.render.resolution_y = 1920, 1080
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
sc.cycles.samples = 96

def mat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit is not None:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = emit_strength
    if transmission:
        p.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
    return m

def hexc(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def box(name, size, loc, m, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    return o

def cyl(name, r, h, loc, m, verts=24):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o

def face(w, h, loc, rot):
    """The design face: a flat plane facing the camera, w x h metres, named AdFace."""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = "AdFace"
    o.scale = (w, h, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat("ad_neutral", (0.55, 0.55, 0.55), rough=0.5))
    return o

def area(name, loc, rot, size, energy, color=(1, 0.9, 0.8), shape="RECTANGLE", size_y=None):
    d = bpy.data.lights.new(name, "AREA")
    d.energy, d.color, d.shape, d.size = energy, color, shape, size
    if size_y:
        d.size_y = size_y
    o = bpy.data.objects.new(name, d)
    o.location, o.rotation_euler = loc, rot
    sc.collection.objects.link(o)
    return o

def point(name, loc, energy, color=(1, 0.8, 0.6), radius=0.2):
    d = bpy.data.lights.new(name, "POINT")
    d.energy, d.color, d.shadow_soft_size = energy, color, radius
    o = bpy.data.objects.new(name, d)
    o.location = loc
    sc.collection.objects.link(o)
    return o

def camera(loc, look_at, lens=35):
    d = bpy.data.cameras.new("Camera")
    d.lens = lens
    o = bpy.data.objects.new("Camera", d)
    o.location = loc
    sc.collection.objects.link(o)
    direction = Vector(look_at) - Vector(loc)
    o.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    sc.camera = o
    return o

def sky(elev_deg, rot_deg, strength, dust=1.0):
    w = bpy.data.worlds.new("JG_sky")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    s = nt.nodes.new("ShaderNodeTexSky")
    try:
        s.sky_type = "MULTIPLE_SCATTERING"
    except TypeError:
        s.sky_type = "NISHITA"
    s.sun_elevation = math.radians(elev_deg)
    s.sun_rotation = math.radians(rot_deg)
    if hasattr(s, "dust_density"):
        s.dust_density = dust
    nt.links.new(s.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = strength
    return s

def dark_world(c=(0.004, 0.006, 0.012), strength=1.0):
    w = bpy.data.worlds.new("JG_dark")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (*c, 1)
    w.node_tree.nodes["Background"].inputs["Strength"].default_value = strength

# ------------------------------------------------------------------ MRT platform
def build_mrt():
    dark_world((0.01, 0.01, 0.012), 0.3)
    floor = mat("granite", (0.42, 0.42, 0.40), rough=0.25)
    wall = mat("wall_tile", (0.80, 0.80, 0.78), rough=0.35)
    blue = mat("mrt_blue", hexc("#1f3f94"), rough=0.4)
    steel = mat("steel", (0.55, 0.56, 0.58), rough=0.3, metal=1.0)
    glass = mat("psd_glass", (0.85, 0.9, 0.92), rough=0.05, transmission=0.9)
    led = mat("ceiling_led", (1, 1, 1), emit=(1, 0.97, 0.92), emit_strength=6)
    yellow = mat("edge_yellow", hexc("#f2c200"), rough=0.5)
    box_frame = mat("lightbox_frame", (0.12, 0.12, 0.13), rough=0.4, metal=0.6)
    L = 60.0
    box("floor", (L, 9, 0.2), (0, 0, -0.1), floor)
    box("ceiling", (L, 9, 0.2), (0, 0, 4.1), mat("ceiling", (0.25, 0.25, 0.26), rough=0.7))
    box("back_wall", (L, 0.2, 4.2), (0, 4.5, 2.0), wall)
    box("wall_band", (L, 0.22, 0.25), (0, 4.45, 3.2), blue)
    box("edge_line", (L, 0.25, 0.01), (0, -2.6, 0.005), yellow)
    # platform screen doors: frames and glass along y = -3.2
    for i in range(-14, 15):
        x = i * 2.1
        box(f"psd_post_{i}", (0.08, 0.12, 2.3), (x, -3.2, 1.15), steel)
        box(f"psd_glass_{i}", (1.95, 0.02, 2.0), (x + 1.05, -3.2, 1.05), glass)
    box("psd_header", (L, 0.25, 0.4), (0, -3.2, 2.5), blue)
    # pillars with the blue band
    for i, x in enumerate((-18, -9, 0, 9, 18)):
        box(f"pillar_{i}", (0.9, 0.9, 4.0), (x, 1.2, 2.0), wall)
        box(f"pillar_band_{i}", (0.92, 0.92, 0.3), (x, 1.2, 2.6), blue)
    # LED ceiling strips
    for i in range(-12, 13):
        box(f"led_{i}", (3.2, 0.12, 0.04), (i * 4.2, 1.0, 4.0), led)
        box(f"led_b_{i}", (3.2, 0.12, 0.04), (i * 4.2, -1.8, 4.0), led)
    # the ad lightbox on the back wall, eye level: 3.0 x 1.5 m
    box("lightbox_case", (3.25, 0.16, 1.75), (2.0, 4.36, 1.65), box_frame)
    face(3.0, 1.5, (2.0, 4.27, 1.65), (math.radians(90), 0, math.radians(180)))
    # neighbouring lightboxes, lit, plain
    for j, x in enumerate((-6.0, 10.0)):
        box(f"other_case_{j}", (3.25, 0.16, 1.75), (x, 4.36, 1.65), box_frame)
        box(f"other_glow_{j}", (3.0, 0.02, 1.5), (x, 4.27, 1.65), mat(f"other_ad_{j}", (0.9, 0.9, 0.9), emit=(0.95, 0.9, 0.8) if j else (0.7, 0.85, 1.0), emit_strength=3))
    # fill
    area("fill_platform", (2, 0, 3.9), (0, 0, 0), 20, 260, (1, 0.97, 0.92), size_y=6)
    camera((-6.5, -2.2, 1.62), (4.0, 3.2, 1.6), lens=28)
    sc.view_settings.exposure = -0.8

# ------------------------------------------------------------------ Plan B style highway unipole
def build_highway(night):
    if night:
        sky(-14, 200, 0.6)
    else:
        sky(16, 235, 0.3, dust=3.0)
    road = mat("asphalt", (0.05, 0.05, 0.055), rough=0.55)
    concrete = mat("concrete", (0.55, 0.54, 0.51), rough=0.8)
    steel = mat("unipole_steel", (0.32, 0.33, 0.35), rough=0.45, metal=0.9)
    rail = mat("guardrail", (0.7, 0.72, 0.74), rough=0.35, metal=1.0)
    white = mat("lane_white", (0.85, 0.85, 0.85), rough=0.6)
    ground = mat("ground", (0.12, 0.13, 0.10), rough=0.9)
    box("ground", (2000, 2000, 0.2), (0, 0, -9.1), ground)
    # elevated expressway along x, deck at z 0
    box("deck", (1200, 16, 0.6), (0, 0, -0.3), road)
    box("deck_side_n", (1200, 0.4, 1.0), (0, 8.2, 0.2), concrete)
    box("deck_side_s", (1200, 0.4, 1.0), (0, -8.2, 0.2), concrete)
    for i in range(-30, 31):
        box(f"pier_{i}", (2.2, 3.5, 9.0), (i * 40.0, 0, -4.8), concrete)
    for y in (-2.7, 2.7):
        for i in range(-200, 200):
            box(f"lane_{y}_{i}", (3.0, 0.15, 0.01), (i * 6.0, y, 0.01), white)
    box("rail_n", (1200, 0.1, 0.35), (0, 7.9, 0.85), rail)
    # the unipole: column off the road edge, a 24 x 8 m double frame on top
    cyl("unipole", 1.2, 30.0, (60.0, 26.0, 6.0), steel, 32)
    box("billboard_frame", (25.0, 1.6, 9.0), (60.0, 26.0, 25.5), mat("frame", (0.18, 0.19, 0.2), rough=0.5, metal=0.7))
    box("catwalk", (25.0, 1.4, 0.15), (60.0, 24.8, 20.8), steel)
    face(24.0, 8.0, (60.0, 25.15, 25.5), (math.radians(90), 0, math.radians(0)))
    # skyline
    for i in range(70):
        h = random.uniform(30, 160)
        x = random.uniform(-500, 700)
        y = random.uniform(140, 520)
        b = box(f"tower_{i}", (random.uniform(18, 45), random.uniform(18, 45), h), (x, y, -9 + h / 2),
                mat(f"tower_m_{i % 6}", (0.10 + 0.03 * (i % 4), 0.11, 0.13) if not night else (0.025, 0.028, 0.035), rough=0.35, metal=0.4,
                    emit=(1.0, 0.8, 0.55) if night else None, emit_strength=0.025 if night else 0))
    # cars: head and tail light streaks at night, simple boxes by day
    for i in range(40):
        x = random.uniform(-200, 400)
        if abs(x - 22.0) < 40:
            x += 90
        y = random.choice((-5.4, -1.8, 1.8, 5.4))
        if night:
            col = (1.0, 0.08, 0.04) if y > 0 else (1.0, 0.92, 0.75)
            box(f"trail_{i}", (random.uniform(25, 60), 0.15, 0.08), (x, y + random.uniform(-0.6, 0.6), 0.7),
                mat(f"trail_m_{y > 0}", col, emit=col, emit_strength=40))
        else:
            box(f"car_{i}", (4.5, 1.8, 1.4), (x, y, 0.8), mat(f"car_m_{i % 5}", [(0.8, 0.8, 0.82), (0.1, 0.1, 0.12), (0.6, 0.05, 0.05), (0.15, 0.25, 0.5), (0.9, 0.9, 0.85)][i % 5], rough=0.25, metal=0.6))
    if night:
        for k, dx in enumerate((-9.0, 0.0, 9.0)):
            area(f"flood_{k}", (60.0 + dx, 22.0, 20.6), (math.radians(-60), 0, 0), 0.6, 2600, (1, 0.93, 0.82))
        for i in range(-10, 11):
            point(f"street_{i}", (i * 30.0, 7.6, 9.0), 1800, (1, 0.62, 0.32), 0.3)
    else:
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy, sun.color, sun.angle = 2.4, (1, 0.92, 0.8), math.radians(1.5)
        so = bpy.data.objects.new("sun", sun)
        so.rotation_euler = (math.radians(74), 0, math.radians(235))
        sc.collection.objects.link(so)
    camera((22.0, -7.0, 1.5), (60.0, 26.0, 19.0), lens=30)
    sc.view_settings.exposure = 0.3 if night else -0.6

# ------------------------------------------------------------------ Bangkok bus shelter, night
def build_bus_shelter(morning=False):
    if morning:
        sky(18, 150, 0.2, dust=3.0)
    else:
        sky(-10, 210, 0.7)
    pave = mat("pavement", (0.30, 0.29, 0.27), rough=0.7)
    road = mat("asphalt_wet", (0.04, 0.04, 0.045), rough=0.18)
    steel = mat("shelter_steel", (0.22, 0.24, 0.26), rough=0.4, metal=0.8)
    roof = mat("shelter_roof", (0.75, 0.8, 0.82), rough=0.3, transmission=0.5)
    blue = mat("bma_blue", hexc("#1d5fa8"), rough=0.4)
    box("pavement", (60, 6, 0.18), (0, 2.0, 0.09), pave)
    box("ground_back", (200, 120, 0.1), (0, 65, 0.0), pave)
    for i in range(12):
        hgt = random.uniform(9, 14)
        box(f"shophouse_{i}", (4.2, 8, hgt), (-24 + i * 4.3, 12.0, hgt / 2), mat(f"sh_wall_{i % 3}", [(0.82, 0.78, 0.7), (0.74, 0.76, 0.72), (0.86, 0.82, 0.74)][i % 3], rough=0.8))
        box(f"shutter_{i}", (3.6, 0.1, 2.8), (-24 + i * 4.3, 7.95, 1.4), mat("shutter", (0.45, 0.47, 0.48), rough=0.5, metal=0.6))
    box("kerb", (60, 0.25, 0.2), (0, -1.1, 0.1), mat("kerb_rw", (0.85, 0.85, 0.85), rough=0.5))
    box("road", (80, 30, 0.1), (0, -16, -0.05), road)
    for x in (-2.4, 2.4):
        box(f"post_{x}", (0.12, 0.12, 2.7), (x, 3.6, 1.53), steel)
    box("roof", (5.6, 2.2, 0.08), (0, 2.8, 2.9), roof)
    box("roof_band", (5.6, 0.1, 0.3), (0, 1.75, 2.85), blue)
    box("bench", (3.2, 0.45, 0.06), (0.5, 3.4, 0.6), steel)
    box("back_panel", (3.4, 0.03, 1.6), (0.7, 3.95, 1.25), mat("back_glass", (0.8, 0.85, 0.9), rough=0.05, transmission=0.85))
    # the portrait lightbox at the left end, facing the street: 1.2 x 1.7 m (A1 shape)
    box("lightbox_case", (1.38, 0.2, 1.9), (-1.9, 2.7, 1.3), steel)
    face(1.2, 1.7, (-1.9, 2.59, 1.3), (math.radians(90), 0, 0))
    # streetlight and trees
    cyl("lamp_pole", 0.08, 8.0, (5.5, 0.2, 4.1), steel)
    point("streetlamp", (5.5, -0.6, 8.0), 1500, (1, 0.62, 0.32), 0.4)
    for i, x in enumerate((-8.0, 9.5)):
        cyl(f"trunk_{i}", 0.18, 4.0, (x, 2.5, 2.1), mat("bark", (0.12, 0.09, 0.07), rough=0.9))
        bpy.ops.mesh.primitive_ico_sphere_add(radius=2.4, subdivisions=3, location=(x, 2.5, 5.0))
        t = bpy.context.object; t.name = f"canopy_{i}"; t.data.materials.append(mat("leaves", (0.05, 0.12, 0.04), rough=0.9))
    # passing traffic light trails and shop glow across the road
    for i in range(0 if morning else 14):
        col = (1.0, 0.1, 0.05) if i % 2 else (1.0, 0.9, 0.7)
        box(f"trail_{i}", (random.uniform(6, 14), 0.08, 0.06), (random.uniform(-25, 25), random.choice((-5.0, -8.5, -12.0)), 0.75), mat(f"bt_{i % 2}", col, emit=col, emit_strength=12))
    if morning:
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy, sun.color, sun.angle = 2.6, (1, 0.93, 0.82), math.radians(1.5)
        so = bpy.data.objects.new("sun", sun)
        so.rotation_euler = (math.radians(68), 0, math.radians(-35))
        sc.collection.objects.link(so)
    else:
        area("shelter_light", (0, 2.8, 2.82), (0, 0, 0), 4.5, 120, (0.85, 0.95, 1.0), size_y=1.6)
    camera((3.6, -5.2, 1.45), (-1.6, 2.6, 1.3), lens=32)
    sc.view_settings.exposure = -0.9 if morning else 0.6

{"mrt": build_mrt, "highway-morning": lambda: build_highway(False), "highway-night": lambda: build_highway(True),
 "bus-shelter": build_bus_shelter, "bus-shelter-morning": lambda: build_bus_shelter(True)}[SCENE]()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("JG_SCENE saved", SCENE, OUT)
