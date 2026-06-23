#!/usr/bin/env python3
"""
批量重生 xiaochu2 阶段八新增 10 只灵宠头像对（初始 + 觉醒）。

规范（对齐 xiao_chu）：
  每只宠 1 张 1:1 四宫格 → 取左上=初始、左下=觉醒 → rembg → 128×128
  输出：minigame/images/pet/{pet_id}.png 与 {pet_id}_s3.png
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GEMINI = Path.home() / ".cursor/skills/gemini-image-gen/scripts/generate_images.py"
PROCESS = ROOT / "scripts/process_pet_avatar_grid.py"
OUT_DIR = ROOT / "minigame/images/pet"
WORK = ROOT / ".tmp_pet_gen"
REF = OUT_DIR / "pet_metal_001.png"

STYLE_REF = """UNIFIED STYLE FOR ALL 4 PANELS: Chinese ink wash painting inspired with soft cel-shading, calligraphy brush-style black ink outlines with varying thickness, rich vibrant colors mixing traditional Chinese pigments with pastel accents, fluffy soft texture, warm inviting Chinese Xianxia kawaii aesthetic, NOT Western fantasy, NOT photorealistic, NOT 3D rendered, clean sharp ink-line edges for easy cutout on light gray #E0E0E0 background.

STRICTLY FORBIDDEN: any text, letters, watermark, symbols, seals. STRICTLY FORBIDDEN: white outline outside black ink outlines, glow, blur, lens flare. STRICTLY FORBIDDEN: humanoid form, human face. Every character fully contained within its panel."""

GRID_TEMPLATE = """A single 1:1 square image divided into a 2×2 grid of 4 equal panels on one canvas, solid plain single-color background light gray #E0E0E0 across the entire image. All 4 panels depict the EXACT SAME creature species with IDENTICAL base body colors, fur/scale patterns, eye color, face shape, and art style — only accessories and evolution differ between normal (top) and awakened (bottom).

TOP-LEFT PANEL — NORMAL FORM AVATAR: half-body bust portrait head to mid-torso, adorable chibi creature, big head small body ratio 3:1, centered with margin. Large sparkling animal eyes. Warm cute expression.

TOP-RIGHT PANEL — NORMAL FORM FULL BODY: same normal creature, front-facing, battle-ready stance, fills 70-80% panel height.

BOTTOM-LEFT PANEL — AWAKENED FORM AVATAR: SAME species, upgraded gold/jewel accessories, richer colors, subtle body evolution. Same bust framing. Still cute and charming.

BOTTOM-RIGHT PANEL — AWAKENED FORM FULL BODY: awakened creature, front-facing, different powerful pose from top-right.

{style}

