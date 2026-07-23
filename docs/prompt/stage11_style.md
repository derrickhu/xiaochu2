# xiaochu2 UI / 原画 美术风格指南

> Agent 生图前必读。对应 Cursor 规则：`.cursor/rules/ui-art-style.mdc`。

## 总基调

- **统一 Q 版修仙**（cute-chibi xianxia guofeng）：与宠物/怪物 sprite 同一视觉家族，环境也稍 Q 版。
- 明亮国风插画：圆胖简化造型、细线描边、柔和赛璐璐/平涂块面，对齐 `scene_pet_pool.jpg` 与已定稿 `docs/ui/*_prototype_*.png`。
- 主色：薄荷青 / 湖水绿 (#7fd3c6 ~ #a8e0d8)、宣纸米白 (#fdf3df)、描金 (#e8a33d / #b5701f)。
- 笔触：轻水墨晕染 + 可爱圆润比例；忌厚重写实、忌暗黑恐怖、忌高饱和霓虹、忌 3D 写实渲染。

## 必贴风格段（每个 prompt 开头粘贴）

```
ART STYLE (MANDATORY — xiaochu2 brand):
Unified Q-version cute-chibi xianxia guofeng mobile game UI.
Soft cel-shaded / flat color blocks, thin clean outlines, chubby rounded proportions.
Palette: mint-teal + cream parchment (#fdf3df) + soft gold trim (#e8a33d).
Light airy painted scenery that is ALSO slightly Q/stylized (NOT realistic ink-wash landscape).
Pets/monsters/UI chrome must match the same cute family as existing prototypes.
FORBIDDEN: photorealistic, dark fantasy, heavy oil paint, cyberpunk neon, purple-on-white AI defaults, 3D PBR.
Use reference images for STYLE / palette / button & plaque chrome ONLY — do not copy their exact layout.
```

## 风格参考图（生图时 reference_image_paths）

| 优先级 | 路径 | 借什么 |
|--------|------|--------|
| 1 | `docs/ui/gacha_golden_egg_ui_prototype_v1.png` | 奶油金边按钮、匾额、薄荷雾气 |
| 2 | `docs/ui/pet_codex_ui_prototype_v4_q_ui.png` | Q 宠造型、浅色面板、圆角卡 |
| 3 | `docs/ui/team_prep_ui_prototype_v2.png` | 编队页淡底板、分区节奏 |
| 4 | `minigame/images/bg/scene_pet_pool.jpg` | 环境笔触/配色（仅风格） |

整页 UI 原型：**至少 2 张**参考；单图标/板子：至少 1 张或写明对齐已有 `plate_*.png`。

## 出图通用规则

- UI 原型需要可读中文标签时，prompt **明确写出**要出现的汉字；纯资产贴图则写 `NO TEXT`。
- 光效/粒子：纯黑底，引擎 ADD 混合。
- 卡框/图标需透明：出图后走 rembg（见 `ui-asset-matting` 规则）。
- **完整度**：竖屏 9:16 一屏结构齐全（顶栏、主内容、底栏/主按钮按需求），禁止裁切半截、缺模块。

## Spirit 灵宠四形态（角色原画）

灵宠 / 怪立绘定调见 **[`spirit_q_art_direction.md`](spirit_q_art_direction.md)**（2026-07 锁定 v2：Q 萌 + 觉醒炸裂对比 + 框内体量一致）。
生图骨架：`spirit_q_4form_style_common.txt`；物种 brief：`spirit_q_creatures_brief.json`。
风格锚点：`docs/ui/spirit_q_sample_pet_001_4form_v2.png`。

## 交付

- Prompt → `docs/prompt/{task}_prompt.txt`
- UI 定稿原型 / 风格锚点 → `docs/ui/`（进仓库）
- 大批量原图 / 切图成品 → `/Users/huyi/dk_proj/game_assets/xiaochu2/assets/`（`game_assets` 仓）
- 临时 demo / processed → 仓库 `tmp/`（gitignore）
- 运行时资源 → `minigame/images/...` 后 `npm run build`
