#!/usr/bin/env python3
"""连击特效方案预览 —— 纯设计验证，不产出任何运行时资源。

存在的理由：AI 概念图和实际能做出来的东西差距极大，照着概念图定方案会翻车。
这个脚本用**真实的珠子贴图、真实的连击金字、真实的真机尺寸**把候选方案合成
出来，所见即所得，选定后再动代码。

用法：
    python3 scripts/preview_combo_fx.py
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ORB_DIR = ROOT / "minigame" / "images" / "orb"
COMBO_DIR = ROOT / "minigame" / "subpackages" / "pkg-battle" / "images" / "ui" / "battle" / "combo"
BOARD_PANEL = ROOT / "minigame" / "subpackages" / "pkg-battle" / "images" / "ui" / "battle" / "battle_board_panel.png"
OUT = ROOT / "docs" / "ui-redesign" / "combo"

LABEL_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"

# 真机基准：logicWidth 750 ⇒ dmgFloatScale 2.0，棋盘 6×5、格宽 116
S = 2.0
CELL = (750 - 25 * 2) // 6
BOARD_W, BOARD_H = CELL * 6, CELL * 5
TIER_STYLE = ["gold", "ice", "amber", "blood", "violet", "gold", "mythic"]

# 每格一种珠子，固定排布，所有方案共用同一张底才比得出差别
ORB_GRID = [
    ["fire", "metal", "water", "wood", "fire", "heart"],
    ["water", "earth", "heart", "metal", "wood", "fire"],
    ["metal", "fire", "wood", "heart", "water", "earth"],
    ["wood", "heart", "earth", "fire", "metal", "water"],
    ["heart", "water", "fire", "wood", "earth", "metal"],
]


def board_bg() -> Image.Image:
    """真实珠子拼的棋盘。假棋盘（纯色圆）会低估遮挡感——真珠子有高光和渐变，
    压上暗色特效时的脏感比纯色圆明显得多。"""
    canvas = Image.new("RGBA", (BOARD_W, BOARD_H), (238, 232, 216, 255))
    if BOARD_PANEL.exists():
        panel = Image.open(BOARD_PANEL).convert("RGBA").resize((BOARD_W, BOARD_H), Image.LANCZOS)
        canvas.alpha_composite(panel)
    orbs = {}
    for row in range(5):
        for col in range(6):
            name = ORB_GRID[row][col]
            if name not in orbs:
                orbs[name] = Image.open(ORB_DIR / f"orb_{name}.png").convert("RGBA")
            o = orbs[name].resize((CELL - 6, CELL - 6), Image.LANCZOS)
            canvas.alpha_composite(o, (col * CELL + 3, row * CELL + 3))
    return canvas


def combo_row(combo: int, tier: int) -> tuple[Image.Image, float, float]:
    """按 ComboDisplay._layoutStatic 的公式拼出「N 连击」这一行。
    返回 (整行图, base 字号, 行宽)。"""
    style = TIER_STYLE[tier]
    base = (68 if tier >= 4 else 60 if tier >= 3 else 52 if tier >= 2
            else 44 if tier >= 1 else 28) * S
    mega, super_ = tier >= 4, tier >= 2
    num_h = base * (1.35 if mega else 1.22 if super_ else 1.1)
    suf_h = base * (0.95 if mega else 0.88 if super_ else 0.82)
    gap = max(6 * S, base * 0.12)

    digits = []
    for ch in str(combo):
        d = Image.open(COMBO_DIR / f"combo_digit_{style}_{ch}.png").convert("RGBA")
        k = num_h / d.height
        digits.append(d.resize((max(1, int(d.width * k)), int(num_h)), Image.LANCZOS))
    suf = Image.open(COMBO_DIR / f"combo_label_{style}.png").convert("RGBA")
    k = suf_h / suf.height
    suf = suf.resize((max(1, int(suf.width * k)), int(suf_h)), Image.LANCZOS)

    row_w = int(sum(d.width for d in digits) + gap + suf.width)
    row_h = int(max(num_h, suf_h) * 1.6)
    row = Image.new("RGBA", (row_w, row_h), (0, 0, 0, 0))
    x, cy = 0, row_h // 2
    for d in digits:
        row.alpha_composite(d, (x, int(cy - num_h / 2)))
        x += d.width
    row.alpha_composite(suf, (int(x + gap), int(cy - suf_h / 2 + base * 0.06)))
    return row, base, row_w


def add_blend(dst: Image.Image, src: Image.Image, pos: tuple[int, int]) -> None:
    """ADD 混合。亮色特效必须走 ADD，用 alpha_composite 会把底下的珠子盖掉，
    预览就骗人了。"""
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


def glow_from(shape: Image.Image, radius: float, rgb: tuple[int, int, int],
              gain: float) -> Image.Image:
    """从任意图形的 alpha 生成外发光。"""
    a = shape.getchannel("A").filter(ImageFilter.GaussianBlur(radius))
    a = a.point(lambda v: min(255, int(v * gain)))
    return Image.merge("RGBA", (
        Image.new("L", shape.size, rgb[0]),
        Image.new("L", shape.size, rgb[1]),
        Image.new("L", shape.size, rgb[2]), a))


def torn_band(w: int, h: int, rgb: tuple[int, int, int], seed: int) -> Image.Image:
    """撕裂边缘的横向能量带。矩形渐变一眼假，边缘必须被噪声啃掉。"""
    rng = np.random.default_rng(seed)
    ax = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ay = (np.arange(h, dtype=np.float32) + 0.5) / h * 2 - 1
    gx, gy = np.meshgrid(ax, ay)
    core = np.clip(1.0 - np.abs(gy) ** 1.6, 0.0, 1.0)
    core *= np.clip((1.0 - np.abs(gx) ** 2.4) * 1.6, 0.0, 1.0)
    n = rng.random((9, 33)).astype(np.float32)
    up = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
                    np.float32) / 255.0
    core *= 0.45 + 0.55 * up
    core = np.clip(core * 1.5, 0, 1)
    a8 = (core * 255).astype(np.uint8)
    return Image.merge("RGBA", (
        Image.new("L", (w, h), rgb[0]), Image.new("L", (w, h), rgb[1]),
        Image.new("L", (w, h), rgb[2]),
        Image.fromarray(a8).filter(ImageFilter.GaussianBlur(h * 0.06))))


def streaks(w: int, h: int, rgb: tuple[int, int, int], seed: int, count: int) -> Image.Image:
    """横向速度线：长短粗细不一，向两侧冲出画面。"""
    rng = np.random.default_rng(seed)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cy = h // 2
    for _ in range(count):
        y = cy + rng.uniform(-h * 0.42, h * 0.42)
        side = 1 if rng.random() < 0.5 else -1
        length = rng.uniform(w * 0.18, w * 0.46)
        x0 = w / 2 + side * rng.uniform(w * 0.10, w * 0.26)
        thick = max(1, int(rng.uniform(1.5, 5.0) * S / 2))
        alpha = int(rng.uniform(90, 220))
        d.line([(x0, y), (x0 + side * length, y)], fill=(*rgb, alpha), width=thick)
    return img.filter(ImageFilter.GaussianBlur(1.2))


def sparks(w: int, h: int, seed: int, count: int, spread: float,
           rgb: tuple[int, int, int], scale: float = 1.0) -> Image.Image:
    """飞散的亮片粒子，带运动拖尾。

    尺寸要按真机给足：第一版画得太秀气，在 750 宽的棋盘上等于没有。
    """
    rng = np.random.default_rng(seed)
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    for _ in range(count):
        ang = rng.random() * 2 * np.pi
        dist = rng.uniform(0.3, 1.0) * spread
        px, py = cx + np.cos(ang) * dist, cy + np.sin(ang) * dist * 0.72
        size = rng.uniform(5, 15) * S / 2 * scale
        tail = rng.uniform(2.5, 6.0) * size
        a = int(rng.uniform(170, 255))
        d.line([(px, py), (px - np.cos(ang) * tail, py - np.sin(ang) * tail * 0.72)],
               fill=(*rgb, int(a * 0.55)), width=max(1, int(size * 0.55)))
        d.ellipse([px - size / 2, py - size / 2, px + size / 2, py + size / 2],
                  fill=(*rgb, a))
    return img.filter(ImageFilter.GaussianBlur(1.0))


def flash(w: int, h: int, rgb: tuple[int, int, int], strength: float) -> Image.Image:
    """全屏泛光：连击那一瞬整块棋盘像被爆光照到。

    不遮任何东西，纯靠亮度变化传递冲击，是不加遮挡物又要有「炸」感时
    最好用的一招。
    """
    a = int(255 * strength)
    return Image.new("RGBA", (w, h), (*rgb, a))


def ragged_rays(w: int, h: int, rgb: tuple[int, int, int], seed: int,
                count: int, inner: float, outer: float) -> Image.Image:
    """放射亮线。

    两个讲究：等分等长的射线一眼就是代码画的，长短粗细亮度必须全部随机；
    单色细线在亮棋盘上看不见，得画成「彩色宽底 + 白色细芯」两层，白芯提供
    锐度、彩色宽底提供存在感。
    """
    rng = np.random.default_rng(seed)
    halo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    core = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dh, dc = ImageDraw.Draw(halo), ImageDraw.Draw(core)
    cx, cy = w / 2, h / 2
    for i in range(count):
        ang = (i / count) * 2 * np.pi + rng.uniform(-0.24, 0.24)
        r0 = inner * rng.uniform(0.80, 1.15)
        r1 = outer * rng.uniform(0.55, 1.25)
        p0 = (cx + np.cos(ang) * r0, cy + np.sin(ang) * r0 * 0.62)
        p1 = (cx + np.cos(ang) * r1, cy + np.sin(ang) * r1 * 0.62)
        wide = max(2, int(rng.uniform(5.0, 13.0) * S / 2))
        dh.line([p0, p1], fill=(*rgb, int(rng.uniform(150, 250))), width=wide)
        dc.line([p0, p1], fill=(255, 255, 255, int(rng.uniform(170, 255))),
                width=max(1, wide // 3))
    halo = halo.filter(ImageFilter.GaussianBlur(5.0))
    core = core.filter(ImageFilter.GaussianBlur(1.4))
    halo.alpha_composite(core)
    return halo


def light_cones(w: int, h: int, rgb: tuple[int, int, int], seed: int,
                count: int, reach: float) -> Image.Image:
    """宽光锥：从中心射出的三角光束，宽根尖梢。

    细线负责锐度，光锥负责体量——只有细线的放射永远「炸」不起来，因为画面上
    没有被照亮的大面积。
    """
    rng = np.random.default_rng(seed)
    ax = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ay = (np.arange(h, dtype=np.float32) + 0.5) / h * 2 - 1
    gx, gy = np.meshgrid(ax, ay)
    ey = gy * (h / w)
    field = np.zeros((h, w), np.float32)
    for i in range(count):
        ang = (i / count) * 2 * np.pi + rng.uniform(-0.3, 0.3)
        span = reach * rng.uniform(0.55, 1.15)
        half = rng.uniform(0.05, 0.16)
        proj = gx * np.cos(ang) + ey * np.sin(ang)
        perp = np.abs(-gx * np.sin(ang) + ey * np.cos(ang))
        t = np.clip(proj / span, 0.0, 1.0)
        wdt = half * (0.35 + 0.65 * t)
        cone = np.where(proj > 0, np.clip((wdt - perp) / (wdt + 1e-5), 0.0, 1.0), 0.0)
        field = np.maximum(field, cone * (1.0 - t) ** 1.3 * rng.uniform(0.55, 1.0))
    a8 = (np.clip(field, 0, 1) * 255).astype(np.uint8)
    img = Image.merge("RGBA", (
        Image.new("L", (w, h), rgb[0]), Image.new("L", (w, h), rgb[1]),
        Image.new("L", (w, h), rgb[2]),
        Image.fromarray(a8).filter(ImageFilter.GaussianBlur(w * 0.012))))
    return img


def energy_blob(w: int, h: int, rgb: tuple[int, int, int], seed: int,
                core: float = 1.0) -> Image.Image:
    """亮色能量爆发 —— 替代黑墨团的那个「底」。

    水墨失败的根因不是「有底」，而是底是暗的：暗色底靠遮挡制造对比，压在
    五彩珠子上必然脏。同一块底改成 ADD 混合的亮色，珠子非但不被遮黑还会被
    照亮，于是既撑得起场面又不脏。

    形态上必须是「爆发」不是「雾团」：小而亮的热核负责刺眼，饱和主色负责
    颜色，向外甩的能量舌负责动势。少了能量舌就是一团糊在屏幕上的光晕。
    """
    rng = np.random.default_rng(seed)
    ax = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ay = (np.arange(h, dtype=np.float32) + 0.5) / h * 2 - 1
    gx, gy = np.meshgrid(ax, ay)
    # 各向同性坐标，用来算能量舌，免得舌被画幅比例拉扁
    ey = gy * (h / w)

    n = rng.random((7, 13)).astype(np.float32)
    up = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC),
                    np.float32) / 255.0
    d = np.hypot(gx / (0.74 + (up - 0.5) * 0.26), gy / (0.70 + (up - 0.5) * 0.30))
    field = np.clip(1.0 - d, 0.0, 1.0) ** 1.5
    field *= 0.6 + 0.4 * up

    # 能量舌：宽根尖梢，长短随机，把「团」撑成「爆」
    for _ in range(rng.integers(9, 14)):
        ang = rng.random() * 2 * np.pi
        span = rng.uniform(0.55, 1.02)
        root = rng.uniform(0.10, 0.26)
        proj = gx * np.cos(ang) + ey * np.sin(ang)
        perp = np.abs(-gx * np.sin(ang) + ey * np.cos(ang))
        t = np.clip(proj / span, 0.0, 1.0)
        wdt = root * (1.0 - t) ** 1.5
        tongue = np.where(proj > 0, np.clip((wdt - perp) / (wdt + 1e-5), 0.0, 1.0), 0.0)
        field = np.maximum(field, tongue * (1.0 - t) * 0.95)

    # 热核压得很小：铺大了会把整块棋盘洗白，颜色也一起冲没
    hot = np.clip(1.0 - np.hypot(gx / 0.30, gy / 0.26), 0.0, 1.0) ** 2.4 * core

    # 主色按 field 的高次方增强饱和，让中层是实打实的橙/紫而不是白雾
    sat = np.clip(field * 1.35, 0, 1)
    r = np.clip(rgb[0] * sat + 255 * hot, 0, 255)
    g = np.clip(rgb[1] * sat + 255 * hot, 0, 255)
    b = np.clip(rgb[2] * sat + 255 * hot, 0, 255)
    a = np.clip((field * 0.82 + hot) * 255, 0, 255)
    out = np.stack([r, g, b, a], axis=-1).astype(np.uint8)
    return Image.fromarray(out, "RGBA").filter(ImageFilter.GaussianBlur(w * 0.005))


def star_flare(size: int, rgb: tuple[int, int, int], points: int = 6,
               streak: float = 2.6) -> Image.Image:
    """六角星芒 + 横向长条。镜头光晕是「炫」最直给的元素，
    动作游戏的高光时刻几乎都有它。"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size / 2
    for i in range(points):
        ang = i / points * np.pi
        for j, (ln, wd, al) in enumerate(((0.48, 5, 220), (0.40, 11, 90), (0.30, 21, 40))):
            d.line([(c - np.cos(ang) * size * ln, c - np.sin(ang) * size * ln),
                    (c + np.cos(ang) * size * ln, c + np.sin(ang) * size * ln)],
                   fill=(255, 255, 255, al) if j == 0 else (*rgb, al),
                   width=int(wd * S / 2))
    # 横向长条压过其他角，anamorphic flare 的招牌
    for j, (wd, al) in enumerate(((4, 255), (10, 120), (26, 46))):
        d.line([(c - size * 0.5 * streak, c), (c + size * 0.5 * streak, c)],
               fill=(255, 255, 255, al) if j == 0 else (*rgb, al), width=int(wd * S / 2))
    return img.filter(ImageFilter.GaussianBlur(size * 0.012))