NORMAL FORM DESCRIPTION: {normal}
AWAKENED FORM UPGRADES: {awakened}
"""

PETS: list[tuple[str, str, str]] = [
    ("pet_metal_003", "Young iron rhino cub with slate-gray plates and cream belly, stubby horn, amber eyes, small bronze nose ring, cracked metal shoulder plates like baby armor, short tail. Battle pose: lowered head showing back plates.",
     "Evolved rhino spirit with polished steel plates traced in gold rivets, glowing amber cracks between armor segments, ornate bronze forehead gem, golden nose ring chain, thicker horn with gold tip, richer gray-cream fur. More regal confident expression."),
    ("pet_metal_004", "Elegant sword-fox girl beast with silver fur, one small katana hairpin in fox topknot, sharp golden eyes, white and indigo robes with metal trim, slim fluffy tail with silver tip. Cute focused expression.",
     "Awakened blade-fox with dual floating spirit swords behind shoulders, gold-trimmed lacquer armor plates, longer ornate hairpin becoming crown-like, silver fur with platinum streaks, jeweled forehead mark, confident battle maiden aura while staying chibi cute."),
    ("pet_wood_003", "Small vine archer squirrel with moss-green fur, tiny living-wood crossbow on back, acorn quiver, leaf bandana, bright hazel eyes, fluffy tail with vine wrap. Playful alert expression.",
     "Awakened forest ranger squirrel with enchanted wood crossbow sprouting leaves, golden vine arm guards, emerald leaf cloak, sharper antler-like twig horns, richer green-gold fur patterns, multiple tiny arrow fletchings glowing softly."),
    ("pet_wood_004", "Gentle fawn healer with soft jade-green eyes, small antler nubs, leaf crown, herb pouch at neck, cream and sage fur, pink nose, dewdrop earrings. Serene caring smile.",
     "Sacred healer deer with blossoming antlers holding tiny glowing herbs, golden leaf shawl, jade bead necklace, richer sage and white fur, flower petals in mane, warm divine healer aura while remaining adorable chibi."),
    ("pet_water_003", "Delicate ice crane chick with powder-blue wing tips, tiny crystal crest on head, round sapphire eyes, silver leg bands, soft white-gray feathers, small bell on ribbon. Graceful shy expression.",
     "Awakened frost crane with longer crystal crest, frost-tipped wing feathers like ice shards, jade and silver neck rings, brighter sapphire eyes with gold star highlights, elegant frost patterns on chest, serene confident pose."),
    ("pet_water_004", "Small ice dragon cub with pearlescent blue scales, stubby horns, big teal eyes, tiny fin-wings, cloud-white belly, ice crystal on chest. Proud curious expression.",
     "Majestic young ice dragon king with crystal horn crown, longer fin-wings with frost edges, deep azure scales with silver filigree, glowing chest ice gem, golden under-jaw whiskers, regal but still chibi-cute dragon lord."),
    ("pet_fire_003", "Fluffy orange fire fox with cream muzzle, ember-orange tail tip, copper eyes, small flame-shaped ear charms, tiny red scarf. Mischievous bright smile.",
     "Awakened flame fox with twin flame-tipped tails, gold fire ear cuffs, richer orange-to-gold fur gradient, small ruby on forehead, ornate ember scarf becoming flame silk, confident fiery hunter expression."),
    ("pet_fire_004", "Young demon fox warrior with dark crimson fur, small black horns, golden eyes, lightweight black-red armor plates, flame mark on cheek, short cape. Fierce but cute.",
     "Awakened inferno general fox with larger curved horns gold-tipped, blazing red-black plate armor with gold filigree, hellfire cape edges, twin flame tails, ruby chest sigil, intimidating yet chibi adorable warlord."),
    ("pet_earth_003", "Round stone bear cub with sandy-brown fur, rocky shoulder pads, tiny crystal in chest, amber eyes, earthen clay collar tag. Sturdy stubborn expression.",
     "Awakened stone guardian bear with heavier crystal-embedded rock armor, golden rune lines on stones, richer brown-gold fur, glowing amber chest gem, ornate earth medallion, immovable fortress guardian look."),
    ("pet_earth_004", "Gentle clay mouse priestess with warm brown fur, earthen pot charm necklace, soft pink ears, amber eyes, simple hemp ribbon, tiny flower on head. Kind nurturing smile.",
     "Awakened earth goddess mouse with golden soil ornaments, jade bead crown, ornate earthen robe patterns, richer brown-gold fur, glowing clay pot talisman, divine motherly healer aura in chibi form."),
]


def run(cmd: list[str], label: str) -> None:
    print(f"\n=== {label} ===", flush=True)
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.stdout:
        print(r.stdout, end="", flush=True)
    if r.returncode != 0:
        print(r.stderr, file=sys.stderr, flush=True)
        raise SystemExit(r.returncode)


def main() -> None:
    if not GEMINI.exists():
        print(f"Missing gemini script: {GEMINI}", file=sys.stderr)
        raise SystemExit(1)
    WORK.mkdir(parents=True, exist_ok=True)
    ref_arg: list[str] = []
    if REF.exists():
        ref_arg = ["--image", str(REF)]

    for pet_id, normal, awakened in PETS:
        prompt = GRID_TEMPLATE.format(style=STYLE_REF, normal=normal, awakened=awakened)
        prompt_file = WORK / f"{pet_id}_prompt.txt"
        grid_file = WORK / f"{pet_id}_grid.png"
        prompt_file.write_text(prompt, encoding="utf-8")

        run([
            "python3", str(GEMINI),
            "--prompt-file", str(prompt_file),
            *ref_arg,
            "--output", str(grid_file),
            "--model", "gemini-3.1-flash-image-preview",
            "--aspect-ratio", "1:1",
        ], f"Generate {pet_id}")

        normal_out = OUT_DIR / f"{pet_id}.png"
        awakened_out = OUT_DIR / f"{pet_id}_s3.png"
        run([
            "python3", str(PROCESS),
            str(grid_file), str(normal_out), str(awakened_out),
        ], f"Process {pet_id}")

    print("\nAll 10 pet avatar pairs done.", flush=True)


if __name__ == "__main__":
    main()
