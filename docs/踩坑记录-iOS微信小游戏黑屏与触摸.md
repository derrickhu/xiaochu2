# 踩坑记录：iOS 微信小游戏黑屏与触摸无响应

> 项目：`xiaochu2`  
> 平台：iOS 微信小游戏真机（开发者工具行为不可信）  
> 对照：`game2D_huahua`（同机稳定）  
> 最后更新：2026-07

---

## 一、结论（先看这个）

排查过程中曾误判为「合成器黑屏」「Tween 不回调」「ticker 被 touch 挤死」等，**最终确认的根因只有一个**：

**在小游戏真机上设置 Pixi `ticker.maxFPS`，会触发 `@pixi/ticker` 节流 bug，导致 ticker 永久静默。**

表现包括：画面冻结、松手才刷新、`await` 动画挂死、`busy=true state=resolving`、8 秒 resolve 超时。同一台 iPhone 15 Pro 跑 `game2D_huahua` 正常，因为 huahua **从不设 maxFPS**。

当前生产修复：

- 渲染：**direct-webgl 单 canvas**（对齐 huahua），已删除 `2d-compositor` 及所有分级 boot（L0–L11）
- 根因：`Game.setMaxFPS()` 在小游戏环境 **no-op**
- 其余：`animationGuard`、真实时间转珠锁、触摸链封装等作为**独立真机问题或保险层**，不是主因

---

## 二、根因：ticker.maxFPS（必须遵守）

### 现象

- 转珠/战斗动画逻辑在跑，画面不更新，点一下屏幕才刷新
- Tween `onComplete` 不触发，`await playClear()` 永不 resolve
- 战斗卡在 `busy=true state=resolving`，8 秒后超时

### 机制（Pixi `@pixi/ticker`）

设置 `maxFPS` 后走节流分支：

```js
const delta = currentTime - this._lastFrame | 0;
if (delta < this._minElapsedMS) return;   // skip，且 _lastFrame 不更新
this._lastFrame = currentTime - delta % this._minElapsedMS;
```

- `_lastFrame` 在 `ticker.start()` 用 `performance.now()` 初始化
- 每帧 `currentTime` 来自微信 rAF 回调参数
- iOS 微信上两个时钟**可能不同源** → `_lastFrame` 被污染为未来值 → `delta` 恒负 → **ticker 永久静默且无法自愈**
- ticker 停 → `TweenManager.update` 不跑 → 上述所有「玄学」症状连锁出现

### 修复

```203:206:src/core/Game.ts
  setMaxFPS(fps: number): void {
    if (Platform.isMinigame) return;
    try { this.ticker.maxFPS = fps; } catch (_) { /* */ }
  }
```

### 规范（防复发）

1. 小游戏环境**禁止** `ticker.maxFPS` / `Game.ticker.maxFPS`，必须经 `Game.setMaxFPS()` 且其在小游戏为 no-op
2. 省电降帧用 `wx.setPreferredFramesPerSecond` 等平台 API，**不要**走 Pixi 节流
3. 各场景里 `Game.setMaxFPS(UI.fps.idle)` 在真机无害但易误导，浏览器专用；新增代码不要直接碰 `ticker.maxFPS`

---

## 三、仍有效的真机适配（与 maxFPS 无关）

以下问题在根因修复前后均真实存在，与 huahua 对齐后仍需保留。

### 1. EventSystem 坐标映射

真机 `canvas.getBoundingClientRect()` 可能返回 `width/height = 0`，Pixi 默认 `mapPositionToPoint` 产出 NaN，全部 hit test 失败（「有画面点不了」）。

**修复**：`Game.init` patch `evtSys.mapPositionToPoint`；业务坐标统一走 `Game.pointerEventToStageLocal()`。

**文件**：`src/core/Game.ts`

### 2. 切场景 build 时序

`pointerup → switchTo → deferNextFrame(ticker.addOnce)` 在真机上 **addOnce 常不触发**，`_build()` 永不执行 → 假黑屏。

**修复**：真机 `deferNextFrame` / `deferAfterPointerEvent` 用 `setTimeout(0)`；`deferSceneBuild` 完成后 `Game.warmScenePresent()`。

**文件**：`src/utils/deferAfterPointer.ts`、`src/utils/sceneEnterSeq.ts`

### 3. 触摸链隔离

微信 adapter 下 Pixi EventSystem 与 canvas 分发两套链路并存：

| 场景 | 做法 |
|------|------|
| 普通点击 | `bindPointerTap` / `canvasTapRouter`（勿用 `pointertap`） |
| 拖拽 move/up | 挂 `Game.app.view` 的 pointer 链，与 down 成对 |
| wx 底层 | `TouchEvent.js` 同时 dispatch canvas + window pointer |

**文件**：`src/utils/bindPointerTap.ts`、`src/minigame/canvasInteraction.ts`、`minigame/pixi-adapter/TouchEvent.js`、`src/game/board/BoardView.ts`

### 4. 启动期 WebGL / 纹理

