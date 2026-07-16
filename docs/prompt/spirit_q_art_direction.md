# Spirit 四形态美术定调（2026-07 锁定）

> 后续批量生图 / 新宠追加必须遵循本文件 + [`spirit_q_4form_style_common.txt`](spirit_q_4form_style_common.txt)。
> 定稿锚点样例：`docs/ui/spirit_q_sample_pet_001_4form_v2.png`（及 003/005/007 的 `_v2`）。

## 总基调

- **Q 版萌宠修仙**：圆胖、大眼、赛璐璐/软平涂，国风可爱，不是写实仙侠。
- **四形态 Spirit**（非四方向走路）：
  - 左上：宠初始头像 → `pkg-pet/.../pet_XXX.png`（128×128）
  - 左下：宠觉醒头像 → `pet_XXX_s3.png`（128×128）
  - 右上：初级怪全身 → `pkg-enemy(-cr)/.../pet_XXX.png`（512×640）
  - 右下：高级怪全身 → `pet_XXX_awakened.png`（512×640）

## 体量（框内一致）

| 格位 | 占格 |
|------|------|
| 头像格 | 主体高约 70%–78% |
| 全身格 | 主体高约 88%–92%，脚底距下沿 4%–6% |

后处理强制：头像 fit 到 128（内容≤112）；全身按高度 ~90% 贴 512×640（过宽水平裁切，禁止压矮）。

## 觉醒（定调重点）

- **必须一眼炸裂**：装甲/冠角进化、配色跃迁、符文环/元素风暴、发光眼与纹样。
- **体量同档**：不靠变大显强；足迹高度与初始同带。
- 仍保持 Q 萌脸，不做成恐怖写实魔神。

## 生图工具

- 默认：**Cursor 内置 GenerateImage**
- 参考图优先：`spirit_q_sample_pet_001_4form_v2.png` + 该宠旧头像（借物种色相）
- Prompt 骨架：粘贴 `spirit_q_4form_style_common.txt`，再写物种 SUBJECT

## 入库流水线

```bash
python3 scripts/process_spirit_4form_grid.py GRID.png --pet-id pet_XXX \
  --out-dir /Users/huyi/rosa_games/game_assets/xiaochu2/assets/final/spirit_pet_XXX \
  --install
npm run build && ./scripts/upload.sh
```
