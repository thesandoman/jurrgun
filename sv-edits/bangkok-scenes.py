# bangkok-scenes.py: four Bangkok morning scenes for the Jurrgun brand video (owner, 26 Oct: cards B and C).
# Same build style as jurrgun-scenes.py: code only, no downloads, real-world sizes, morning sun, one flat design
# face named "AdFace" sized to an existing kit design, ready for SV Blender's own-.blend route:
#   make-scenes-blender.py -- --blend <scene>.blend --face AdFace --out <dir>
# Run:  Blender -b --factory-startup --python bangkok-scenes.py -- --scene lumphini|tuktuk|talat-noi|win-stand --out <file.blend>
#
# Design faces (aspect matches the approved design that goes on it):
#   lumphini   park notice board, 0.84 x 1.19 m, A-series portrait -> designs/poster-a1-1414x2000.png
#   tuktuk     tuk-tuk back panel, 1.20 x 0.45 m, 8:3             -> designs/billboard-2400x900.png
#   talat-noi  mural wall in the alley, 6.0 x 2.25 m, 8:3         -> designs/billboard-2400x900.png
#   win-stand  motorbike-taxi stand sign, 2.4 x 0.8 m, 3:1        -> designs/highway-2400x800.png
# House rules kept here: nothing on the palace or temple walls (the palace is an unbranded backdrop); no people
# (the Lumphini table of five is left empty as the slot for the earmarked actors' shot); morning light only.
import sys
import math
import random
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
def arg(n, d=None):
    return argv[argv.index(n) + 1] if n in argv else d

SCENE = arg("--scene", "lumphini")
OUT = arg("--out")
random.seed(11)

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


