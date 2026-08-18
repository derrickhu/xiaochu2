# 灵宠消消塔 2（xiaochu2）

转珠消除 + 灵宠养成微信/抖音小游戏，`xiao_chu` 的 PixiJS 7 重制版。

- 引擎：PixiJS 7 + TypeScript + Vite（复用 `game2D_huahua` 已验证的真机适配层）
- 玩法：极简「灵宠币」单循环（关卡战斗 → 灵宠币 → 招募灵宠 → 挑战更强关卡）
- 数值：balance（纯数据）/ formulas（纯函数）/ game（逻辑）三层解耦

设计文档见 [docs/](docs/)：

1. **[体验目标（设计北极星）](docs/00-体验目标.md)** — 后续设计必须按此审视
2. [核心玩法循环](docs/01-核心玩法循环.md)
3. [数值框架](docs/02-数值框架.md)
4. [技术架构](docs/03-技术架构.md)
5. [多平台构建](docs/04-多平台构建.md) — 打开 `build/douyin/` / `build/wechat/`
6. [关键技术点](docs/05-关键技术点.md)

## 快速开始

```bash
npm install
npm run build          # 组装 build/wechat/ 与 build/douyin/
npm run build:douyin   # 只出抖音
npm run build:taptap   # Tap 扫码包
npm test
npm run dev
npm run typecheck
```

构建后用开发者工具打开 **`build/douyin/`**（抖音）或 **`build/wechat/`**（微信），不要打开 `minigame/`。

## 目录结构

```
├── docs/
├── minigame/              # 共享内容树（资源唯一真源）
├── platform/              # 各端 game.json / project.config.json
├── build/                 # 工具打开目录（不入库）
├── src/
│   ├── main.ts            # 入口：patch → Game.init → 预加载 → TitleScene
│   ├── core/              # 引擎层（零业务依赖）
│   │   ├── pixiUnsafeEvalPatch.ts  # ShaderSystem/ADAPTER/真机纹理 patch（必须最先 import）
│   │   ├── Game.ts                 # 750 设计宽、DPR、Renderer 三级降级
│   │   ├── SceneManager.ts / OverlayManager.ts
│   │   ├── TweenManager.ts / EventBus.ts
│   │   ├── PlatformService.ts      # wx/tt/tap 宿主抽象
│   │   ├── TextureCache.ts         # 纹理缓存 + inflight 去重 + 重试
│   │   └── ObjectPool.ts           # 通用对象池（珠子/飘字复用）
│   ├── scenes/            # TitleScene / BattleScene
│   ├── game/              # 玩法逻辑（board/）
│   ├── balance/           # 数值层：combat / pets / enemies / stages / economy / growth / ui
│   ├── formulas/          # 公式层：damage / growth / economyOutput（含 __tests__）
│   └── config/            # 资源映射表
└── vite.config.ts         # IIFE 单文件输出 + @pixi/* dedupe + unsafe-eval 后处理插件
```

## 数值修改工作流

1. 改 `src/balance/` 下的常量表（单一真源，逻辑层禁止 magic number）
2. `npm test` 查看公式快照 diff，确认全局影响范围
3. 提交

## 当前状态（可玩 Demo）

已完成：

- 工程底座、真机适配层、core 引擎层、数值/公式层
- 转珠战斗循环：长拖交换（12 秒限时）、消除/Combo、下落补珠连锁
- 战斗结算：宠物冲刺攻击动效、五行克制、心珠回血、敌人多波次与反击、胜负判定
- 第一章 5 关推进：通关解锁、三星判定（按回合数三档）、灵宠币结算与本地存档
- 单测 50 个（公式层 + 盘面逻辑）

未实现（下轮迭代）：招募/养成 UI（灵宠币消费闭环）、宠物技能、
消除粒子特效、音效、云存档、广告。
