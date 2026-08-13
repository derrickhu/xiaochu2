#!/usr/bin/env python3
"""连击背景特效烘焙 —— 亮色能量爆发方案。

为什么不用 PIXI.Graphics 现场画：
    圆环用 drawCircle、放射线用等分 moveTo/lineTo，出来的是数学上完美的圆和
    等长直线。人眼对「完美」极其敏感，一看就是代码画的。真实特效的边缘永远
    不规则、粗细会变、末端会散。这个差距靠调参数（更大更亮更多粒子）补不了。

为什么底是亮的不是暗的：
    先做过一版水墨，暗色墨团托字。失败的根因不是「有底」，而是底是暗的——
    暗色靠遮挡制造对比，压在五彩珠子上必然脏，玩家的原话是「黑色一大坨，
    还不如没有」。同一块底改成 ADD 混合的亮色，珠子非但不被遮黑还会被照亮，
    于是既撑得起场面又不脏。

产物（→ pkg-battle/images/ui/battle/combo/）：
    combo_energy.png      512  能量爆发主体，含向外甩的能量舌
    combo_rays.png        512  放射彩色层：宽光锥 + 彩色宽线
    combo_rays_core.png   512  放射白芯层：细白线，单给锐度
    combo_star_flare.png  256  六角星芒 + 横向长条

全部存「RGB 全白 + alpha 承载强度」，运行时 tint 成档位色，一套贴图吃所有档位。
放射拆成彩色层和白芯两张，是因为白芯不能被 tint 染色——白色细芯提供锐度，
染成档位色就糊了。

用法：
    python3 scripts/bake_combo_fx.py
    python3 scripts/bake_combo_fx.py --proto   # 深色底预览
"""
from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "minigame" / "subpackages" / "pkg-battle" / "images" / "ui" / "battle" / "combo"
PROTO_OUT = ROOT / "docs" / "ui-redesign" / "combo"

RGB = tuple[int, int, int]


def white_rgba(a: np.ndarray, blur: float = 0.0) -> Image.Image:
    """把强度场打包成「RGB 全白 + alpha」，运行时可任意 tint。"""
    size = a.shape[0]
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    if blur > 0:
        img = img.filter(ImageFilter.GaussianBlur(blur))
    w = Image.new("L", (a.shape[1], size), 255)
    return Image.merge("RGBA", (w, w, w, img))


def energy_burst(size: int, seed: int = 909) -> Image.Image:
    """能量爆发主体。

    形态上必须是「爆发」不是「雾团」：核心场负责体量，向外甩的能量舌负责动势。
    少了能量舌就是一团糊在屏幕上的光晕，撑不起高光时刻。
    """
    rng = np.random.default_rng(seed)
    ax = (np.arange(size, dtype=np.float32) + 0.5) / size * 2 - 1
    gx, gy = np.meshgrid(ax, ax)

    n = rng.random((7, 7)).astype(np.float32)
    up = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC),
                    np.float32) / 255.0
    # 核心场要够饱满：能量舌一旦压过核心，整团就从「能量」变成「星形」，
    # 撑不住文字也不像爆炸。舌是点缀，核心才是主角。
    d = np.hypot(gx / (0.74 + (up - 0.5) * 0.18), gy / (0.70 + (up - 0.5) * 0.20))
    field = np.clip(1.0 - d, 0.0, 1.0) ** 1.75
    field *= 0.66 + 0.34 * up

    for _ in range(rng.integers(9, 13)):
        ang = rng.random() * 2 * np.pi
        span = rng.uniform(0.62, 0.96)
        root = rng.uniform(0.10, 0.22)
        proj = gx * np.cos(ang) + gy * np.sin(ang)
        perp = np.abs(-gx * np.sin(ang) + gy * np.cos(ang))
        t = np.clip(proj / span, 0.0, 1.0)
        wdt = root * (1.0 - t) ** 1.5
        tongue = np.where(proj > 0, np.clip((wdt - perp) / (wdt + 1e-5), 0.0, 1.0), 0.0)
        field = np.maximum(field, tongue * (1.0 - t) * 0.82)

    # 外圈收口：不归零的话缩放采样会露出方形硬边
    field *= np.clip((1.0 - np.hypot(gx, gy)) / 0.07, 0.0, 1.0)
    return white_rgba(field * 0.92, size / 500)


