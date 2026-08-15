#!/usr/bin/env python3
"""普攻弹道：现状 vs 提案。纯预览，不改运行时资源。

用真实刃图 + 真实亮色场景底，按 BattleFx.fireElementBladeVolley 的公式
把「现在画上去的尺寸/颜色」和「建议改完」并排放。所见即所得。
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FX = ROOT / "minigame" / "subpackages" / "pkg-fx" / "images" / "ui" / "fx"
ORB = ROOT / "minigame" / "images" / "orb"
BG = ROOT / "minigame" / "subpackages" / "pkg-scene" / "images" / "bg" / "scene_tower.jpg"
OUT = ROOT / "docs" / "ui-redesign" / "combo"
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"

W, H = 750, 980
# 飞行中点：宠物栏上方 → 敌人立绘，对齐真实弹道路径
FROM = (375, 780)
TO = (375, 210)

# 珠子色（现状 tint）vs 发光色（提案）
ORB_RGB = {
    "wood": (13, 138, 34),
    "fire": (214, 69, 58),
    "water": (10, 94, 240),
    "earth": (143, 90, 54),
    "metal": (217, 160, 8),
}
# 与 src/balance/ui.ts FX_ELEMENT_COLOR 对齐：黄 / 绿 / 蓝 / 红 / 橙
FX_RGB = {
    "metal": (255, 224, 70),
    "wood": (20, 255, 80),
    "water": (30, 150, 255),
    "fire": (255, 40, 30),
    "earth": (255, 140, 30),
}
LABEL = {
    "metal": "金 · 亮黄",
    "wood": "木 · 荧光绿",
    "water": "水 · 电光蓝",
    "fire": "火 · 正红",
    "earth": "土 · 暖橙",
}


def add_blend(dst: Image.Image, src: Image.Image, pos: tuple[int, int]) -> None:
    x, y = pos
    w, h = src.size
    box = (max(0, x), max(0, y), min(dst.width, x + w), min(dst.height, y + h))
    if box[0] >= box[2] or box[1] >= box[3]:
        return
    sub = dst.crop(box)
    sx, sy = box[0] - x, box[1] - y
    sc = src.crop((sx, sy, sx + box[2] - box[0], sy + box[3] - box[1]))
    a = np.asarray(sub, np.float32)
    b = np.asarray(sc, np.float32)
    ba = b[..., 3:4] / 255.0
    rgb = np.clip(a[..., :3] + b[..., :3] * ba, 0, 255)
    out = np.concatenate([rgb, a[..., 3:4]], axis=-1).astype(np.uint8)
    dst.paste(Image.fromarray(out, "RGBA"), box)


def tint_rgba(im: Image.Image, rgb: tuple[int, int, int], gain: float = 1.0) -> Image.Image:
    a = im.getchannel("A")
    if gain != 1.0:
        a = a.point(lambda v: min(255, int(v * gain)))
    return Image.merge("RGBA", (
        Image.new("L", im.size, rgb[0]),
        Image.new("L", im.size, rgb[1]),
        Image.new("L", im.size, rgb[2]), a))


def rotate(im: Image.Image, deg: float) -> Image.Image:
    return im.rotate(-deg, resample=Image.BICUBIC, expand=True)


def scene() -> Image.Image:
    canvas = Image.new("RGBA", (W, H), (238, 228, 200, 255))
    bg = Image.open(BG).convert("RGBA")
    bg = bg.resize((W, int(bg.height * W / bg.width)), Image.LANCZOS)
    canvas.alpha_composite(bg, (0, (H - bg.height) // 2 - 40))
    # 底部棋盘：亮色珠子是弹道必须压过的「噪声」
    names = ["fire", "wood", "water", "metal", "earth", "heart"]
    cell = 116
    board_y = 820
    for i, name in enumerate(names):
        o = Image.open(ORB / f"orb_{name}.png").convert("RGBA").resize((108, 108), Image.LANCZOS)
        canvas.alpha_composite(o, (28 + i * cell, board_y))
    return canvas


def place(canvas: Image.Image, im: Image.Image, cx: int, cy: int) -> None:
    add_blend(canvas, im, (cx - im.width // 2, cy - im.height // 2))


def along(t: float) -> tuple[int, int, float]:
    """二次贝塞尔，lane=0 的微弧。"""
    mid = (FROM[0] + 44, (FROM[1] + TO[1]) / 2)
    u = 1 - t
    x = u * u * FROM[0] + 2 * u * t * mid[0] + t * t * TO[0]
    y = u * u * FROM[1] + 2 * u * t * mid[1] + t * t * TO[1]
    dx = 2 * u * (mid[0] - FROM[0]) + 2 * t * (TO[0] - mid[0])
    dy = 2 * u * (mid[1] - FROM[1]) + 2 * t * (TO[1] - mid[1])
    return int(x), int(y), np.degrees(np.arctan2(dy, dx))


def current(elem: str) -> Image.Image:
    """严格按现在的公式：0.88 档、高度再压 0.75、尾迹用珠子色。"""
    canvas = scene()
    blade = Image.open(FX / f"fx_{elem}_blade.png").convert("RGBA")
    scale = 0.88
    bw, bh = int(128 * scale * 1.15), int(76 * scale * 0.75)
    body = blade.resize((bw, bh), Image.LANCZOS)
    color = ORB_RGB[elem]

    # 残影：每 3 帧一个、alpha 0.4、活 0.12s —— 中点附近留 2 个淡影
    for t, a in ((0.42, 0.22), (0.50, 0.32)):
        x, y, deg = along(t)
        g = rotate(body, deg)
        g.putalpha(g.getchannel("A").point(lambda v: int(v * a)))
        place(canvas, g, x, y)

    # 细光带 36×10、alpha 0.38、珠子色
    x, y, deg = along(0.58)
    streak = Image.new("RGBA", (36, 10), (*color, 90))
    streak = streak.filter(ImageFilter.GaussianBlur(2))
    place(canvas, rotate(streak, deg), x, y)

    x, y, deg = along(0.62)
    place(canvas, rotate(body, deg), x, y)

    # 命中图从 0.7 起跳，这里示意终点一小团
    impact = Image.open(FX / f"fx_{elem}_impact.png").convert("RGBA")
    impact = impact.resize((int(256 * 0.7), int(256 * 0.7)), Image.LANCZOS)
    impact.putalpha(impact.getchannel("A").point(lambda v: int(v * 0.55)))
    place(canvas, impact, TO[0], TO[1])
    return canvas


def proposed(elem: str) -> Image.Image:
    """白热核 + 饱和色晕 + 拉长尾迹。刃图还是同一张，只改尺寸/颜色/层次。"""
    canvas = scene()
    blade = Image.open(FX / f"fx_{elem}_blade.png").convert("RGBA")
    scale = 1.22
    bw, bh = int(128 * scale * 1.35), int(76 * scale * 1.05)
    body = blade.resize((bw, bh), Image.LANCZOS)
    glow = blade.resize((int(bw * 1.85), int(bh * 1.85)), Image.LANCZOS)
    glow = tint_rgba(glow, FX_RGB[elem], 0.95)
    color = FX_RGB[elem]

    # 尾迹：色晕先铺、白核后叠。色晕要够厚，否则五属性并排全是一道白光。
    for t, a, mul in ((0.34, 0.38, 1.45), (0.42, 0.52, 1.28), (0.50, 0.68, 1.12), (0.56, 0.82, 1.0)):
        x, y, deg = along(t)
        g = rotate(glow.resize((int(glow.width * mul), int(glow.height * mul)), Image.LANCZOS), deg)
        g.putalpha(g.getchannel("A").point(lambda v: int(v * a)))
        place(canvas, g, x, y)
        wash = Image.new("RGBA", (90, 36), (0, 0, 0, 0))
        ImageDraw.Draw(wash).ellipse([0, 0, 89, 35], fill=(*color, int(200 * a)))
        wash = wash.filter(ImageFilter.GaussianBlur(7))
        wr = rotate(wash, deg)
        canvas.alpha_composite(wr, (x - wr.width // 2, y - wr.height // 2))
        b = rotate(body, deg)
        b.putalpha(b.getchannel("A").point(lambda v: int(v * (a * 0.7 + 0.15))))
        place(canvas, b, x, y)

    x, y, deg = along(0.62)
    # 普通混合色板：ADD 冲不白的那一层实色
    plate = Image.new("RGBA", (int(bw * 1.15), int(bh * 0.8)), (0, 0, 0, 0))
    ImageDraw.Draw(plate).ellipse(
        [0, 0, plate.width - 1, plate.height - 1], fill=(*color, 170))
    plate = plate.filter(ImageFilter.GaussianBlur(8))
    pr = rotate(plate, deg)
    canvas.alpha_composite(pr, (x - pr.width // 2, y - pr.height // 2))
    place(canvas, rotate(glow, deg), x, y)
    place(canvas, rotate(body, deg), x, y)

    # 沿速度的亮带
    streak = Image.new("RGBA", (110, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(streak)
    d.ellipse([0, 2, 110, 20], fill=(*color, 200))
    streak = streak.filter(ImageFilter.GaussianBlur(4))
    place(canvas, rotate(streak, deg), x - 20, y + 8)

    impact = Image.open(FX / f"fx_{elem}_impact.png").convert("RGBA")
    impact = impact.resize((int(256 * 1.05), int(256 * 1.05)), Image.LANCZOS)
    halo = tint_rgba(impact, color, 0.45).resize((int(256 * 1.35), int(256 * 1.35)), Image.LANCZOS)
    place(canvas, halo, TO[0], TO[1])
    place(canvas, impact, TO[0], TO[1])
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(FONT, 28, index=1)
    small = ImageFont.truetype(FONT, 20, index=1)
    pad, head = 16, 44
    elems = ["metal", "wood", "water", "fire", "earth"]
    # 五属性并排：只看提案色相是否拉得开
    thumb_w, thumb_h = 300, 392
    sheet_w = pad * (len(elems) + 1) + thumb_w * len(elems)
    sheet_h = pad + head + thumb_h + pad
    sheet = Image.new("RGB", (sheet_w, sheet_h), (24, 22, 30))
    d = ImageDraw.Draw(sheet)
    d.text((pad, 10), "五属性弹道色相（黄 / 绿 / 蓝 / 红 / 橙）", font=font, fill=(255, 236, 170))
    for c, elem in enumerate(elems):
        im = proposed(elem).resize((thumb_w, thumb_h), Image.LANCZOS).convert("RGB")
        x = pad + c * (thumb_w + pad)
        d.text((x + 6, head - 22), LABEL[elem], font=small, fill=(236, 232, 240))
        sheet.paste(im, (x, head))
    dest = OUT / "blade_fx_elements.png"
    sheet.save(dest, quality=92)
    print(f"→ {dest}")

    cols = [("current", "现在：细 + 珠子色 + 几乎没尾"), ("proposed", "加饱和：厚 + 五色拉开")]
    rows = ["wood", "fire"]
    cell_w, cell_h = W, H
    sheet_w = pad * 3 + cell_w * 2
    sheet_h = pad + (cell_h + head + 8) * 2 + pad
    sheet = Image.new("RGB", (sheet_w, sheet_h), (24, 22, 30))
    d = ImageDraw.Draw(sheet)
    for r, elem in enumerate(rows):
        for c, (kind, title) in enumerate(cols):
            im = (current if kind == "current" else proposed)(elem).convert("RGB")
            x = pad + c * (cell_w + pad)
            y = pad + r * (cell_h + head + 8)
            d.text((x + 8, y + 6), f"{LABEL[elem]}  ·  {title}", font=font, fill=(255, 236, 170))
            sheet.paste(im, (x, y + head))
    dest = OUT / "blade_fx_compare.png"
    sheet.save(dest, quality=92)
    print(f"→ {dest}")

    # 中段特写：只看弹体本身，避免整屏缩小后看不出差别
    crop = Image.new("RGB", (pad * 3 + 420 * 2, 420 + head + pad * 2), (24, 22, 30))
    dc = ImageDraw.Draw(crop)
    for c, (kind, title) in enumerate(cols):
        im = (current if kind == "current" else proposed)("wood")
        x0, y0, _ = along(0.62)
        box = (x0 - 210, y0 - 180, x0 + 210, y0 + 180)
        cut = im.crop(box).resize((420, 360), Image.LANCZOS).convert("RGB")
        x = pad + c * (420 + pad)
        dc.text((x + 8, pad + 6), title, font=small, fill=(255, 236, 170))
        crop.paste(cut, (x, pad + head))
    dest2 = OUT / "blade_fx_compare_crop.png"
    crop.save(dest2, quality=92)
    print(f"→ {dest2}")


if __name__ == "__main__":
    main()
