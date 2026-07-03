---
name: xiaochu2-dev
description: >-
  Develop, debug, and ship xiaochu2 (灵宠消消塔2) WeChat minigame. Use when
  editing xiaochu2/src, minigame assets, battle/UI logic, GM tools, or running
  local verification. Always rebuild minigame bundle after code changes.
---

# xiaochu2 开发与构建

## 改完必重新编译（强制）

在 `xiaochu2/` 内完成任何**源码、资源或配置**改动后，Agent **必须在本轮对话内实际执行**构建，不得只口头说「请自行 build」或等用户提醒。

```bash
cd xiaochu2 && npm run build
```

- 微信开发者工具运行的是 `minigame/game-bundle.js`，不 build 看不到最新改动。
- 构建会顺带跑 `scripts/organize-subpackages.mjs`；改分包资源后同样依赖此命令。
- **构建失败须先修复再继续**，不得向用户报告「已完成」并留下 broken bundle。

向用户汇报任务完成前，确认以下之一：

1. 已执行 `npm run build` 且 exit code 0；或
2. 本轮仅回答问题、未改任何 `xiaochu2/` 文件（纯阅读/解释可跳过构建）。

## 额外验证

| 改动类型 | 额外命令 |
|---------|---------|
| 公式 / 存档 / 战斗逻辑 | `npm test` |
| 类型 / 模块拆分 | `npm run typecheck` |

## 本地预览

1. `npm run build` 成功后，在微信开发者工具打开 `xiaochu2/minigame` 项目。
2. 工具内点「编译」/ 重新进入，确保加载最新 `game-bundle.js`。
3. GM 功能仅在 `platform === devtools` 可用；真机自动禁用。

## 项目路径速查

| 区域 | 路径 |
|------|------|
| 源码 | `xiaochu2/src/` |
| 小游戏入口 | `xiaochu2/minigame/` |
| 战斗编排 | `src/scenes/BattleScene.ts` |
| GM | `src/core/GMManager.ts`, `src/ui/GMPanel.ts` |
| 数值/UI 时长 | `src/balance/ui.ts` |
| 平台检测 | `src/core/PlatformService.ts` |