- iOS 禁用 WebGL2，强制 WebGL1：`webglContextPatch.ts`、`pixi-adapter/canvas.js`
- 真机 canvas 纹理上传：`pixiUnsafeEvalPatch.ts`
- 部分 mask 真机黑屏：TitleScene 等按需禁用

---

## 四、保险层（根因已修，仍建议保留）

根因修复后 ticker 应稳定；以下是为 async 状态机和不稳定帧率准备的**防御**，不是第二根因。

### animationGuard

战斗结算等 `await` 表现动画时：

- `guardedTween` / `minigameFallback`：timer 兜底，避免 Promise 永久 pending
- `startMinigamePresentLoop`：战斗 async 链期间补帧 present；ticker 停滞时额外 `TweenManager.update`

**规范**：战斗状态机里 `await` 的动画走 `animationGuard`，不要裸 `TweenManager.onComplete`。

**文件**：`src/core/animationGuard.ts`、`src/game/board/boardAnimations.ts`、`src/scenes/battle/*`

### 路径转珠真实时间锁

连续 `touchmove` 时交换动画与逻辑锁用 `Date.now()` 推进，不绑 ticker 进度；move 内可 `renderer.render` 保跟手。

**文件**：`src/game/board/BoardView.ts`、`src/balance/ui.ts`（`orbSwapLogicLock`）

---

## 五、封装是否合适 / 还会不会复发

### 当前分层（合理）

| 层 | 职责 | 评价 |
|----|------|------|
| `pixi-adapter` | DOM/canvas/触摸模拟 | 与 huahua 对齐，应少改 |
| `Game` | 渲染、ticker、坐标、setMaxFPS 门禁 | **根因门禁在此，是关键** |
| `deferAfterPointer` / `sceneEnterSeq` | 真机时序 | 职责清晰 |
| `bindPointerTap` / `canvasInteraction` | 点击 vs 拖拽 | 应作为唯一入口 |
| `animationGuard` | async 动画 + 战斗 present | 略重但必要；勿再扩散到非战斗场景 |

### 复发风险（按优先级）

1. **高**：有人绕过 `Game.setMaxFPS` 直接设 `ticker.maxFPS`，或升级 Pixi 后行为变化 → Code Review 禁止 direct maxFPS
2. **中**：新场景直接 `.on('pointertap')` 或 down/move 混用不同事件源 → 必须走现有封装
3. **中**：新 `await` 动画未接 `animationGuard` → 状态机可能 busy 挂死（即使 ticker 正常，Tween 仍可能因 destroy 等异常不回调）
4. **低**：`startMinigamePresentLoop` 与主 ticker 双时钟 → 目前仅 BattleScene 使用，勿泛化
5. **低**：`BoardView` 自管 pointer 链，与 `canvasInteraction` 部分重复 → 可后续统一，非功能性风险

### 后续可简化（非必须）

- 真机验证稳定后，可评估缩小 `animationGuard` 覆盖面（huahua 式 fire-and-forget）
- 删除各场景无意义的 `Game.setMaxFPS(UI.fps.idle)` 调用，减少误导
- `warmScenePresent` 仅 iOS 真机多帧 present，与 compositor 无关，可保留

---

## 六、真机验收清单

新场景 / 新交互上线前过一遍：

1. 首页 → 编队 / 图鉴 / 商店 / 召唤 切页无黑屏
2. 列表点击、Tab、按钮响应
3. 战斗转珠：连拖多格、松手结算不卡 `busy`
4. 宠物上滑施法、抽卡池横滑
5. 连续进出场战斗 3 次以上无挂死

---

## 七、代码入口

| 问题 | 文件 |
|------|------|
| maxFPS 门禁 | `src/core/Game.ts` |
| 坐标 | `src/core/Game.ts`（`mapPositionToPoint`、`pointerEventToStageLocal`） |
| 切场景 build | `src/utils/deferAfterPointer.ts`、`src/utils/sceneEnterSeq.ts` |
| 点击 | `src/utils/bindPointerTap.ts`、`src/utils/canvasTapRouter.ts` |
| 拖拽 | `src/minigame/canvasInteraction.ts`、`src/game/board/BoardView.ts` |
| 动画兜底 | `src/core/animationGuard.ts` |
| 触摸 adapter | `minigame/pixi-adapter/TouchEvent.js`、`minigame/pixi-adapter/index.js` |
| WebGL1 / 纹理 | `src/core/webglContextPatch.ts`、`src/core/pixiUnsafeEvalPatch.ts` |
| 启动兜底 | `minigame/game.js`（失败弹窗 + `__gameRendered` 5s 检测） |

---

## 八、已废弃（文档中不再作为排查路径）

以下仅为历史排查记录，**代码与生产路径均已移除**，勿再参考：

- `2d-compositor` / `main-2d` 合成 / `warmSceneCompositor`
- `game.js` 的 `_minimalLevel` L0–L11、`__renderPath`、`BootDiag` / `touchDiag`
- 「完整游戏 vs 分级测试路径不一致（`false >= 2`）」—— 随分级 boot 一并删除
