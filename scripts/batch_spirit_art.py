#!/usr/bin/env python3
"""
灵宠四形态批产驱动：brief JSON → 逐只 prompt → 生图 → 切分归一化入库。

一只宠只需 1 次生图（1024×1024 四宫格），随后由
scripts/process_spirit_4form_grid.py 切成 4 张成品并 --install 进分包。

  # 只出 prompt（默认，不生图）：
  python3 scripts/batch_spirit_art.py --ids pet_031-pet_100 --prompts-only

  # 出图 + 入库（--gen gemini 需用户明确要求走 Gemini）：
  python3 scripts/batch_spirit_art.py --ids pet_031-pet_040 --gen gemini

  # 已有 raw 宫格时只做切分入库：
  python3 scripts/batch_spirit_art.py --ids pet_031-pet_100 --gen none --process

已入库的宠默认跳过（--force 覆盖），断点续跑安全。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PROMPT_DIR = REPO / "docs" / "prompt"
STYLE_COMMON = PROMPT_DIR / "spirit_q_4form_style_common.txt"
BRIEF_FILES = [
    PROMPT_DIR / "spirit_q_creatures_brief.json",
    PROMPT_DIR / "spirit_q_creatures_brief_v2.json",
]
ASSETS = Path("/Users/huyi/dk_proj/game_assets/xiaochu2/assets")
RAW_DIR = ASSETS / "raw" / "spirit_batch"
FINAL_ROOT = ASSETS / "final"
GEMINI = Path.home() / ".cursor" / "skills" / "gemini-image-gen" / "scripts" / "generate_images.py"
PROCESS = REPO / "scripts" / "process_spirit_4form_grid.py"

# 觉醒方向按属性给固定色板，避免逐只手写 —— 同属性成组看着才像一个体系
ELEMENT_AWAKEN = {
    "metal": "white-gold / pale platinum accents, cracked-gold rune seams, floating metal shards, concentric gold rune rings",
    "wood": "vivid jade-emerald accents, blooming blossoms and new vines, drifting leaf motes, verdant spirit rings",
    "water": "bright cyan-azure accents, ice crystals and pearl light, swirling water ribbons, frost rune rings",
    "fire": "blazing crimson-orange with gold ember accents, flame crown, rising sparks, sun-fire rune rings",
    "earth": "rich amber-ochre with crystal geode accents, floating stone plates, dust burst, earth rune rings",
}
ROLE_POSE = {
    "attacker": "aggressive forward battle pose, weapon or claws ready",
    "tank": "planted defensive stance, broad shoulders, guarding posture",
    "healer": "gentle soothing pose, soft palms open, kind expression",
    "support": "lively cheering pose, one paw/hand raised, buoyant expression",
}


def load_briefs() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in BRIEF_FILES:
        if not f.exists():
            continue
        for row in json.loads(f.read_text(encoding="utf-8")):
            out[row["id"]] = row
    return out


def parse_ids(spec: str, known: dict[str, dict]) -> list[str]:
    ids: list[str] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            lo, hi = part.split("-", 1)
            a, b = int(lo.split("_")[1]), int(hi.split("_")[1])
            ids += [f"pet_{n:03d}" for n in range(a, b + 1)]
        else:
            ids.append(part)
    missing = [i for i in ids if i not in known]
    if missing:
        raise SystemExit(f"brief 缺失: {', '.join(missing)}")
    return ids


def prompt_path(pet_id: str) -> Path:
    return PROMPT_DIR / f"spirit_q_{pet_id}_4form_prompt.txt"


def style_block() -> str:
    """
    定稿风格骨架，但**剔除所有含百分比的行**。

    实测生图模型会把 "70%–78% of cell height" 这类尺寸口径当成标注画进图里
    （带方括号刻度与百分比文字），成品直接废掉。构图口径改用文字描述表达。
    """
    lines = [l for l in STYLE_COMMON.read_text(encoding="utf-8").splitlines() if "%" not in l]
    return "\n".join(lines).rstrip()


FRAMING = (
    "FRAMING (describe only, never draw):\n"
    "- Left column = bust portraits: head and chest fill most of the cell, comfortably centered, "
    "small even margin around.\n"
    "- Right column = full-body standing figures: the figure is tall in its cell, feet resting just "
    "above the bottom edge with a thin margin.\n"
    "- Awakened figure keeps the same height and body mass as the base figure.\n"
    "- ABSOLUTELY NO measurement guides, rulers, brackets, arrows, percentages, dimension marks, "
    "grid lines, panel borders or annotations of any kind."
)


def render_prompt(row: dict) -> str:
    element = row["element"]
    role = row.get("role", "attacker")
    return "\n".join(
        [
            style_block(),
            "",
            FRAMING,
            "",
            f"SUBJECT {row['id']} 「{row['name']}」({element} element, {role}):",
            row["brief"] + ". Q-chibi spirit-pet proportions.",
            "",
            f"POSE: {ROLE_POSE.get(role, ROLE_POSE['attacker'])}.",
            "",
            "BASE (TOP-LEFT bust + TOP-RIGHT full body): muted everyday palette, simple gear, calm friendly look.",
            "",
            "AWAKENED (BOTTOM-LEFT bust + BOTTOM-RIGHT full body) — DRAMATIC upgrade, must read at a glance:",
            f"- Palette / VFX jump: {ELEMENT_AWAKEN[element]}",
            "- Gear evolves into ornate ascended armor / crest / ribbons, still inside the same cell mass",
            "- Eyes glow, elemental markings appear on body",
            "- Same body height band as base cells — NOT a giant",
            "- Face stays cute moe, never scary",
            "",
            "CELL MAP: 1) TOP-LEFT base bust 2) BOTTOM-LEFT awakened bust explosive "
            "3) TOP-RIGHT base full body 4) BOTTOM-RIGHT awakened full body explosive",
            "",
            "NO TEXT, no labels, no captions, no writing anywhere in the image.",
            "",
        ]
    )


def installed(pet_id: str) -> bool:
    return all(f.exists() for f in asset_paths(pet_id))


def asset_paths(pet_id: str) -> list[Path]:
    n = int(pet_id.split("_")[1])
    pkg = "pkg-enemy-cr" if n >= 11 else "pkg-enemy"
    pet_dir = REPO / "minigame/subpackages/pkg-pet/images/pet"
    enemy_dir = REPO / f"minigame/subpackages/{pkg}/images/enemy"
    return [
        pet_dir / f"{pet_id}.png",
        pet_dir / f"{pet_id}_s3.png",
        enemy_dir / f"{pet_id}.png",
        enemy_dir / f"{pet_id}_awakened.png",
    ]


# 抠图失败或宫格错位时成品会退化成近空白图，体积远小于正常档，用体积下界兜住
MIN_BYTES = {"avatar": 4 * 1024, "body": 40 * 1024}


def verify(ids: list[str]) -> list[str]:
    bad: list[str] = []
    for pet_id in ids:
        for i, p in enumerate(asset_paths(pet_id)):
            kind = "avatar" if i < 2 else "body"
            if not p.exists():
                bad.append(f"{pet_id}: 缺 {p.name}")
            elif p.stat().st_size < MIN_BYTES[kind]:
                bad.append(f"{pet_id}: {p.name} 仅 {p.stat().st_size // 1024}KB，疑似抠图失败")
    return bad


def generate(pet_id: str, model: str) -> bool:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out = RAW_DIR / f"{pet_id}_4form.png"
    cmd = [
        sys.executable,
        str(GEMINI),
        "--prompt-file",
        str(prompt_path(pet_id)),
        "--output",
        str(out),
        "--model",
        model,
        "--aspect-ratio",
        "1:1",
    ]
    r = subprocess.run(cmd, env={**__import__("os").environ, "GEMINI_IMAGE_REST_ONLY": "1"})
    return r.returncode == 0 and out.exists()


def process(pet_id: str) -> bool:
    grid = RAW_DIR / f"{pet_id}_4form.png"
    if not grid.exists():
        print(f"  [skip] 缺 raw 宫格 {grid.name}")
        return False
    cmd = [
        sys.executable,
        str(PROCESS),
        str(grid),
        "--pet-id",
        pet_id,
        "--out-dir",
        str(FINAL_ROOT / f"spirit_{pet_id}"),
        "--install",
    ]
    return subprocess.run(cmd).returncode == 0


def main() -> None:
    ap = argparse.ArgumentParser(description="Batch spirit 4-form art pipeline")
    ap.add_argument("--ids", required=True, help="pet_031-pet_100 或逗号分隔列表")
    ap.add_argument("--gen", choices=["gemini", "none"], default="none", help="生图方式")
    ap.add_argument("--model", default="gemini-3.1-flash-image-preview")
    ap.add_argument("--prompts-only", action="store_true", help="只写 prompt 文件")
    ap.add_argument("--process", action="store_true", help="用已有 raw 宫格做切分入库")
    ap.add_argument("--force", action="store_true", help="已入库也重跑")
    ap.add_argument("--verify", action="store_true", help="只校验入库成品完整性")
    ap.add_argument("--sleep", type=float, default=4.0, help="生图间隔秒（避免限流）")
    args = ap.parse_args()

    briefs = load_briefs()
    ids = parse_ids(args.ids, briefs)
    print(f"目标 {len(ids)} 只：{ids[0]} .. {ids[-1]}")

    if args.verify:
        bad = verify(ids)
        print("\n".join(bad) if bad else f"全部 {len(ids)} 只成品齐全")
        raise SystemExit(1 if bad else 0)

    ok, failed = 0, []
    for i, pet_id in enumerate(ids, 1):
        path = prompt_path(pet_id)
        path.write_text(render_prompt(briefs[pet_id]), encoding="utf-8")
        if args.prompts_only:
            ok += 1
            continue
        if installed(pet_id) and not args.force:
            print(f"[{i}/{len(ids)}] {pet_id} 已入库，跳过")
            ok += 1
            continue
        print(f"[{i}/{len(ids)}] {pet_id} 「{briefs[pet_id]['name']}」", flush=True)
        if args.gen == "gemini":
            if not generate(pet_id, args.model):
                print(f"  [fail] 生图失败 {pet_id}")
                failed.append(pet_id)
                continue
            time.sleep(args.sleep)
        if (args.gen != "none" or args.process) and not process(pet_id):
            failed.append(pet_id)
            continue
        ok += 1

    print(f"\n完成 {ok}/{len(ids)}" + (f"，失败：{', '.join(failed)}" if failed else ""))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