def chromatic(img: Image.Image, off: int) -> Image.Image:
    """RGB 通道错位。色散是廉价但极其有效的「高级感」来源，
    白色冲击波不带色散就是一根白线。"""
    r, g, b, a = img.split()
    r = ImageChops.offset(r, -off, 0)
    b = ImageChops.offset(b, off, 0)
    return Image.merge("RGBA", (r, g, b, a))


def shock_ring(w: int, h: int, rgb: tuple[int, int, int], thin: float = 0.055) -> Image.Image:
    """冲击环：极细、椭圆、边缘羽化，画完做色散。"""
    ax = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ay = (np.arange(h, dtype=np.float32) + 0.5) / h * 2 - 1
    gx, gy = np.meshgrid(ax, ay)
    d = np.hypot(gx, gy)
    band = np.clip(1.0 - np.abs(d - 0.82) / thin, 0.0, 1.0) ** 1.4
    a8 = (np.clip(band, 0, 1) * 255).astype(np.uint8)
    ring = Image.merge("RGBA", (
        Image.new("L", (w, h), 255), Image.new("L", (w, h), 255),
        Image.new("L", (w, h), 255),
        Image.fromarray(a8).filter(ImageFilter.GaussianBlur(2.0))))
    return chromatic(ring, int(4 * S / 2))


