#!/usr/bin/env python3
"""从全量 TTF 生成 UI 用子集：书法展示体 + 正文楷体（覆盖 src 内汉字）。"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHARS_FILE = ROOT / "tools" / "font_subset_chars.txt"

FONTS = (
    {
        "label": "MaShanZheng",
        "src": ROOT / "fonts_tmp" / "MaShanZheng-Regular.ttf",
        "out": ROOT
        / "minigame"
        / "subpackages"
        / "pkg-shop"
        / "fonts"
        / "MaShanZheng-Subset.ttf",
    },
    {
        "label": "LXGWWenKai",
        "src": ROOT / "fonts_tmp" / "LXGWWenKai-Regular.ttf",
        "out": ROOT
        / "minigame"
        / "subpackages"
        / "pkg-shop"
        / "fonts"
        / "LXGWWenKai-Subset.ttf",
    },
)

EXTRA = (
    "灵宠主动技能用途说明知道了当前碎片未拥有已拥有通用碎片"
    "升星时可折算为任意本体折算阶梯持有奖励收集挑战下一关"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    "0123456789 ×·◆.%+-/:，。！？、；：（）【】「」…—_℃★☆"
)


def collect_chars() -> str:
    chars: set[str] = set(EXTRA)
    for p in (ROOT / "src").rglob("*"):
        if p.suffix not in {".ts", ".tsx", ".json"}:
            continue
        t = p.read_text(encoding="utf-8", errors="ignore")
        for c in t:
            o = ord(c)
            # CJK + 常用全角标点
            if (
                0x4E00 <= o <= 0x9FFF
                or 0x3000 <= o <= 0x303F
                or 0xFF00 <= o <= 0xFFEF
            ):
                chars.add(c)
        for m in re.finditer(r"name:\s*'([^']+)'", t):
            chars |= set(m.group(1))
    text = "".join(sorted(chars))
    CHARS_FILE.write_text(text, encoding="utf-8")
    return text


def subset_one(src: Path, out: Path, uni_arg: str) -> None:
    from fontTools.subset import main as subset_main

    out.parent.mkdir(parents=True, exist_ok=True)
    sys.argv = [
        "pyftsubset",
        str(src),
        f"--unicodes={uni_arg}",
        f"--output-file={str(out)}",
        "--layout-features=*",
        "--notdef-glyph",
        "--notdef-outline",
        "--recommended-glyphs",
        "--name-IDs=*",
        "--name-legacy",
        "--name-languages=*",
    ]
    subset_main()


def main() -> int:
    text = collect_chars()
    unicodes = sorted({ord(c) for c in text})
    uni_arg = ",".join(f"U+{u:04X}" for u in unicodes)
    print(f"charset={len(unicodes)}")

    for item in FONTS:
        src: Path = item["src"]
        out: Path = item["out"]
        if not src.exists():
            print(f"missing full font: {src}", file=sys.stderr)
            return 1
        subset_one(src, out, uni_arg)
        print(f"{item['label']}: {out} ({out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
