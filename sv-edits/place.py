# place.py: build the SV Edits L2 "From SV Blender" command for a rendered scene folder and run it.
# Every face in corners.json gets its design as a smart object placed by its four corners, then the
# scene's light pass on top (Multiply, clipped) for printed faces, or nothing for a self-lit lightbox.
#   python3 place.py <scene dir> <out.psd> face=design.png [face=design.png ...] [--emissive face,face]
import json
import subprocess
import sys

scene_dir, out_psd = sys.argv[1], sys.argv[2]
pairs = dict(a.split("=", 1) for a in sys.argv[3:] if "=" in a and not a.startswith("--"))
emissive = set(sys.argv[sys.argv.index("--emissive") + 1].split(",")) if "--emissive" in sys.argv else set()
SVE = ["bash", "/Users/sanpitisititpunt/.sv-edits/edits.sh"]

def size(path):
    info = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", path], capture_output=True, text=True).stdout.split()
    return int(info[info.index("pixelWidth:") + 1]), int(info[info.index("pixelHeight:") + 1])

corners = json.load(open(f"{scene_dir}/corners.json"))
cw, ch = size(f"{scene_dir}/plate.png")
cmd = SVE + ["photo", "run", f"{scene_dir}/plate.png", "--cmd", "layer.renameLayer", "--params", json.dumps({"name": "Scene"})]
for f in corners["faces"]:
    name = f["name"]
    key = name[len("design-"):] if name.startswith("design-") else name
    if key not in pairs:
        continue
    design = pairs[key]
    w, h = size(design)
    rect = [cw / 2 - w / 2, ch / 2 - h / 2, cw / 2 + w / 2, ch / 2 + h / 2]
    cmd += ["--cmd", "file.placeEmbedded", "--params", json.dumps({"path": design, "fit": False, "scale": 100}),
            "--cmd", "layer.renameLayer", "--params", json.dumps({"name": f"Design: {name}"}),
            "--cmd", "edit.transform", "--params", json.dumps({"rect": rect, "quad": f["corners_px"], "interpolation": "bicubic"})]
    # The light pass's transparency masks the design to what the camera sees. A printed face takes the
    # scene's light in full; a lightbox lights itself, so only a trace of the scene's shading (35%).
    cmd +=["--cmd", "file.placeEmbedded", "--params", json.dumps({"path": f"{scene_dir}/light.png", "fit": False, "scale": 100}),
            "--cmd", "layer.renameLayer", "--params", json.dumps({"name": f"Light: {name} (Blender)"}),
            "--cmd", "select.loadSelection", "--params", json.dumps({"channel": "transparency"}),
            "--cmd", "select.findLayers", "--params", json.dumps({"name": f"Design: {name}"}),
            "--cmd", "layer.layerMask.revealSelection", "--cmd", "select.deselect",
            "--cmd", "select.findLayers", "--params", json.dumps({"name": f"Light: {name}"}),
            "--cmd", "layer.setProps", "--params", json.dumps({"blend": "Multiply", "clipped": True,
                                                                "opacity": 35 if key in emissive else 100})]
cmd += ["--out", out_psd]
r = subprocess.run(cmd, capture_output=True, text=True)
errs = [l for l in r.stdout.splitlines() + r.stderr.splitlines() if "error" in l.lower()]
print("PLACE", out_psd, "ok" if r.returncode == 0 and not errs else "FAILED", errs[:3])
if "-v" in sys.argv: print(r.stdout[-1500:], r.stderr[-800:])
png = out_psd[:-4] + ".png"
subprocess.run(SVE + ["photo", "convert", out_psd, png], capture_output=True)
print("PNG", png)
