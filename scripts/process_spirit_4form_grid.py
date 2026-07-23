#!/usr/bin/env python3
"""
从 2×2 Spirit 四形态宫格提取并归一化：

  左上 = 宠初始头像 → 128×128（内容区 ≤112）
  左下 = 宠觉醒头像 → 128×128
  右上 = 初级怪全身 → 512×640（高度约占 90%，脚底基线距底 ~5%）
  右下 = 高级怪全身 → 512×640

用法：
  python3 scripts/process_spirit_4form_grid.py \\
    /Users/huyi/dk_proj/game_assets/xiaochu2/assets/raw/spirit_batch/pet_001_4form.png \\
    --pet-id pet_001 \\
    --out-dir /Users/huyi/dk_proj/game_assets/xiaochu2/assets/final/spirit_pet_001 \\
    --install

  # 定稿锚点仍可从仓库 docs/ui 读取：
  #   docs/ui/spirit_q_sample_pet_001_4form_v2.png
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

os.environ["OMP_NUM_THREADS"] = "8"

from PIL import Image  # type: ignore
from rembg import new_session, remove  # type: ignore

MODEL = "birefnet-general"
PROVIDERS = ["CPUExecutionProvider"]

AVATAR_CANVAS = 128
AVATAR_MAX = 112

BODY_W = 512
BODY_H = 640
BODY_HEIGHT_RATIO = 0.90
BODY_FOOT_MARGIN = 0.05  # 脚底距下沿


def split_2x2(grid_path: Path) -> dict[str, Image.Image]:
    img = Image.open(grid_path).convert("RGBA")
    w, h = img.size
    mx, my = w // 2, h // 2
    return {
        "avatar": img.crop((0, 0, mx, my)),
        "avatar_s3": img.crop((0, my, mx, h)),
        "body": img.crop((mx, 0, w, my)),
        "body_awakened": img.crop((mx, my, w, h)),
    }


def trim_alpha(im: Image.Image, threshold: int = 16) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    a = a.point(lambda x: 255 if x > threshold else 0)
    im = Image.merge("RGBA", (r, g, b, a))
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit_avatar(im: Image.Image) -> Image.Image:
    im = trim_alpha(im)
    w, h = im.size
    if w == 0 or h == 0:
        return Image.new("RGBA", (AVATAR_CANVAS, AVATAR_CANVAS), (0, 0, 0, 0))
    scale = min(AVATAR_MAX / w, AVATAR_MAX / h)
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (AVATAR_CANVAS, AVATAR_CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, ((AVATAR_CANVAS - nw) // 2, (AVATAR_CANVAS - nh) // 2), resized)
    return canvas


def fit_body(im: Image.Image) -> Image.Image:
    """按高度归一化到统一画布，脚底落在固定基线。
    过宽时水平居中裁切，禁止再按宽缩小（否则觉醒光效会把主体压成半高）。
    """
    im = trim_alpha(im)
    w, h = im.size
    canvas = Image.new("RGBA", (BODY_W, BODY_H), (0, 0, 0, 0))
    if w == 0 or h == 0:
        return canvas
    target_h = max(1, round(BODY_H * BODY_HEIGHT_RATIO))
    scale = target_h / h
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    if nw > BODY_W:
        left = (nw - BODY_W) // 2
        resized = resized.crop((left, 0, left + BODY_W, nh))
        nw = BODY_W
    x = (BODY_W - nw) // 2
    y = BODY_H - round(BODY_H * BODY_FOOT_MARGIN) - nh
    y = max(0, min(y, BODY_H - nh))
    canvas.paste(resized, (x, y), resized)
    return canvas


def enemy_pkg_root(pet_id: str, minigame_root: Path) -> Path:
    """pet_011+ → pkg-enemy-cr；其余 → pkg-enemy。"""
    n = int(pet_id.split("_")[1])
    pkg = "pkg-enemy-cr" if n >= 11 else "pkg-enemy"
    return minigame_root / "subpackages" / pkg / "images" / "enemy"


def install_to_minigame(pet_id: str, saved: dict[str, Path], minigame_root: Path) -> None:
    pet_dir = minigame_root / "subpackages" / "pkg-pet" / "images" / "pet"
    enemy_dir = enemy_pkg_root(pet_id, minigame_root)
    pet_dir.mkdir(parents=True, exist_ok=True)
    enemy_dir.mkdir(parents=True, exist_ok=True)
    mapping = [
        (saved["avatar"], pet_dir / f"{pet_id}.png"),
        (saved["avatar_s3"], pet_dir / f"{pet_id}_s3.png"),
        (saved["body"], enemy_dir / f"{pet_id}.png"),
        (saved["body_awakened"], enemy_dir / f"{pet_id}_awakened.png"),
    ]
    for src, dst in mapping:
        dst.write_bytes(src.read_bytes())
        print(f"  install {dst.relative_to(minigame_root)}", flush=True)


def process_grid(grid_path: Path, pet_id: str, out_dir: Path) -> dict[str, Path]:
    print(f"Processing Spirit 4-form grid: {grid_path}", flush=True)
    session = new_session(MODEL, providers=PROVIDERS)
    cells = split_2x2(grid_path)
    out_dir.mkdir(parents=True, exist_ok=True)

    plan = [
        ("avatar", fit_avatar, out_dir / f"{pet_id}.png"),
        ("avatar_s3", fit_avatar, out_dir / f"{pet_id}_s3.png"),
        ("body", fit_body, out_dir / f"{pet_id}_body.png"),
        ("body_awakened", fit_body, out_dir / f"{pet_id}_body_awakened.png"),
    ]
    saved: dict[str, Path] = {}
    for key, fitter, out in plan:
        raw = cells[key]
        print(f"  rembg {key} {raw.size}...", flush=True)
        cut = remove(raw.convert("RGBA"), session=session)
        final = fitter(cut)
        final.save(out, optimize=True)
        saved[key] = out
        print(f"  saved {out.name} {final.size} {out.stat().st_size // 1024}KB", flush=True)
    return saved


def main() -> None:
    parser = argparse.ArgumentParser(description="Process Spirit 2x2 four-form grid with size normalize")
    parser.add_argument("grid", type=Path, help="1:1 2x2 grid PNG")
    parser.add_argument("--pet-id", required=True, help="e.g. pet_001")
    parser.add_argument("--out-dir", type=Path, required=True, help="Output directory")
    parser.add_argument(
        "--install",
        action="store_true",
        help="Copy normalized PNGs into minigame/subpackages pkg-pet / pkg-enemy(-cr)",
    )
    parser.add_argument(
        "--minigame-root",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "minigame",
        help="minigame root (default: <repo>/minigame)",
    )
    args = parser.parse_args()
    if not args.grid.exists():
        print(f"Grid not found: {args.grid}", file=sys.stderr)
        raise SystemExit(1)
    saved = process_grid(args.grid, args.pet_id, args.out_dir)
    if args.install:
        install_to_minigame(args.pet_id, saved, args.minigame_root)


if __name__ == "__main__":
    main()
