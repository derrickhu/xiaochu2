# 灵宠消消塔 2（xiaochu2）

转珠消除 + 灵宠养成微信/抖音小游戏，`xiao_chu` 的 PixiJS 7 重制版。

- 引擎：PixiJS 7 + TypeScript + Vite（复用 `game2D_huahua` 已验证的真机适配层）
- 玩法：极简「灵宠币」单循环（关卡战斗 → 灵宠币 → 招募灵宠 → 挑战更强关卡）
- 数值：balance（纯数据）/ formulas（纯函数）/ game（逻辑）三层解耦

设计文档见 [docs/](docs/)：[核心玩法循环](docs/01-核心玩法循环.md) · [数值框架](docs/02-数值框架.md) · [技术架构](docs/03-技术架构.md)

## 快速开始

```bash
npm install
npm run build      # 产出 minigame/game-bundle.js
npm test           # 公式层单测（vitest）
npm run dev        # watch 模式构建
npm run typecheck  # TS 类型检查
```

构建完成后，用**微信开发者工具**导入项目根目录（`project.config.json` 已配置
`miniprogramRoot: minigame/`，appid 为测试号），即可进入 TitleScene，
点击「开始战斗」切到 BattleScene 查看 6x6 珠盘渲染。

## 目录结构

```
├── docs/                  # 设计文档
├── minigame/              # 小游戏发布目录
│   ├── game.js            # 启动模板（adapter → bundle，带真机诊断弹窗）
│   ├── game.json
│   ├── pixi-adapter/      # DOM/canvas/触摸/XHR shim（移植自 game2D_huahua）
│   ├── game-bundle.js     # 构建产物（不入 git）
│   └── images/orbs/       # 珠子贴图（复用 xiao_chu 资源）
├── src/
│   ├── main.ts            # 入口：patch → Game.init → 预加载 → TitleScene
│   ├── core/              # 引擎层（零业务依赖）
│   │   ├── pixiUnsafeEvalPatch.ts  # ShaderSystem/ADAPTER/真机纹理 patch（必须最先 import）
│   │   ├── Game.ts                 # 750 设计宽、DPR、Renderer 三级降级
│   │   ├── SceneManager.ts / OverlayManager.ts
│   │   ├── TweenManager.ts / EventBus.ts
│   │   ├── PlatformService.ts      # wx/tt 双平台抽象
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