def rays_layers(size: int, seed: int = 404) -> tuple[Image.Image, Image.Image]:
    """放射的彩色层和白芯层。

    只有细线的放射永远炸不起来，因为画面上缺少被照亮的大面积；只有光锥又没有
    锐度，糊成一片。宽光锥给体量、彩色宽线给存在感、白色细芯给锐度，三层缺一
    不可。白芯必须单独出图——被 tint 染成档位色就不白了，锐度也就没了。
    """
    rng = np.random.default_rng(seed)
    ax = (np.arange(size, dtype=np.float32) + 0.5) / size * 2 - 1
    gx, gy = np.meshgrid(ax, ax)

    cone = np.zeros((size, size), np.float32)
    for i in range(14):
        ang = (i / 14) * 2 * np.pi + rng.uniform(-0.3, 0.3)
        span = rng.uniform(0.62, 1.0)
        half = rng.uniform(0.07, 0.19)
        proj = gx * np.cos(ang) + gy * np.sin(ang)
        perp = np.abs(-gx * np.sin(ang) + gy * np.cos(ang))
        t = np.clip(proj / span, 0.0, 1.0)
        wdt = half * (0.35 + 0.65 * t)
        c = np.where(proj > 0, np.clip((wdt - perp) / (wdt + 1e-5), 0.0, 1.0), 0.0)
        cone = np.maximum(cone, c * (1.0 - t) ** 1.3 * rng.uniform(0.55, 1.0))
    cone = np.asarray(
        Image.fromarray((cone * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(size * 0.012)), np.float32) / 255.0

    # 宽线和细芯共用同一批角度，两层才对得上
    halo = Image.new("L", (size, size), 0)
    core = Image.new("L", (size, size), 0)
    dh, dc = ImageDraw.Draw(halo), ImageDraw.Draw(core)
    c0 = size / 2
    for i in range(30):
        ang = (i / 30) * 2 * np.pi + rng.uniform(-0.24, 0.24)
        r0 = size * 0.10 * rng.uniform(0.8, 1.2)
        r1 = size * 0.50 * rng.uniform(0.55, 1.0)
        p0 = (c0 + np.cos(ang) * r0, c0 + np.sin(ang) * r0)
        p1 = (c0 + np.cos(ang) * r1, c0 + np.sin(ang) * r1)
        wide = max(2, int(rng.uniform(4, 11) * size / 512))
        dh.line([p0, p1], fill=int(rng.uniform(150, 250)), width=wide)
        dc.line([p0, p1], fill=int(rng.uniform(180, 255)), width=max(1, wide // 3))

    halo_a = np.asarray(halo.filter(ImageFilter.GaussianBlur(size * 0.010)), np.float32) / 255.0
    core_a = np.asarray(core.filter(ImageFilter.GaussianBlur(size * 0.003)), np.float32) / 255.0
    edge = np.clip((1.0 - np.hypot(gx, gy)) / 0.06, 0.0, 1.0)
    # 光锥打底、宽线叠加而不是取 max：取 max 会让细线完全吃掉光锥，
    # 放射就退化成一把没有体量的针
    color = np.clip(cone * 1.0 + halo_a * 0.45, 0, 1) * edge
    return white_rgba(color), white_rgba(core_a * edge)


def star_flare(size: int = 256, points: int = 6) -> Image.Image:
    """六角星芒 + 横向长条。镜头光晕是「炫」最直给的元素，动作游戏的高光时刻
    几乎都有它。横向长条要压过其他角，那是招牌。

    全部用场函数算，不用画线：等宽直线的两端是平的，末端会留下一个矩形硬边，
    在深色底上一眼假。芒必须从中心向外连续变细并淡出。
    """
    n = size * 2
    ax = (np.arange(n, dtype=np.float32) + 0.5) / n * 2 - 1
    gx, gy = np.meshgrid(ax, ax)
    field = np.zeros((n, n), np.float32)

    def spike(ang: float, length: float, thin: float, gain: float) -> None:
        nonlocal field
        proj = gx * np.cos(ang) + gy * np.sin(ang)
        perp = np.abs(-gx * np.sin(ang) + gy * np.cos(ang))
        t = np.clip(np.abs(proj) / length, 0.0, 1.0)
        wdt = thin * (1.0 - t) ** 1.6 + 1e-5
        field = np.maximum(field, np.clip(1.0 - perp / wdt, 0.0, 1.0) ** 1.3
                           * (1.0 - t) ** 1.1 * gain)

    for i in range(points):
        ang = i / points * np.pi
        spike(ang, 0.92, 0.012, 0.85)
        spike(ang, 0.66, 0.045, 0.30)
    spike(0.0, 1.0, 0.020, 1.0)
    spike(0.0, 0.92, 0.070, 0.34)

    hot = np.clip(1.0 - np.hypot(gx, gy) / 0.10, 0.0, 1.0) ** 1.6
    field = np.clip(field + hot, 0, 1)
    field *= np.clip((1.0 - np.hypot(gx, gy)) / 0.05, 0.0, 1.0)
    return white_rgba(field, n * 0.004).resize((size, size), Image.LANCZOS)


def gold_flake(size: int = 64) -> Image.Image:
    """亮片粒子：不规则四边形 + 高光边，ADD 混合时像翻转的箔片。"""
    rng = np.random.default_rng(21)
    img = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size * 2
    pts = []
    for i in range(4):
        ang = i / 4 * 2 * np.pi + rng.uniform(-0.35, 0.35)
        rad = size * rng.uniform(1.15, 1.85)
        pts.append((c + np.cos(ang) * rad, c + np.sin(ang) * rad))
    d.polygon(pts, fill=(255, 240, 205, 255))
    d.polygon([pts[0], pts[1], pts[2]], fill=(255, 214, 140, 255))
    d.line([pts[0], pts[2]], fill=(255, 255, 246, 255), width=max(2, size // 12))
    return img.resize((size, size), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.4))


def quantize(path: Path) -> None:
    """256 色量化。这些贴图是单色 + alpha，量化后几乎无损，体积砍掉一多半。"""
    try:
        subprocess.run(["pngquant", "--force", "--skip-if-larger", "--speed", "1",
                        "--output", str(path), "256", str(path)], check=False,
                       capture_output=True)
    except FileNotFoundError:
        pass


def tint(img: Image.Image, rgb: RGB, gain: float = 1.0) -> Image.Image:
    a = img.getchannel("A")
    if gain != 1.0:
        a = a.point(lambda v: min(255, int(v * gain)))
    return Image.merge("RGBA", (
        Image.new("L", img.size, rgb[0]), Image.new("L", img.size, rgb[1]),
        Image.new("L", img.size, rgb[2]), a))


def make_proto(files: dict[str, Image.Image]) -> Path:
    """深色底预览。ADD 素材在白底上完全看不出层次，必须压深色看。"""
    PROTO_OUT.mkdir(parents=True, exist_ok=True)
    W, H = 1180, 560
    canvas = Image.new("RGBA", (W, H), (22, 20, 30, 255))
    accent = (162, 77, 255)
    ry = files["combo_rays.png"].resize((520, 520), Image.LANCZOS)
    canvas.alpha_composite(tint(ry, accent), (20, 20))
    rc = files["combo_rays_core.png"].resize((520, 520), Image.LANCZOS)
    canvas.alpha_composite(rc, (20, 20))
    en = files["combo_energy.png"].resize((520, 520), Image.LANCZOS)
    canvas.alpha_composite(tint(en, accent), (560, 20))
    sf = files["combo_star_flare.png"].resize((300, 300), Image.LANCZOS)
    canvas.alpha_composite(tint(sf, (255, 210, 120)), (860, 130))
    fl = files["combo_gold_flake.png"].resize((90, 90), Image.LANCZOS)
    canvas.alpha_composite(fl, (1060, 440))
    dest = PROTO_OUT / "combo_fx_energy_proto.png"
    canvas.convert("RGB").save(dest)
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proto", action="store_true", help="出深色底预览图")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    rays, rays_core = rays_layers(512)
    files: dict[str, Image.Image] = {
        "combo_energy.png": energy_burst(512),
        "combo_rays.png": rays,
        "combo_rays_core.png": rays_core,
        "combo_star_flare.png": star_flare(256),
        "combo_gold_flake.png": gold_flake(64),
    }
    for name, img in files.items():
        dest = OUT / name
        img.save(dest)
        quantize(dest)
        print(f"  {name:24s} {dest.stat().st_size / 1024:6.1f} KB")

    if args.proto:
        print(f"proto → {make_proto(files)}")


if __name__ == "__main__":
    main()
