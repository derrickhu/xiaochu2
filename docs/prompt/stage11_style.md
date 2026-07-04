# 阶段十一 UI 美术风格指南

## 总基调
- **统一 Q 版修仙**（cute-chibi xianxia guofeng）：与宠物/怪物 sprite 同一视觉家族，环境也稍 Q 版。
- 明亮国风插画：圆胖简化造型、细线描边、柔和赛璐璐/平涂块面，对齐 `scene_pet_pool.jpg`。
- 主色：薄荷青 / 湖水绿 (#7fd3c6 ~ #a8e0d8)、宣纸米白 (#fdf3df)、描金 (#e8a33d / #b5701f)。
- 笔触：轻水墨晕染 + 可爱圆润比例；忌厚重写实、忌暗黑恐怖、忌高饱和霓虹、忌 3D 写实渲染。

## 出图通用规则
- 所有 prompt 必含：`NO TEXT, no labels, no captions, no writing anywhere in the image`。
- 风格参考图：`minigame/images/bg/scene_pet_pool.jpg`（用 `--image` 传入，仅借风格/笔触/配色，不复制具体元素）。
- 光效/粒子类：在**纯黑底**上出图（`pure solid black background`），交给引擎用叠加（ADD）混合，黑色即透明，免抠图。
- 卡框/图标类：需透明，出图后走 rembg 抠底。

## 资产清单与用途
| 批次 | 文件 | 出图底 | 处理 | 用途 |
|------|------|--------|------|------|
| gacha_fx | fx_light_pillar / fx_summon_circle / fx_starburst / fx_aura_ring | 纯黑 | 直接用(ADD) | 抽卡演出光柱/法阵/星爆/光环 |
| particles | p_dot / p_spark / p_petal / p_wisp | 纯黑 | 直接用(ADD) | 通用粒子贴图，替代白图 tint |

## 交付路径
- 处理后 PNG 拷入 `minigame/images/ui/fx/`，在 `src/config/Assets.ts` 注册到 `UI_FX_IMAGES` 并按需加入预加载。
