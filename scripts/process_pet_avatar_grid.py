#!/usr/bin/env python3
"""
从 xiao_chu 风格 2×2 四宫格提取灵宠头像对：
  左上 = 初始（normal avatar）
  左下 = 觉醒（awakened avatar，★4 灵相）

流程：切分 → rembg → 裁透明边 → 居中缩放到 128×128 PNG。
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
CANVAS = 128
MAX_CONTENT = 112


def split_avatar_pair(grid_path: Path) -> tuple[Image.Image, Image.Image]:
    img = Image.open(grid_path).convert("RGBA")
    w, h = img.size
    mx, my = w // 2, h // 2
    normal = img.crop((0, 0, mx, my))
    awakened = img.crop((0, my, mx, h))
    return normal, awakened


def trim_alpha(im: Image.Image, threshold: int = 16) -> Image.Image:
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    a = a.point(lambda x: 255 if x > threshold else 0)
    im = Image.merge("RGBA", (r, g, b, a))
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def fit_canvas(im: Image.Image) -> Image.Image:
    im = trim_alpha(im)
    w, h = im.size
    if w == 0 or h == 0:
        return Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    scale = min(MAX_CONTENT / w, MAX_CONTENT / h)
    nw = max(1, round(w * scale))
    nh = max(1, round(h * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, ((CANVAS - nw) // 2, (CANVAS - nh) // 2), resized)
    return canvas


def process_pair(grid_path: Path, normal_out: Path, awakened_out: Path) -> None:
    print(f"Processing grid: {grid_path}", flush=True)
    session = new_session(MODEL, providers=PROVIDERS)
    normal_raw, awakened_raw = split_avatar_pair(grid_path)
    print(f"  split TL={normal_raw.size} BL={awakened_raw.size}", flush=True)

    for label, raw, out in (
        ("normal", normal_raw, normal_out),
        ("awakened", awakened_raw, awakened_out),
    ):
        print(f"  rembg {label}...", flush=True)
        cut = remove(raw.convert("RGBA"), session=session)
        final = fit_canvas(cut)
        out.parent.mkdir(parents=True, exist_ok=True)
        final.save(out, optimize=True)
        print(f"  saved {out} ({final.size}, {out.stat().st_size // 1024}KB)", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract normal + awakened pet avatars from 2x2 grid")
    parser.add_argument("grid", type=Path, help="1:1 2x2 grid PNG")
    parser.add_argument("normal_out", type=Path, help="Output path for normal avatar")
    parser.add_argument("awakened_out", type=Path, help="Output path for awakened avatar (_s3)")
    args = parser.parse_args()
    if not args.grid.exists():
        print(f"Grid not found: {args.grid}", file=sys.stderr)
        raise SystemExit(1)
    process_pair(args.grid, args.normal_out, args.awakened_out)


if __name__ == "__main__":
    main()
