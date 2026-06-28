#!/usr/bin/env python3
"""
阶段九 · 统一生物体系 美术落地脚本（几乎零新生成）

把生物的「四形态」素材落地到 xiaochu2 项目规范路径：
  pet/{cid}.png            初始头像（128×128）
  pet/{cid}_s3.png         觉醒头像（128×128）
  enemy/{cid}.png          初级怪全身（tier1）
  enemy/{cid}_awakened.png 高级怪全身（tier2）

两类来源：
  1) xiao_chu 20 只：从 xiao_chu/assets/enemies/{avatar,stage} 复制重命名（四文件齐全）。
  2) 新 10 只 pet_*_003/004：头像已在项目内；无独立全身素材，
     以已存头像作为全身立绘的稳定 stand-in（省美术，避免依赖临时 grid）。

幂等：可重复执行；只覆盖目标文件。
"""
from __future__ import annotations

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent          # xiaochu2/
REPO = ROOT.parent                                      # dk_proj/
SRC_AVATAR = REPO / "xiao_chu/assets/enemies/avatar"
SRC_STAGE = REPO / "xiao_chu/assets/enemies/stage"
OUT_PET = ROOT / "minigame/images/pet"
OUT_ENEMY = ROOT / "minigame/images/enemy"

AVATAR_CANVAS = 128
AVATAR_MAX = 116
BODY_MAX_H = 280
BODY_MAX_W = 220

# cr_* 生物 → xiao_chu 素材 slug
XIAOCHU_MAP = {
    "pet_011": "ch13_golden_crane",
    "pet_012": "ch14_tide_manta",
    "pet_013": "ch15_thunder_cicada",
    "pet_014": "ch16_shadow_roc",
    "pet_015": "ch13_jadehorn_goat",
    "pet_016": "ch13_kunlun_jade_dragon",
    "pet_017": "ch15_star_deer",
    "pet_018": "ch16_chaos_bone_fox",
    "pet_019": "ch13_cloud_fox",
    "pet_020": "ch14_abyss_jellyfish",
    "pet_021": "ch14_frost_merseal",
    "pet_022": "ch14_guixu_xuanwhale",
    "pet_023": "ch16_void_eye",
    "pet_024": "ch15_red_sun_crow",
    "pet_025": "ch15_star_river_zhulong",
    "pet_026": "ch16_outer_demon_lord",
    "pet_027": "ch13_stone_ape",
    "pet_028": "ch14_guixu_turtle",
    "pet_029": "ch15_star_gear_beast",
    "pet_030": "ch16_rift_armor_beetle",
}

# 新 10 只（头像已在项目内，全身用头像 stand-in）
NEW_CREATURES = [
    "pet_001", "pet_002",
    "pet_003", "pet_004",
    "pet_005", "pet_006",
    "pet_007", "pet_008",
    "pet_009", "pet_010",
]


def trim_alpha(im: Image.Image, threshold: int = 12) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    a2 = a.point(lambda x: 255 if x > threshold else 0)
    bbox = Image.merge("RGBA", (r, g, b, a2)).getbbox()
    return im.crop(bbox) if bbox else im


def fit_canvas(im: Image.Image, canvas: int, content: int) -> Image.Image:
    im = trim_alpha(im)
    w, h = im.size
    if w == 0 or h == 0:
        return Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    scale = min(content / w, content / h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    out.paste(resized, ((canvas - nw) // 2, (canvas - nh) // 2), resized)
    return out


def fit_body(im: Image.Image, max_w: int, max_h: int) -> Image.Image:
    im = trim_alpha(im)
    w, h = im.size
    if w == 0 or h == 0:
        return im.convert("RGBA")
    scale = min(max_w / w, max_h / h, 1.0)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    return im.resize((nw, nh), Image.Resampling.LANCZOS)


def save_avatar(src: Path, dst: Path) -> None:
    fit_canvas(Image.open(src).convert("RGBA"), AVATAR_CANVAS, AVATAR_MAX).save(dst)


def save_body(src: Path, dst: Path) -> None:
    fit_body(Image.open(src).convert("RGBA"), BODY_MAX_W, BODY_MAX_H).save(dst)


def land_xiaochu() -> int:
    n = 0
    for cid, slug in XIAOCHU_MAP.items():
        pairs = [
            (SRC_AVATAR / f"{slug}_avatar.png", OUT_PET / f"{cid}.png", save_avatar),
            (SRC_AVATAR / f"{slug}_awakened_avatar.png", OUT_PET / f"{cid}_s3.png", save_avatar),
            (SRC_STAGE / f"{slug}.png", OUT_ENEMY / f"{cid}.png", save_body),
            (SRC_STAGE / f"{slug}_awakened.png", OUT_ENEMY / f"{cid}_awakened.png", save_body),
        ]
        for src, dst, fn in pairs:
            if not src.exists():
                raise FileNotFoundError(f"缺少素材: {src}")
            fn(src, dst)
            n += 1
    return n


def land_new() -> int:
    n = 0
    for cid in NEW_CREATURES:
        avatar = OUT_PET / f"{cid}.png"
        awakened = OUT_PET / f"{cid}_s3.png"
        if not avatar.exists() or not awakened.exists():
            raise FileNotFoundError(f"缺少头像: {avatar} / {awakened}")
        # 头像 stand-in 全身：放大到全身画幅，保持透明
        save_body(avatar, OUT_ENEMY / f"{cid}.png")
        save_body(awakened, OUT_ENEMY / f"{cid}_awakened.png")
        n += 2
    return n


def main() -> None:
    OUT_PET.mkdir(parents=True, exist_ok=True)
    OUT_ENEMY.mkdir(parents=True, exist_ok=True)
    a = land_xiaochu()
    b = land_new()
    print(f"落地完成：xiao_chu {a} 文件 + 新生物 {b} 文件 = {a + b}")


if __name__ == "__main__":
    main()
