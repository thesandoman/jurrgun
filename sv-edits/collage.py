# collage.py: rebuild scenes-collage-morning.png, the one-per-scene morning collage (the brand-video reference).
# 3 columns by 2 rows of the 1920x1080 scene PNGs in billboards/, each scaled to 960x540, 16 px dark gutters,
# 2944x1128 in all. Uses ffmpeg only (no Pillow), so it runs on a Mac that has ffmpeg.
#   python3 collage.py [out.png]
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCENES = ["bts-skytrain-morning", "shopfront-morning", "mrt-platform",
          "highway-unipole-morning", "bus-shelter-morning", "mall-led"]
TW, TH, GAP, COLS = 960, 540, 16, 3
GUTTER = "0x1e2b22"   # brand ink, the dark of the gutters


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "scenes-collage-morning.png")
    rows = (len(SCENES) + COLS - 1) // COLS
    w, h = COLS * TW + (COLS + 1) * GAP, rows * TH + (rows + 1) * GAP
    args = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=%s:s=%dx%d" % (GUTTER, w, h)]
    for s in SCENES:
        args += ["-i", os.path.join(HERE, "billboards", s + ".png")]
    chain, last = [], "0:v"
    for i in range(len(SCENES)):
        x = GAP + (i % COLS) * (TW + GAP)
        y = GAP + (i // COLS) * (TH + GAP)
        chain.append("[%d:v]scale=%d:%d:flags=lanczos[t%d]" % (i + 1, TW, TH, i))
        chain.append("[%s][t%d]overlay=%d:%d[o%d]" % (last, i, x, y, i))
        last = "o%d" % i
    args += ["-filter_complex", ";".join(chain), "-map", "[%s]" % last, "-frames:v", "1", out]
    subprocess.run(args, check=True)
    print("collage", out, "%dx%d" % (w, h))


if __name__ == "__main__":
    main()
