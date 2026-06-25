#!/usr/bin/env python3
"""Generate vigiles-demo.gif — an animated terminal of `vigiles lint` catching
stale references. Pure Pillow (no recorder needed); the output lines are verbatim
from the real CLI (see scripts/demo.sh). Regenerate: `python3 scripts/make-demo-gif.py`
(needs Pillow: `pip install Pillow`). Run from the repo root."""
from PIL import Image, ImageDraw, ImageFont

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FS = 21
font = ImageFont.truetype(FONT, FS)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", FS)
CW = font.getlength("M")           # mono advance width
LH = 31                            # line height

# palette (GitHub dark)
BG = (13, 17, 23)
BAR = (22, 27, 34)
FG = (201, 209, 217)
DIM = (139, 148, 158)
BLUE = (88, 166, 255)
GREEN = (126, 231, 135)
RED = (248, 81, 73)
CURSOR = (201, 209, 217)
DOTS = [(255, 95, 86), (255, 189, 46), (39, 201, 63)]

PADX, PADY = 22, 14
BARH = 38
COLS = 57
W = int(PADX * 2 + CW * COLS)
# content lines (segments: list of (text,color)); None == blank.
# Verbatim from the real CLI — nothing fabricated.
PROMPT = [("$ ", GREEN), ("npx vigiles lint CLAUDE.md", FG)]
OUT = [
    None,
    [("CLAUDE.md (inline mode):", DIM)],
    [("  ", FG), ("✗", RED), (' line 7: File not found: "src/auth/login.ts"', FG)],
    [("  ", FG), ("✗", RED), (' line 12: Script "check" not found in package.json', FG)],
]
NROWS = 1 + len(OUT)
H = BARH + PADY * 2 + LH * NROWS + 8


def seg_text(line):
    return "" if line is None else "".join(t for t, _ in line)


def base():
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, BARH], fill=BAR)
    for i, c in enumerate(DOTS):
        cx = 20 + i * 22
        d.ellipse([cx, BARH // 2 - 7, cx + 14, BARH // 2 + 7], fill=c)
    d.text((W / 2, BARH / 2), "vigiles", font=font, fill=DIM, anchor="mm")
    return img, d


def draw_line(d, row, line, ncols=None, cursor=False):
    y = BARH + PADY + row * LH
    x = PADX
    if line is not None:
        shown = 0
        for txt, col in line:
            for ch in txt:
                if ncols is not None and shown >= ncols:
                    break
                f = bold if ch == "✗" else font
                d.text((x, y), ch, font=f, fill=col)
                x += CW
                shown += 1
            else:
                continue
            break
    if cursor:
        d.rectangle([x + 1, y + 3, x + CW, y + FS + 4], fill=CURSOR)


frames, durs = [], []


def add(typed, out_n, cursor=True, dur=70):
    img, d = base()
    draw_line(d, 0, PROMPT, ncols=typed, cursor=cursor and out_n == 0)
    for i in range(out_n):
        draw_line(d, 1 + i, OUT[i])
    frames.append(img)
    durs.append(dur)


cmd_len = sum(len(t) for t, _ in PROMPT)
# 1) typing the command
for k in range(0, cmd_len + 1, 2):
    add(k, 0, dur=55)
add(cmd_len, 0, dur=380)              # hold full command
# 2) reveal output line by line
for n in range(1, len(OUT) + 1):
    add(cmd_len, n, cursor=False, dur=230)
# 3) long final hold
frames[-1] = frames[-1]
durs[-1] = 2600

frames[0].save(
    "vigiles-demo.gif", save_all=True, append_images=frames[1:],
    duration=durs, loop=0, optimize=True, disposal=2,
)
print(f"wrote vigiles-demo.gif  {W}x{H}  {len(frames)} frames")