def mat(name, color, rough=0.6, metal=0.0, emit=None, emit_strength=0.0, transmission=0.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
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
    m.diffuse_color = (*color, 1)
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


def cyl(name, r, h, loc, m, verts=24, rot=(0, 0, 0), r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, vertices=verts, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, location=loc, vertices=verts, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(m)
    return o


def ball(name, r, loc, m, scale=(1, 1, 1), sub=3):
    bpy.ops.mesh.primitive_ico_sphere_add(radius=r, subdivisions=sub, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
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


def camera(loc, look_at, lens=35):
    d = bpy.data.cameras.new("Camera")
    d.lens = lens
    o = bpy.data.objects.new("Camera", d)
    o.location = loc
    sc.collection.objects.link(o)
    o.rotation_euler = (Vector(look_at) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    sc.camera = o
    return o


def morning(elev=16, rot=120, sun_rot_z=-40, sun_energy=2.6, sky_strength=0.25, dust=3.0):
    """Morning in Bangkok: a low sun through a little haze, warm key, cool sky fill."""
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
    s.sun_elevation = math.radians(elev)
    s.sun_rotation = math.radians(rot)
    if hasattr(s, "dust_density"):
        s.dust_density = dust
    nt.links.new(s.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = sky_strength
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy, sun.color, sun.angle = sun_energy, (1, 0.91, 0.78), math.radians(1.5)
    so = bpy.data.objects.new("sun", sun)
    so.rotation_euler = (math.radians(90 - elev), 0, math.radians(sun_rot_z))
    sc.collection.objects.link(so)


def tree(name, x, y, h=6.0, r=2.6, m_leaf=None, m_bark=None):
    m_bark = m_bark or mat("bark", (0.11, 0.08, 0.06), rough=0.9)
    m_leaf = m_leaf or mat("leaves", (0.05, 0.14, 0.04), rough=0.85)
    cyl(name + "_trunk", 0.22, h * 0.6, (x, y, h * 0.3), m_bark, 12, r2=0.15)
    for k in range(3):
        ball(name + "_crown%d" % k, r * random.uniform(0.7, 1.0),
             (x + random.uniform(-1, 1), y + random.uniform(-1, 1), h * 0.75 + random.uniform(-0.4, 0.8)), m_leaf,
             scale=(1, 1, 0.8), sub=2)


def skyline(n, x0, x1, y0, y1, hmin=40, hmax=160):
    for i in range(n):
        h = random.uniform(hmin, hmax)
        box("tower_%d" % i, (random.uniform(18, 40), random.uniform(18, 40), h),
            (random.uniform(x0, x1), random.uniform(y0, y1), h / 2),
            mat("tower_%d" % (i % 5), [(0.62, 0.66, 0.70), (0.55, 0.58, 0.60), (0.70, 0.71, 0.68),
                                       (0.48, 0.55, 0.60), (0.75, 0.74, 0.70)][i % 5], rough=0.35, metal=0.3))


# ------------------------------------------------------------------ 1. Lumphini Park by the lake, morning
def build_lumphini():
    morning(elev=14, rot=110, sun_rot_z=-55)
    grass = mat("grass", (0.10, 0.22, 0.06), rough=0.95)
    path = mat("park_path", (0.55, 0.52, 0.47), rough=0.85)
    water = mat("lake", (0.05, 0.09, 0.08), rough=0.04)
    wood = mat("teak", (0.30, 0.17, 0.08), rough=0.6)
    steel = mat("board_steel", (0.18, 0.22, 0.20), rough=0.5, metal=0.6)
    mat_red = mat("picnic_mat", hexc("#fff9f0"), rough=0.9)   # cream: coral and orange are retired (Branding)
    box("ground", (400, 400, 0.2), (0, 0, -0.1), grass)
    box("lake", (220, 120, 0.05), (0, 75, 0.0), water)
    box("lake_edge", (220, 0.4, 0.25), (0, 15.0, 0.05), mat("kerb_stone", (0.6, 0.58, 0.54), rough=0.7))
    box("path", (60, 2.4, 0.04), (0, 9.5, 0.02), path)
    # the table of five: a low picnic mat, five cushions round a low table, nobody there yet
    box("mat", (3.2, 2.4, 0.02), (1.6, 4.2, 0.01), mat_red)
    box("low_table", (1.2, 0.7, 0.04), (1.6, 4.2, 0.32), wood)
    for k, (dx, dy) in enumerate(((-0.9, -0.6), (0.9, -0.6), (-1.1, 0.5), (1.1, 0.5), (0.0, 0.85))):
        cyl("leg_%d" % k, 0.03, 0.3, (1.6 + dx * 0.5, 4.2 + dy * 0.4, 0.15), wood, 8)
        box("cushion_%d" % k, (0.45, 0.45, 0.1), (1.6 + dx, 4.2 + dy, 0.07),
            mat("cushion_%d" % (k % 3), [hexc("#e9e4d6"), hexc("#2f6f5e"), hexc("#d9a441")][k % 3], rough=0.9))
    for k in range(5):
        cyl("cup_%d" % k, 0.04, 0.1, (1.25 + k * 0.17, 4.1, 0.39), mat("cup", (0.9, 0.9, 0.88), rough=0.3), 16)
    box("basket", (0.4, 0.3, 0.22), (0.2, 3.3, 0.12), mat("rattan", (0.55, 0.38, 0.2), rough=0.8))
    # the park notice board by the path: two posts, a roof, the design face
    for x in (-3.95, -2.85):
        box("post_%.2f" % x, (0.1, 0.1, 2.2), (x, 7.6, 1.1), steel)
    box("board_back", (1.1, 0.06, 1.45), (-3.4, 7.62, 1.45), steel)
    box("board_roof", (1.3, 0.35, 0.05), (-3.4, 7.55, 2.25), steel, rot=(math.radians(-10), 0, 0))
    face(0.84, 1.19, (-3.4, 7.585, 1.45), (math.radians(90), 0, 0))
    # sala pavilion by the water, benches, lamp posts
    for dx in (-1.8, 1.8):
        for dy in (-1.5, 1.5):
            cyl("sala_col_%.1f_%.1f" % (dx, dy), 0.12, 2.8, (9.0 + dx, 13.0 + dy, 1.4), mat("sala_white", (0.85, 0.83, 0.78), rough=0.6))
    cyl("sala_roof", 3.2, 1.4, (9.0, 13.0, 3.5), mat("sala_tile", hexc("#9b3a24"), rough=0.6), 4, r2=0.3)
    for k, x in enumerate((-12, 14)):
        box("bench_%d" % k, (1.8, 0.45, 0.06), (x, 10.6, 0.45), wood)
    for k, x in enumerate((-8, 5, 18)):
        cyl("lamp_%d" % k, 0.06, 3.6, (x, 10.9, 1.8), steel, 12)
        ball("lamp_globe_%d" % k, 0.18, (x, 10.9, 3.7), mat("globe", (0.95, 0.94, 0.9), rough=0.2), sub=2)
    for k in range(18):
        tree("tree_%d" % k, random.uniform(-40, 40), random.choice((random.uniform(-25, -4), random.uniform(17, 22))),
             random.uniform(6, 11), random.uniform(2.2, 3.6))
    tree("rain_tree", -7.0, 5.0, 9.0, 4.2)
    skyline(40, -400, 420, 520, 800, 50, 140)
    camera((2.6, -0.4, 1.55), (-1.2, 6.6, 0.75), lens=30)
    sc.view_settings.exposure = -0.7


# ------------------------------------------------------------------ 2. Tuk-tuks at Sanam Luang, palace as backdrop
def build_tuktuk():
    morning(elev=18, rot=95, sun_rot_z=-70)
    lawn = mat("sanam_lawn", (0.16, 0.24, 0.07), rough=0.95)
    road = mat("asphalt", (0.07, 0.07, 0.075), rough=0.6)
    white = mat("palace_white", (0.86, 0.84, 0.78), rough=0.7)
    gold = mat("spire_gold", hexc("#c9a24a"), rough=0.3, metal=0.8)
    roof_o = mat("roof_orange", hexc("#c4592e"), rough=0.5)
    roof_g = mat("roof_green", hexc("#2f6a3d"), rough=0.5)
    box("ground", (600, 600, 0.2), (0, 0, -0.1), lawn)
    box("road", (300, 12, 0.04), (0, 2.0, 0.02), road)
    for i in range(-30, 31):
        box("lane_%d" % i, (2.5, 0.12, 0.01), (i * 6.0, 2.0, 0.045), mat("lane_white", (0.85, 0.85, 0.85), rough=0.6))
    # the Grand Palace wall and roofs, far behind, a plain backdrop (no branding, nothing placed on it)
    box("palace_wall", (220, 1.2, 5.0), (0, 90, 2.5), white)
    for k in range(-6, 7):
        box("crenel_%d" % k, (1.0, 1.3, 0.8), (k * 16.0, 90, 5.4), white)
    for k, (x, h) in enumerate(((-40, 22), (-12, 34), (20, 28), (52, 20))):
        box("hall_%d" % k, (26, 18, 8), (x, 110, 4 + 5), white)
        for t in range(3):
            cyl("roof_%d_%d" % (k, t), 15 - t * 3.5, 3.0, (x, 110, 13 + t * 2.6), roof_o if t % 2 == 0 else roof_g, 4, r2=11 - t * 3.5)
        cyl("spire_%d" % k, 2.2, h, (x, 110, 18 + h / 2), gold, 16, r2=0.05)
    cyl("prang", 6.0, 46, (2, 140, 23), gold, 16, r2=0.1)
    # the tuk-tuks parked along the lawn edge, the hero one facing away from the camera
    def tuktuk(name, x, y, yaw, body_hex, hero=False):
        body = mat("tt_body_" + body_hex, hexc(body_hex), rough=0.3, metal=0.4)
        canopy = mat("tt_canopy", (0.05, 0.05, 0.06), rough=0.7)
        chrome = mat("tt_chrome", (0.8, 0.8, 0.8), rough=0.15, metal=1.0)
        tyre = mat("tyre", (0.02, 0.02, 0.02), rough=0.8)
        objs = []
        objs.append(box(name + "_floor", (1.3, 2.6, 0.12), (0, 0, 0.45), body))
        objs.append(box(name + "_cab", (1.0, 0.9, 0.9), (0, -0.95, 0.95), body))
        objs.append(box(name + "_seat", (1.2, 0.5, 0.45), (0, 0.65, 0.75), mat("tt_seat", hexc("#7a1f1f"), rough=0.5)))
        objs.append(box(name + "_back", (1.3, 0.08, 0.7), (0, 1.3, 0.85), body))
        objs.append(box(name + "_canopy", (1.4, 2.4, 0.08), (0, 0.15, 1.95), canopy))
        for sx in (-0.65, 0.65):
            objs.append(cyl(name + "_pillar%.2f" % sx, 0.025, 1.0, (sx, 1.2, 1.45), chrome, 8))
            objs.append(cyl(name + "_rwheel%.2f" % sx, 0.28, 0.16, (sx, 0.9, 0.28), tyre, 20, rot=(0, math.radians(90), 0)))
        objs.append(cyl(name + "_fwheel", 0.28, 0.16, (0, -1.35, 0.28), tyre, 20, rot=(0, math.radians(90), 0)))
        for o in objs:
            o.location = (o.location.x * math.cos(yaw) - o.location.y * math.sin(yaw) + x,
                          o.location.x * math.sin(yaw) + o.location.y * math.cos(yaw) + y, o.location.z)
            o.rotation_euler.z += yaw
        if hero:
            # the back panel under the canopy: the design face, facing the camera (-Y)
            face(1.20, 0.45, (x, y - 1.345, 1.0), (math.radians(90), 0, 0))   # turned round: the back faces the lens
    tuktuk("tt_hero", 0.0, 6.4, math.pi, "#1f4e8c", hero=True)
    for k, (x, c) in enumerate(((-3.2, "#2f7a3a"), (3.4, "#c23a2a"), (6.8, "#e2b51c"), (-6.6, "#1f4e8c"))):
        tuktuk("tt_%d" % k, x, 6.4 + random.uniform(-0.2, 0.3), math.pi + math.radians(random.uniform(-4, 4)), c)
    for k in range(10):
        tree("tamarind_%d" % k, -60 + k * 13 + random.uniform(-3, 3), 20 + random.uniform(-2, 2), random.uniform(7, 10), 3.2)
    for k, x in enumerate((-9, 9)):
        cyl("lamp_%d" % k, 0.08, 6.0, (x, 8.6, 3.0), mat("lamp_steel", (0.3, 0.32, 0.3), rough=0.5, metal=0.6), 12)
    camera((1.6, -0.5, 1.45), (-0.2, 9.0, 1.25), lens=35)
    sc.view_settings.exposure = -0.9


# ------------------------------------------------------------------ 3. Talat Noi riverside alley, morning
def build_talat_noi():
    morning(elev=22, rot=80, sun_rot_z=-100)
    paving = mat("alley_paving", (0.38, 0.35, 0.31), rough=0.8)
    walls = [mat("old_wall_%d" % i, c, rough=0.95) for i, c in enumerate(((0.62, 0.55, 0.45), (0.55, 0.60, 0.55), (0.70, 0.62, 0.50)))]
    rust = mat("rust_iron", (0.32, 0.16, 0.08), rough=0.7, metal=0.5)
    wood = mat("old_wood", (0.25, 0.15, 0.08), rough=0.8)
    box("alley", (8, 60, 0.1), (0, 10, -0.05), paving)
    # left: the long plastered wall that carries the mural (the design face)
    box("mural_wall", (0.4, 30, 4.5), (-2.4, 10, 2.25), walls[0])
    face(6.0, 2.25, (-2.19, 9.0, 2.1), (math.radians(90), 0, math.radians(-90)))
    for k, py in enumerate((2.0, 5.6, 12.4, 15.8, 19.2)):   # clear of the 6 m print (y 6 to 12): legibility first (Branding)
        box("pipe_%d" % k, (0.06, 0.06, 4.4), (-2.16, py, 2.2), rust)
    # right: old shophouses with wooden shutters, potted plants, a café chalkboard
    for k in range(7):
        y = -2 + k * 4.2
        box("house_%d" % k, (6, 4.1, random.uniform(6, 9)), (5.0, y, 3.5), walls[k % 3])
        box("shutter_%d" % k, (0.08, 3.2, 2.6), (1.98, y, 1.3), wood)
        for j in range(3):
            cyl("pot_%d_%d" % (k, j), 0.16, 0.3, (1.6, y - 1.2 + j * 0.6, 0.15), mat("pot_tc", (0.45, 0.2, 0.1), rough=0.8), 12)
            ball("plant_%d_%d" % (k, j), 0.28, (1.6, y - 1.2 + j * 0.6, 0.55), mat("plant", (0.06, 0.16, 0.05), rough=0.8), sub=2)
    box("chalkboard", (0.05, 0.7, 1.0), (1.55, 3.2, 0.55), mat("chalk_black", (0.03, 0.035, 0.03), rough=0.9), rot=(0, math.radians(-12), 0))
    # overhead: cables and a strip of sky, the river at the alley's end
    for k in range(8):
        box("cable_%d" % k, (4.6, 0.015, 0.015), (0, k * 3.6, 6.2 + random.uniform(-0.3, 0.3)), mat("cable", (0.02, 0.02, 0.02), rough=0.6))
    box("river", (80, 40, 0.05), (0, 60, -0.3), mat("river", (0.08, 0.10, 0.08), rough=0.08))
    box("far_bank", (80, 4, 6), (0, 75, 2.5), walls[1])
    box("bicycle_frame", (0.04, 1.1, 0.04), (1.2, 6.0, 0.6), mat("bike_teal", hexc("#22a99f"), rough=0.3, metal=0.5))
    for dy in (-0.5, 0.5):
        cyl("bike_wheel%.1f" % dy, 0.34, 0.04, (1.2, 6.0 + dy, 0.34), mat("tyre", (0.02, 0.02, 0.02), rough=0.8), 24, rot=(0, math.radians(90), 0))
    camera((1.3, 2.4, 1.5), (-2.2, 9.0, 1.95), lens=28)
    sc.view_settings.exposure = -0.6


# ------------------------------------------------------------------ 4. Motorbike-taxi stand (win), morning rush
def build_win_stand():
    morning(elev=12, rot=100, sun_rot_z=-60)
    pave = mat("pavement", (0.40, 0.38, 0.35), rough=0.75)
    road = mat("asphalt", (0.06, 0.06, 0.065), rough=0.55)
    steel = mat("stand_steel", (0.25, 0.27, 0.28), rough=0.4, metal=0.8)
    orange = mat("win_orange", hexc("#e8641c"), rough=0.7)
    box("pavement", (40, 5, 0.16), (0, 3.0, 0.08), pave)
    box("road", (80, 20, 0.05), (0, -8, -0.02), road)
    box("kerb", (40, 0.25, 0.18), (0, 0.4, 0.09), mat("kerb_rw", (0.82, 0.82, 0.8), rough=0.5))
    for k in range(9):
        hgt = random.uniform(9, 13)
        box("shophouse_%d" % k, (4.2, 8, hgt), (-17 + k * 4.25, 10.0, hgt / 2),
            mat("sh_wall_%d" % (k % 3), [(0.82, 0.78, 0.7), (0.74, 0.76, 0.72), (0.86, 0.82, 0.74)][k % 3], rough=0.8))
        box("shutter_%d" % k, (3.6, 0.1, 2.8), (-17 + k * 4.25, 5.95, 1.4), mat("shutter", (0.45, 0.47, 0.48), rough=0.5, metal=0.6))
    # the stand: a small roof on two posts, a bench, the sign on top (the design face)
    for x in (-1.3, 1.3):
        box("stand_post_%.1f" % x, (0.08, 0.08, 2.6), (x, 3.4, 1.45), steel)
    box("stand_roof", (3.0, 1.6, 0.06), (0, 3.4, 2.75), steel)
    box("sign_case", (2.55, 0.12, 0.95), (0, 2.75, 3.25), steel)
    face(2.4, 0.8, (0, 2.685, 3.25), (math.radians(90), 0, 0))
    box("stand_bench", (2.4, 0.4, 0.06), (0, 3.9, 0.55), mat("bench_wood", (0.35, 0.22, 0.12), rough=0.6))
    # the orange vests hang on a rail, empty (no riders: no people in these scenes)
    box("vest_rail", (1.6, 0.03, 0.03), (0, 4.15, 1.9), steel)
    for k in range(5):
        box("vest_%d" % k, (0.28, 0.05, 0.5), (-0.6 + k * 0.3, 4.12, 1.6), orange)
    # parked motorbikes at the kerb
    for k in range(5):
        x = -5.0 + k * 1.1 + (2.2 if k > 1 else 0)
        c = [hexc("#b8241c"), (0.08, 0.08, 0.09), hexc("#1f4e8c"), (0.85, 0.85, 0.85), hexc("#2f6a3d")][k]
        body = mat("bike_body_%d" % k, c, rough=0.3, metal=0.4)
        box("bike_body_%d" % k, (0.3, 1.2, 0.35), (x, 1.4, 0.65), body, rot=(0, 0, math.radians(8)))
        box("bike_seat_%d" % k, (0.28, 0.6, 0.08), (x, 1.55, 0.86), mat("seat", (0.02, 0.02, 0.02), rough=0.4))
        for dy in (-0.55, 0.6):
            cyl("bike_wheel_%d_%.1f" % (k, dy), 0.27, 0.09, (x, 1.4 + dy, 0.27), mat("tyre", (0.02, 0.02, 0.02), rough=0.8), 20, rot=(0, math.radians(90), 0))
    for k, x in enumerate((-9.0, 8.5)):
        tree("street_tree_%d" % k, x, 4.5, 7.0, 2.6)
    cyl("lamp_pole", 0.08, 8.0, (6.0, 0.8, 4.0), steel)
    camera((3.4, -4.2, 1.45), (-0.4, 3.2, 1.9), lens=32)
    sc.view_settings.exposure = -0.8


{"lumphini": build_lumphini, "tuktuk": build_tuktuk, "talat-noi": build_talat_noi, "win-stand": build_win_stand}[SCENE]()
bpy.ops.wm.save_as_mainfile(filepath=OUT)
print("JG_SCENE saved", SCENE, OUT)
