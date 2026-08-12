#!/usr/bin/env python3
"""连击美术字烘焙 v2 —— 带厚度、金属渐变、双描边、外发光的印章。

v1 只有「单色渐变 + 一圈黑描边」，压在深色棋盘上必然发灰。
业界（王者击杀播报、格斗 combo counter）的美术字靠六层堆出质感，缺一层就塌：

    外发光 → 立体厚度 → 外轮廓 → 亮描边 → 渐变字身 → 顶部高光 + 斜切刃光

字形也换了：楷书笔画细、留白多，撑不住这种堆叠，改用黑体再做 faux bold 加粗。

用法：
    python3 scripts/bake_combo_stamps_v2.py            # 出全套印章
    python3 scripts/bake_combo_stamps_v2.py --proto    # 只出风格对比原型图
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "minigame" / "subpackages" / "pkg-battle" / "images" / "ui" / "battle" / "combo"
PROTO_OUT = ROOT / "docs" / "ui-redesign" / "combo"

HEITI = "/System/Library/Fonts/Hiragino Sans GB.ttc"
HEITI_INDEX = 1  # W6，系统自带里最粗的中文黑体，但对美术字来说仍偏瘦
# 思源黑体 Black（OFL，可商用）。只在离线烘焙时用，不进包体。
BLACK = ROOT / "fonts_tmp" / "NotoSansSC-Black.otf"
MASHAN = ROOT / "fonts_tmp" / "MaShanZheng-Regular.ttf"
# 数字单独用西文粗体：思源 Black 的阿拉伯数字太圆胖，0/6/8/9 的孔洞缩到
# 真机尺寸后会糊成实心块，连击数就读不出来了。
DIGIT_FONT = "/System/Library/Fonts/Supplemental/Arial Black.ttf"

RGB = tuple[int, int, int]


class Style:
    """一套美术字配色 / 质感参数。

    所有几何量都是「相对字号的比例」而不是像素。固定像素在大字上不够看、
    在小字上直接把笔画糊死——「连击」这种两字词最先崩。
    """

    def __init__(
        self,
        name: str,
        body: list[RGB],
        stroke_bright: RGB,
        stroke_dark: RGB,
        glow: RGB,
        extrude: RGB,
        *,
        bold: float = 0.016,
        stroke_w: float = 0.055,
        rim_w: float = 0.030,
        depth: float = 0.095,
        glow_blur: float = 0.10,
        glow_boost: float = 1.15,
        shear: float = 0.16,
        taper: float = 0.05,
        highlight: float = 0.46,
        font: str = "black",
    ) -> None:
        self.name = name
        self.body = body
        self.stroke_bright = stroke_bright
        self.stroke_dark = stroke_dark
        self.glow = glow
        self.extrude = extrude
        self.bold = bold
        self.stroke_w = stroke_w
        self.rim_w = rim_w
        self.depth = depth
        self.glow_blur = glow_blur
        self.glow_boost = glow_boost
        self.shear = shear
        self.taper = taper
        self.highlight = highlight
        self.font = font


STYLES: dict[str, Style] = {
    # 熔金：王者击杀播报那一路，最通用的「高光时刻」配色
    "gold": Style(
        "gold",
        body=[(255, 252, 214), (255, 214, 92), (255, 150, 20), (214, 92, 8)],
        stroke_bright=(255, 226, 130),
        stroke_dark=(58, 22, 4),
        glow=(255, 150, 30),
        extrude=(120, 52, 6),
    ),
    # 冰刃：低段位里程碑用，冷色不抢戏但仍有金属感
    "ice": Style(
        "ice",
        body=[(255, 255, 255), (198, 236, 255), (96, 178, 255), (30, 96, 200)],
        stroke_bright=(214, 244, 255),
        stroke_dark=(6, 22, 58),
        glow=(70, 170, 255),
        extrude=(18, 62, 130),
    ),
    # 血煞：金色内描边压住暗红，字身最重的一档
    "blood": Style(
        "blood",
        body=[(255, 226, 200), (255, 120, 96), (214, 30, 40), (128, 8, 18)],
        stroke_bright=(255, 206, 120),
        stroke_dark=(46, 4, 8),
        glow=(230, 40, 50),
        extrude=(96, 8, 16),
    ),
    # 国风毛笔变体：楷体笔画细、结构散，撑不住加粗与多层描边，这里只做轻描边保字形
    "ink": Style(
        "ink",
        body=[(255, 244, 214), (255, 196, 92), (232, 120, 30), (170, 52, 8)],
        stroke_bright=(255, 232, 170),
        stroke_dark=(40, 10, 4),
        glow=(255, 130, 40),
        extrude=(110, 40, 6),
        font="mashan",
        bold=0.004,
        stroke_w=0.040,
        rim_w=0.018,
        depth=0.045,
        shear=0.08,
        taper=0.02,
    ),
    # 紫电：高段位，最艳的一档
    "violet": Style(
        "violet",
        body=[(255, 240, 255), (226, 170, 255), (156, 78, 255), (86, 24, 170)],
        stroke_bright=(236, 190, 255),
        stroke_dark=(26, 4, 52),
        glow=(170, 80, 255),
        extrude=(70, 20, 130),
        depth=0.105,
        glow_boost=1.28,
    ),
    # 琥珀：第二档，介于冰蓝与血红之间的暖色过渡
    "amber": Style(
        "amber",
        body=[(255, 250, 214), (255, 206, 110), (255, 140, 0), (188, 76, 4)],
        stroke_bright=(255, 222, 140),
        stroke_dark=(52, 20, 2),
        glow=(255, 150, 20),
        extrude=(122, 58, 4),
        depth=0.098,
        glow_boost=1.20,
    ),
    # 神话：最高档，金红双色 + 最强发光，留给 18 连
    "mythic": Style(
        "mythic",
        body=[(255, 252, 226), (255, 208, 96), (255, 62, 110), (150, 6, 52)],
        stroke_bright=(255, 226, 140),
        stroke_dark=(48, 2, 20),
        glow=(255, 40, 110),
        extrude=(120, 10, 44),
        depth=0.115,
        glow_boost=1.42,
        stroke_w=0.062,
    ),
}


def _font(style: Style, size: int) -> ImageFont.FreeTypeFont:
    if style.font == "mashan":
        return ImageFont.truetype(str(MASHAN), size=size)
    if style.font == "digit":
        return ImageFont.truetype(DIGIT_FONT, size=size)
    if style.font == "black" and BLACK.exists():
        return ImageFont.truetype(str(BLACK), size=size)
    return ImageFont.truetype(HEITI, size=size, index=HEITI_INDEX)


def _expand(mask: Image.Image, radius: int) -> Image.Image:
    """形态学膨胀。MaxFilter 只吃奇数核，大半径拆成多次迭代更稳。"""
    out = mask
    left = radius
    while left > 0:
        step = min(4, left)
        out = out.filter(ImageFilter.MaxFilter(step * 2 + 1))
        left -= step
    return out


def _vertical_gradient(size: tuple[int, int], stops: list[RGB]) -> Image.Image:
    w, h = size
    grad = Image.new("RGB", (1, h))
    px = grad.load()
    segs = len(stops) - 1
    for y in range(h):
        t = y / max(1, h - 1) * segs
        i = min(segs - 1, int(t))
        f = t - i
        a, b = stops[i], stops[i + 1]
        px[0, y] = (
            int(a[0] + (b[0] - a[0]) * f),
            int(a[1] + (b[1] - a[1]) * f),
            int(a[2] + (b[2] - a[2]) * f),
        )
    return grad.resize((w, h))


def _tinted(mask: Image.Image, color: RGB) -> Image.Image:
    layer = Image.new("RGBA", mask.size, color + (0,))
    layer.putalpha(mask)
    return layer


def render_art_text(text: str, style: Style, font_size: int) -> Image.Image:
    """烘一个美术字印章，返回已裁边的 RGBA。"""
    font = _font(style, font_size)
    bold = round(font_size * style.bold)
    rim_w = max(1, round(font_size * style.rim_w))
    stroke_w = max(1, round(font_size * style.stroke_w))
    depth = max(1, round(font_size * style.depth))
    glow_blur = max(2, round(font_size * style.glow_blur))
    pad = font_size // 2 + stroke_w + rim_w + depth + glow_blur

    probe = Image.new("L", (1, 1))
    box = ImageDraw.Draw(probe).textbbox((0, 0), text, font=font)
    w = box[2] - box[0] + pad * 2
    h = box[3] - box[1] + pad * 2

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).text((pad - box[0], pad - box[1]), text, font=font, fill=255)
    # faux bold：系统里最粗的中文黑体仍偏瘦，撑不住多层描边
    if bold:
        mask = _expand(mask, bold)

    canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))

    # 1) 外发光：整体基调，决定这字在深色底上「亮不亮」
    glow_mask = _expand(mask, stroke_w + rim_w).filter(ImageFilter.GaussianBlur(glow_blur))
    glow_mask = glow_mask.point(lambda v: min(255, int(v * style.glow_boost)))
    canvas.alpha_composite(_tinted(glow_mask, style.glow))

    # 2) 立体厚度：字身向右下逐像素挤出，是「有分量」的主要来源。
    #    挤出层必须按外轮廓的宽度膨胀，否则整条厚度会被后面的暗轮廓盖掉。
    extrude_layer = _tinted(_expand(mask, stroke_w + rim_w), style.extrude)
    for d in range(depth, 0, -1):
        canvas.alpha_composite(extrude_layer, (int(d * 0.5), d))

    # 3) 最外暗轮廓 → 4) 亮描边，两层拉开对比，字才从背景里「切」出来
    canvas.alpha_composite(_tinted(_expand(mask, stroke_w + rim_w), style.stroke_dark))
    canvas.alpha_composite(_tinted(_expand(mask, rim_w), style.stroke_bright))

    # 5) 渐变字身
    body = _vertical_gradient((w, h), style.body).convert("RGBA")
    body.putalpha(mask)
    canvas.alpha_composite(body)

    # 6) 顶部高光 + 斜切刃光，金属感全靠这层
    hl_h = int(h * style.highlight)
    hl = Image.new("L", (w, h), 0)
    hl.paste(_vertical_gradient((w, hl_h), [(255, 255, 255), (0, 0, 0)]).convert("L"), (0, 0))
    canvas.alpha_composite(_tinted(ImageChops.multiply(hl, mask).point(lambda v: int(v * 0.72)),
                                   (255, 255, 255)))

    blade = Image.new("L", (w, h), 0)
    bd = ImageDraw.Draw(blade)
    by = int(h * 0.34)
    bd.polygon(
        [(-w, by), (w * 2, by - int(h * 0.20)), (w * 2, by - int(h * 0.10)), (-w, by + int(h * 0.10))],
        fill=190,
    )
    canvas.alpha_composite(_tinted(ImageChops.multiply(blade, mask), (255, 255, 255)))

    # 7) 切斜 + 梯形收底：上宽下窄的透视让静止的字也像正朝观众压过来
    if style.shear:
        dx = int(h * style.shear)
        canvas = canvas.transform(
            (w + dx, h), Image.AFFINE, (1, style.shear, -dx * 0.5, 0, 1, 0),
            resample=Image.BICUBIC,
        )
    if style.taper:
        cw, ch = canvas.size
        t = int(cw * style.taper)
        canvas = canvas.transform(
            (cw, ch), Image.QUAD, (0, 0, -t, ch, cw + t, ch, cw, 0),
            resample=Image.BICUBIC,
        )

    return canvas.crop(canvas.getbbox())


def _checker_bg(size: tuple[int, int]) -> Image.Image:
    """模拟战斗盘面：深色棋盘，用来验证印章在实际底色上的对比度。"""
    w, h = size
    bg = Image.new("RGB", size, (26, 20, 40))
    d = ImageDraw.Draw(bg)
    cell = 64
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            if (x // cell + y // cell) % 2 == 0:
                d.rectangle([x, y, x + cell, y + cell], fill=(34, 27, 52))
    return bg


def build_prototype() -> Path:
    """出风格对比原型图：现状 vs 四种新方案，压在深色棋盘上看真实对比度。"""
    PROTO_OUT.mkdir(parents=True, exist_ok=True)
    rows = [
        ("现状 v1", None),
        ("A 熔金", STYLES["gold"]),
        ("B 冰刃", STYLES["ice"]),
        ("C 血煞", STYLES["blood"]),
        ("D 紫电", STYLES["violet"]),
        ("E 国风毛笔", STYLES["ink"]),
    ]
    row_h = 190
    W = 1000
    canvas = _checker_bg((W, row_h * len(rows) + 40))
    canvas = canvas.convert("RGBA")
    label_font = ImageFont.truetype(HEITI, size=26, index=HEITI_INDEX)
    draw = ImageDraw.Draw(canvas)

    for i, (title, style) in enumerate(rows):
        y = 30 + i * row_h
        draw.text((24, y + row_h // 2 - 16), title, font=label_font, fill=(150, 150, 170))

        if style is None:
            for j, name in enumerate(
                ["combo_ms_break.png", "combo_label_gold.png", "combo_digit_gold_8.png"]
            ):
                p = OUT / name
                if not p.exists():
                    continue
                im = Image.open(p).convert("RGBA")
                s = 110 / im.height
                im = im.resize((int(im.width * s), 110), Image.LANCZOS)
                canvas.alpha_composite(im, (200 + j * 240, y + 20))
            continue

        # 统一按大字号烘焙再缩到展示尺寸：缩小只会更锐利，放大才会糊，
        # 实际运行时也是「烘大图 → Sprite 缩放」，这样原型才对得上真机观感。
        def place(text: str, target_h: int, x: int, dy: int) -> int:
            im = render_art_text(text, style, 150)
            s = target_h / im.height
            im = im.resize((max(1, int(im.width * s)), target_h), Image.LANCZOS)
            canvas.alpha_composite(im, (x, y + dy))
            return im.width

        place("破", 128, 200, 12)
        num_w = place("8", 138, 400, 6)
        place("连击", 78, 400 + num_w + 16, 50)

    dest = PROTO_OUT / "combo_style_proto.png"
    canvas.convert("RGB").save(dest)
    return dest


def build_hud_proto() -> Path:
    """出完整 HUD 原型：印章 + 数字 + 连击 + 倍率按实际排版叠好，看 tier 递进。"""
    PROTO_OUT.mkdir(parents=True, exist_ok=True)
    cols = [
        ("3 连 · 破", "破", "3", "x1.6", "ice", (96, 178, 255)),
        ("9 连 · 神威", "神威", "9", "x3.2", "blood", (255, 77, 106)),
        ("15 连 · 传说", "传说", "15", "x5.0", "gold", (255, 196, 60)),
    ]
    col_w, H = 420, 620
    canvas = _checker_bg((col_w * len(cols), H)).convert("RGBA")
    label_font = ImageFont.truetype(HEITI, size=24, index=HEITI_INDEX)

    for i, (title, word, num, mul, style_key, accent) in enumerate(cols):
        style = STYLES[style_key]
        cx = i * col_w + col_w // 2
        fx = Image.new("RGBA", (col_w, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(fx)

        # 速度带 + 冲击环：文字底下的动势层，实际由 ComboDisplay 逐帧绘制
        d.polygon([(30, 300), (col_w - 30, 268), (col_w - 30, 318), (30, 350)], fill=accent + (46,))
        for r, a in ((150, 70), (196, 40), (238, 22)):
            d.ellipse([col_w // 2 - r, 300 - r, col_w // 2 + r, 300 + r], outline=accent + (a,), width=4)
        canvas.alpha_composite(fx, (i * col_w, 0))

        def place(text: str, target_h: int, cy: int) -> None:
            im = render_art_text(text, style, 150)
            s = target_h / im.height
            im = im.resize((max(1, int(im.width * s)), target_h), Image.LANCZOS)
            canvas.alpha_composite(im, (cx - im.width // 2, cy))

        place(word, 108, 130)
        # 数字与「连击」并排，数字压大一号——玩家眼睛先抓数字。
        # 两者都跟着本档色板走，与真机的 combo_digit_{style}_* 是同一份参数。
        n_im = render_art_text(num, _slim(style_key, "digit"), 170)
        n_s = 132 / n_im.height
        n_im = n_im.resize((max(1, int(n_im.width * n_s)), 132), Image.LANCZOS)
        w_im = render_art_text("连击", _slim(style_key, "black"), 150)
        w_s = 76 / w_im.height
        w_im = w_im.resize((max(1, int(w_im.width * w_s)), 76), Image.LANCZOS)
        total = n_im.width + 14 + w_im.width
        x0 = cx - total // 2
        canvas.alpha_composite(n_im, (x0, 262))
        canvas.alpha_composite(w_im, (x0 + n_im.width + 14, 262 + 132 - 76 - 8))

        place(mul, 46, 424)
        d2 = ImageDraw.Draw(canvas)
        d2.text((cx - 46, 552), title, font=label_font, fill=(160, 160, 180))

    dest = PROTO_OUT / "combo_hud_proto.png"
    canvas.convert("RGB").save(dest)
    return dest


# 里程碑逐档升温：冰蓝 → 琥珀 → 血红 → 紫电 → 熔金 → 神话金红。
# 色相与 ComboDisplay.COMBO_MILESTONES 一一对应，改这里要同步那边的 color。
MILESTONE_STYLES = [
    ("break", "破", "ice"),
    ("wushuang", "无双", "amber"),
    ("shenwei", "神威", "blood"),
    ("tianxuan", "天选", "violet"),
    ("chuanshuo", "传说", "gold"),
    ("shenhua", "神话", "mythic"),
]

# 档位 → 色板。索引即 ComboDisplay.getComboTier 的返回值，0 是未破连击的常态档。
# t0 与 t5 同用熔金，所以实际只烘 6 套，靠这张表去重。
STYLE_BY_TIER = ["gold", "ice", "amber", "blood", "violet", "gold", "mythic"]

# 数字和「连击」得用更轻的一套：0/6/8/9 的孔洞和「连击」的密笔画都很小，
# 里程碑那档的膨胀量会直接把它们糊成实心块。
def _slim(style_key: str, font: str) -> Style:
    s = STYLES[style_key]
    return Style(
        f"{style_key}_slim_{font}",
        body=s.body,
        stroke_bright=s.stroke_bright,
        stroke_dark=s.stroke_dark,
        glow=s.glow,
        extrude=s.extrude,
        bold=0.0,
        stroke_w=0.034,
        rim_w=0.018,
        depth=0.058,
        glow_blur=0.085,
        glow_boost=1.05,
        font=font,
    )


SLIM_LABEL = _slim("gold", "black")
SLIM_DIGIT = _slim("gold", "digit")


def _quantize(path: Path) -> None:
    """256 色量化。一套字表 ×6 档后原始 PNG 有 2.5MB，量化能压到三分之一；
    渐变字身在 256 色内几乎看不出色带，真机还要再缩小采样。"""
    subprocess.run(
        ["pngquant", "--force", "--skip-if-larger", "--quality", "60-92",
         "--speed", "1", "--output", str(path), str(path)],
        check=False,
    )


def build_all() -> None:
    """烘全套：6 个里程碑词 + 每套色板的「连击」与数字 0-9。"""
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("combo_digit_[0-9].png"):
        old.unlink()
    (OUT / "combo_label.png").unlink(missing_ok=True)

    total = 0
    for key, text, style_key in MILESTONE_STYLES:
        # 真机上里程碑印章约 240 设备像素高，单字给大一号才不显得比双字瘦
        size = 180 if len(text) == 1 else 150
        img = render_art_text(text, STYLES[style_key], size)
        path = OUT / f"combo_ms_{key}.png"
        img.save(path, optimize=True)
        _quantize(path)
        total += path.stat().st_size
        print(f"{path.name:30} {img.size[0]}x{img.size[1]} {path.stat().st_size // 1024}KB")

    for style_key in dict.fromkeys(STYLE_BY_TIER):
        sub = 0
        label = render_art_text("连击", _slim(style_key, "black"), 150)
        lp = OUT / f"combo_label_{style_key}.png"
        label.save(lp, optimize=True)
        _quantize(lp)
        sub += lp.stat().st_size

        digit_style = _slim(style_key, "digit")
        for d in "0123456789":
            img = render_art_text(d, digit_style, 170)
            path = OUT / f"combo_digit_{style_key}_{d}.png"
            img.save(path, optimize=True)
            _quantize(path)
            sub += path.stat().st_size
        total += sub
        print(f"{style_key + ' 连击+数字':30} {sub // 1024}KB")

    print(f"全套共 {total // 1024}KB")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proto", action="store_true", help="只出原型图，不覆盖正式素材")
    args = ap.parse_args()
    print(build_prototype())
    print(build_hud_proto())
    if not args.proto:
        build_all()


if __name__ == "__main__":
    main()