def blade(w: int, h: int, rgb: tuple[int, int, int]) -> Image.Image:
    """细横向光刃：贴着文字中线扫过的一道亮线，两端收尖。"""
    ax = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ay = (np.arange(h, dtype=np.float32) + 0.5) / h * 2 - 1
    gx, gy = np.meshgrid(ax, ay)
    core = np.clip(1.0 - np.abs(gy) ** 0.8, 0.0, 1.0) ** 2.2
    core *= np.clip(1.0 - np.abs(gx) ** 1.8, 0.0, 1.0)
    a8 = (np.clip(core * 1.4, 0, 1) * 255).astype(np.uint8)
    return Image.merge("RGBA", (
        Image.new("L", (w, h), rgb[0]), Image.new("L", (w, h), rgb[1]),
        Image.new("L", (w, h), rgb[2]),
        Image.fromarray(a8).filter(ImageFilter.GaussianBlur(h * 0.10))))


# 特效色板。刻意不直接沿用文字色（COMBO_MILESTONES）：棋盘底是米黄的、还铺满
# 金色珠子，橙和金这两档一旦照搬字色就会融进背景，亮度再高也不跳。冷色和洋红
# 这类跟暖底对色相的颜色才抢得出来。
#
# hot 是白热核强度：金色那档没法靠色相区分，只能靠刺眼的白热核压过背景。
FX_RGB = [(255, 150, 30), (56, 204, 255), (255, 45, 149), (255, 42, 90),
          (162, 77, 255), (255, 96, 10), (255, 42, 106)]
