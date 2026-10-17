# guide.py: build the one-page A3 brand guide with SV Edits' vector tool.
# Colours follow the app's palette (src/ui/palette.ts, owner direction 2026-10-17):
# green acts, cream is the page, mango only for My events and warnings, Chao Phraya sky for info and the
# river, canal teal for food and nights, love red only for dating mode. Coral is retired.
#   python3 guide.py   (writes guide/jurrgun-brand-guide.ai, .pdf, .png)
import json
import os
import subprocess

S = os.path.dirname(os.path.abspath(__file__))
L, G = f"{S}/logo", f"{S}/guide"
INK, GREEN, SUB = "#1e2b22", "#137f45", "#46564b"
COLOURS = [  # name, hex, what it's for
    ("Jurrgun green", "#137f45", "ปุ่มและการกระทำ · Actions"),
    ("Cream", "#fff9f0", "พื้นหน้า · The page"),
    ("Ink", "#1e2b22", "ตัวอักษร · Text"),
    ("Fresh green", "#2fb866", "กลางแจ้ง · Outdoors"),
    ("Mango", "#ffa53a", "นัดของฉัน คำเตือน · My events, warnings"),
    ("Chao Phraya sky", "#5cb8e6", "ข้อมูล แม่น้ำ · Info, the river"),
    ("Canal teal", "#22a99f", "อาหาร ยามค่ำ · Food, nights"),
    ("Love red", "#e23744", "โหมดเปิดใจเท่านั้น · Dating mode only"),
]

cmds = []
def c(cmd, p=None):
    cmds.append("--cmd"); cmds.append(cmd)
    if p is not None:
        cmds.append("--params"); cmds.append(json.dumps(p, ensure_ascii=False))
def text(x, y, t, size, font="Anuphan", style="Regular", color=INK):
    c("text.create", {"x": x, "y": y, "text": t, "size": size, "font": font, "style": style, "color": color})
def rect(x, y, w, h, fill, radius=0, stroke=None, name=None):
    c("shape.rectangle", {"x": x, "y": y, "width": w, "height": h, **({"radius": radius} if radius else {})})
    c("paint.setFill", {"color": fill} if fill else {"none": True})
    if stroke:
        c("paint.setStroke", {"color": stroke}); c("stroke.set", {"weight": 1, "align": "inside"})
    else:
        c("paint.setStroke", {"none": True})
    if name:
        c("object.setProps", {"name": name})

c("file.new", {"name": "brand-guide", "width": 1190.55, "height": 841.89, "units": "Points", "colorMode": "rgb"})
rect(0, 0, 1190.55, 841.89, "#fff9f0", name="Ground")
text(48, 82, "Jurrgun", 44, "Sao Chingcha", "Bold")
text(262, 82, "เจอกัน", 30, "Sao Chingcha", "Bold", GREEN)
text(48, 108, "แนวทางแบรนด์ฉบับย่อ · Brand guide, one page · say “jer-gun”", 14, color=SUB)
rect(48, 124, 1094.55, 1.5, "#f0e2cc", name="Rule")
# 1 the mark and clear space
text(48, 160, "1  สัญลักษณ์ · The mark", 15, style="SemiBold")
c("shape.rectangle", {"x": 60, "y": 180, "width": 250, "height": 250}); c("paint.setFill", {"none": True})
c("paint.setStroke", {"color": GREEN}); c("stroke.set", {"weight": 1, "dash": [4, 4]}); c("object.setProps", {"name": "Clear space"})
c("file.place", {"path": f"{S}/logo-source.svg", "rect": [100, 220, 170, 170]}); c("object.setProps", {"name": "Mark"})
text(60, 452, "พื้นที่ว่างรอบโลโก้อย่างน้อย ¼ ของความกว้างสัญลักษณ์", 11, color=SUB)
text(60, 468, "Clear space: at least ¼ of the mark's width on every side.", 11, color=SUB)
# minimum sizes and the reversed mark
text(340, 160, "ขนาดเล็กสุด · Minimum size", 15, style="SemiBold")
for px, x in ((48, 340), (32, 410), (24, 462), (16, 506)):
    c("file.place", {"path": f"{S}/logo-source.svg", "rect": [x, 190, px, px]})
    text(x, 262, f"{px} px", 10, color=SUB)
text(340, 290, "เล็กกว่า 16 px ห้ามย่อลงอีก", 11, color=SUB)
text(340, 306, "Under 16 px, don't shrink the mark further.", 11, color=SUB)
c("file.place", {"path": f"{L}/jurrgun-mark-reversed.svg", "rect": [340, 330, 90, 90]})
rect(440, 330, 110, 90, "#1e2b22", radius=10, name="Dark swatch")
c("file.place", {"path": f"{L}/jurrgun-mark-reversed.svg", "rect": [460, 340, 70, 70]})
text(340, 440, "บนพื้นเข้ม ใช้แบบกลับสี · Reversed on dark grounds", 11, color=SUB)
# 2 lockup
text(48, 510, "2  ชื่อและสโลแกน · Lockup", 15, style="SemiBold")
c("file.place", {"path": f"{L}/jurrgun-lockup-light.svg", "rect": [48, 530, 520, 156]})
text(48, 712, "ภาษาไทยขึ้นก่อนเสมอ ภาษาอังกฤษอยู่บรรทัดถัดไป", 11, color=SUB)
text(48, 728, "Thai first, English underneath. No em or en dashes in copy.", 11, color=SUB)
# 3 colours: 4 x 2 chips, each with its name, hex and job
text(620, 160, "3  สี · Colours", 15, style="SemiBold")
for i, (name, hx, job) in enumerate(COLOURS):
    x, y = 620 + (i % 4) * 130, 176 + (i // 4) * 150
    rect(x, y, 118, 80, hx, radius=10, stroke=(INK if hx == "#fff9f0" else None), name=f"Chip {name}")
    text(x, y + 98, name, 11, style="SemiBold")
    text(x, y + 113, hx.upper(), 10.5, color=SUB)
    th, en = job.split(" · ")
    col = "#c0222f" if name == "Love red" else SUB
    text(x, y + 127, th, 9, color=col)
    text(x, y + 139, en, 9, color=col)
# 4 typefaces
text(620, 500, "4  ตัวอักษร · Typefaces", 15, style="SemiBold")
text(620, 546, "เจอกัน Jurrgun", 34, "Sao Chingcha", "Bold")
text(620, 566, "Sao Chingcha · หัวข้อ ชื่อ และพาดหัว · Headings and names", 11, color=SUB)
text(620, 604, "กลุ่มเล็ก สถานที่จริง Small groups.", 22)
text(620, 624, "Anuphan · เนื้อหา ปุ่ม และเมนู · Body, buttons and menus", 11, color=SUB)
# 5 house rules
text(620, 672, "5  หลักใช้งาน · House rules", 15, style="SemiBold")
rules = ["• เขียวคือปุ่มและการกระทำ ครีมคือพื้นหน้าเท่านั้น · Green acts. Cream is only the page.",
         "• มะม่วงเฉพาะนัดของฉันและคำเตือน · Mango only for My events and warnings.",
         "• แดงเฉพาะโหมดเปิดใจ คู่กับเขียว · Red only for dating mode, beside green.",
         "• อย่าวาดโลโก้ใหม่ ยืด หมุน หรือเปลี่ยนสี · Never redraw, stretch or recolour the mark."]
for i, r in enumerate(rules):
    text(620, 694 + i * 18, r, 10.5)
# footer
rect(48, 782, 1094.55, 1.5, "#f0e2cc")
text(48, 806, "แอปอิสระ มีกรุงเทพมหานครเป็นเจ้าภาพและผู้กำกับดูแล · An independent app, hosted and overseen by the Bangkok Metropolitan Administration", 10.5, color=SUB)
text(48, 824, "jurrgun.apps.sv-academy.org", 10.5, style="SemiBold", color=GREEN)
c("text.fonts", {})
c("document.export", {"path": f"{G}/jurrgun-brand-guide.pdf", "format": "pdf", "preserveEditing": False})
c("document.export", {"path": f"{G}/jurrgun-brand-guide.png", "format": "png", "useArtboards": True, "scale": 2, "background": "#fff9f0"})
c("file.saveCopy", {"path": f"{G}/jurrgun-brand-guide.ai", "format": "ai"})

env = dict(os.environ, HOME=os.path.expanduser("~/.sv-edits/fonthome/jurrgun"))
r = subprocess.run(["bash", os.path.expanduser("~/.sv-edits/edits.sh"), "vector", "run", *cmds], capture_output=True, text=True, env=env)
missing = [l for l in r.stdout.split('"missingGlyphs":')[1:] if not l.startswith("0")]
print("GUIDE", "ok" if r.returncode == 0 else "FAILED", "missing glyphs:", len(missing))