FX_HOT = [1.0, 1.0, 1.0, 1.0, 1.0, 1.15, 1.0]


def scene(combo: int, tier: int, plan: str) -> Image.Image:
    """把一个方案画在真实棋盘上。"""
    canvas = board_bg()
    row, base, row_w = combo_row(combo, tier)
    cx, cy = BOARD_W // 2, int(BOARD_H * 0.34)
    ti = min(tier, len(FX_RGB) - 1)
    accent = FX_RGB[ti]
    hot = FX_HOT[ti]
    warm = (255, 176, 60) if tier < 2 else (255, 120, 70) if tier < 4 else (255, 80, 90)

    def put_glow(boost: float = 1.0) -> None:
        """贴着字形的外发光。两层：一层紧贴字缘提亮度，一层放大扩散给体积。

        高档位要主动减弱：字号本身大了一倍，同样的系数下光晕面积翻几倍，
        ADD 混合会把周围珠子直接洗白。
        """
        gain = (1.7 if tier >= 4 else 2.2) * boost
        g = glow_from(row, base * 0.24, accent, gain)
        big = g.resize((int(g.width * 1.10), int(g.height * 1.10)), Image.LANCZOS)
        add_blend(canvas, big, (cx - big.width // 2, cy - big.height // 2))
        add_blend(canvas, g, (cx - g.width // 2, cy - g.height // 2))

    def put_sparks(count: int, scale: float = 1.0) -> None:
        sp = sparks(BOARD_W, BOARD_H, 7, count, row_w * 0.62, (255, 232, 176), scale)
        add_blend(canvas, sp, (0, cy - sp.height // 2))

    def baked(name: str, w: int, h: int, rgb: tuple[int, int, int] | None,
              gain: float = 1.0) -> Image.Image:
        """加载烘焙产物并 tint。预览必须吃真实贴图，否则验证的是 numpy 里那份
        算法，而不是最终进包的那张图。"""
        im = Image.open(COMBO_DIR / name).convert("RGBA").resize((w, h), Image.LANCZOS)
        a = im.getchannel("A")
        if gain != 1.0:
            a = a.point(lambda v: min(255, int(v * gain)))
        if rgb is None:
            r, g, b, _ = im.split()
            return Image.merge("RGBA", (r, g, b, a))
        return Image.merge("RGBA", (
            Image.new("L", im.size, rgb[0]), Image.new("L", im.size, rgb[1]),
            Image.new("L", im.size, rgb[2]), a))

    def put_blob(scale: float = 1.0, core: float = 1.0) -> None:
        bw = int(min(row_w * 2.1, BOARD_W * 1.1) * scale)
        bh = int(bw * 0.66)
        add_blend(canvas, baked("combo_energy.png", bw, bh, accent, 0.95),
                  (cx - bw // 2, cy - bh // 2))
        # 白热核：复用现成的软光斑，压得比能量团小得多，铺大了会洗白棋盘
        hw = int(bw * 0.34 * core * hot)
        hh = int(hw * 0.62)
        add_blend(canvas, baked("combo_flare.png", hw, hh, (255, 250, 240), 0.85),
                  (cx - hw // 2, cy - hh // 2))

    def put_flare(scale: float = 1.0) -> None:
        fw = int(row_w * 1.9 * scale)
        fh = int(fw * 0.5)
        add_blend(canvas, baked("combo_star_flare.png", fw, fh, (255, 236, 190), 0.9),
                  (cx - fw // 2, cy - fh // 2))

    def put_rays(scale: float = 1.0) -> None:
        rw = int(min(row_w * 2.9, BOARD_W * 1.5) * scale)
        rh = int(rw * 0.72)
        pos = (cx - rw // 2, cy - rh // 2)
        add_blend(canvas, baked("combo_rays.png", rw, rh, accent, 0.95), pos)
        add_blend(canvas, baked("combo_rays_core.png", rw, rh, None, 0.9), pos)

    if plan == "p2max":
        add_blend(canvas, flash(BOARD_W, BOARD_H, accent, 0.07), (0, 0))
        put_rays()
        put_blob()
        put_flare()
        bl_ = blade(int(BOARD_W * 1.02), int(base * 0.7), (255, 246, 224))
        add_blend(canvas, bl_, (cx - bl_.width // 2, cy - bl_.height // 2))
        put_glow(1.45)
        put_sparks(42, 1.4)

    elif plan == "settle":
        # 爆发散完后「停」在屏幕上的样子。这才是玩家盯着最久的画面：放射早就
        # 冲没了，留下的只有能量底 + 热核 + 星芒。水墨那版翻车就翻在这一帧——
        # 炸开的瞬间还行，停下来是一坨横屏黑影。
        peak = [0.26, 0.42, 0.54, 0.60, 0.66, 0.70, 0.72][min(tier, 6)]
        ew = int(min(max(row_w * 2.1, base * 4.2), 750 * 1.1))
        eh = int(ew * 0.66)
        add_blend(canvas, baked("combo_energy.png", ew, eh, accent, peak),
                  (cx - ew // 2, cy - eh // 2))
        hw = int(ew * 0.34 * hot * 0.9)
        hh = int(hw * 0.62)
        add_blend(canvas, baked("combo_flare.png", hw, hh, (255, 250, 240), 0.45),
                  (cx - hw // 2, cy - hh // 2))
        if tier >= 2:
            fw = int(row_w * 1.9 * 1.12)
            fh = int(fw * 0.5)
            add_blend(canvas, baked("combo_star_flare.png", fw, fh, (255, 236, 190), 0.38),
                      (cx - fw // 2, cy - fh // 2))

    elif plan == "ink":
        ink = Image.open(COMBO_DIR / "combo_ink_burst_0.png").convert("RGBA")
        ink_w = int(min(max(row_w * 1.72, base * 3.9), 750 * 1.05))
        ink = ink.resize((ink_w, ink_w), Image.LANCZOS)
        rgb = (46, 10, 20) if tier >= 4 else (30, 12, 48) if tier >= 2 else (20, 16, 25)
        peak = 0.9 if tier >= 4 else 0.84 if tier >= 2 else 0.76
        a = ink.getchannel("A").point(lambda v: int(v * peak))
        t = Image.merge("RGBA", (Image.new("L", ink.size, rgb[0]),
                                 Image.new("L", ink.size, rgb[1]),
                                 Image.new("L", ink.size, rgb[2]), a))
        canvas.alpha_composite(t, (cx - t.width // 2, cy - t.height // 2))

    elif plan == "band":
        bw, bh = int(BOARD_W * 1.02), int(base * 2.4)
        band = torn_band(bw, bh, warm, 11)
        add_blend(canvas, band, (cx - bw // 2, cy - bh // 2))
        st = streaks(BOARD_W, int(base * 2.0), (255, 232, 190), 5, 26)
        add_blend(canvas, st, (0, cy - st.height // 2))
        g = glow_from(row, base * 0.22, (255, 245, 220), 1.8)
        add_blend(canvas, g, (cx - g.width // 2, cy - g.height // 2))

    elif plan == "arc":
        # 两道亮弧从文字两侧扫出，弧只画一段，不闭合成圈
        arc = Image.new("RGBA", (BOARD_W, BOARD_H), (0, 0, 0, 0))
        d = ImageDraw.Draw(arc)
        rx, ry = int(row_w * 0.86), int(base * 1.5)
        for k, (a0, a1) in enumerate(((196, 344), (16, 164))):
            for j in range(3):
                wdt = max(2, int((7 - j * 2) * S / 2))
                off = j * int(base * 0.16)
                d.arc([cx - rx - off, cy - ry - off, cx + rx + off, cy + ry + off],
                      a0 + j * 6, a1 - j * 6, fill=(*warm, 210 - j * 60), width=wdt)
        arc = arc.filter(ImageFilter.GaussianBlur(2.2))
        add_blend(canvas, arc, (0, 0))
        st = streaks(BOARD_W, int(base * 2.6), (255, 236, 200), 9, 20)
        add_blend(canvas, st, (0, cy - st.height // 2))
        sp = sparks(BOARD_W, BOARD_H // 2, 3, 20, row_w * 0.7, (255, 214, 140))
        add_blend(canvas, sp, (0, cy - sp.height // 2))

    elif plan == "clean":
        sp = sparks(BOARD_W, BOARD_H // 2, 21, 30, row_w * 0.66, (255, 226, 160))
        add_blend(canvas, sp, (0, cy - sp.height // 2))

    canvas.alpha_composite(row, (cx - row.width // 2, cy - row.height // 2))
    return canvas


# 里程碑档位：3 破 / 6 无双 / 9 神威 / 12 天选 / 15 传说 / 18 神话
TIERS = [(3, 1), (6, 2), (12, 4), (15, 5)]

ROWS = [
    ("p2max", "爆发瞬间（约第 5 帧）"),
    ("settle", "散完后停留的画面（约第 30 帧）"),
    ("none", "对照：什么都不加"),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    font = ImageFont.truetype(LABEL_FONT, 26, index=1)
    small = ImageFont.truetype(LABEL_FONT, 22, index=1)
    pad, head, rowhead = 12, 34, 42
    W = len(TIERS) * (BOARD_W + pad) + pad
    H = len(ROWS) * (BOARD_H + head + rowhead + pad) + pad
    sheet = Image.new("RGB", (W, H), (24, 22, 30))
    d = ImageDraw.Draw(sheet)
    for r, (plan, label) in enumerate(ROWS):
        y0 = pad + r * (BOARD_H + head + rowhead + pad)
        d.text((pad + 4, y0 + 6), label, font=font, fill=(255, 236, 160))
        for c, (combo, tier) in enumerate(TIERS):
            im = scene(combo, tier, plan).convert("RGB")
            x = pad + c * (BOARD_W + pad)
            y = y0 + rowhead
            d.text((x + 4, y + 4), f"{combo} 连击 · tier{tier}", font=small,
                   fill=(232, 228, 236))
            sheet.paste(im, (x, y + head))
    dest = OUT / "combo_fx_tiers.png"
    sheet.save(dest)
    print(f"→ {dest}")


if __name__ == "__main__":
    main()
