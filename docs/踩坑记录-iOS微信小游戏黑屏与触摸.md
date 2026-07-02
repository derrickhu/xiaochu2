# 踩坑记录：iOS 微信小游戏黑屏与触摸无响应

> 项目：`xiaochu2`  
> 平台：iOS 微信小游戏（真机；开发者工具行为与真机不一致）  
> 对照参考：同仓库 `game2D_huahua`（已稳定运行）  
> 记录时间：2026-06

---

## 一、背景：为什么 iOS 要特别处理

iOS 微信小游戏上，Pixi WebGL、事件系统、场景切换时序都与开发者工具不一致。本项目先后验证过两条渲染路径：

| 路径 | 角色 | 当前结论 |
|------|------|----------|
| `direct-webgl` | `pixi-adapter` 单 canvas 直接上屏 | **唯一生产路径**；对齐 `game2D_huahua` |
| ~~`2d-compositor`~~ | WebGL 离屏 + `main-2d` 合成 | 已移除（排查期临时方案，拖动/动画成本高且易出上屏 bug） |

入口在 `minigame/game.js`：固定 `direct-webgl` 单 canvas 启动，加载 share-bootstrap、adapter 与 bundle。

**典型误区**：把所有 iOS 问题都归因于 WebGL 黑屏。实际这轮问题分成四层：渲染路径、EventSystem 坐标、canvas move/up 链、战斗动画 Promise。

---

## 二、黑屏问题汇总

### 坑 1：2D 合成器未同步（最主要）

**现象**

- 首页有时正常，切到其他场景后黑屏
- 或启动后长时间只有深色底/透明，WebGL 侧其实有内容

**根因**

Pixi 在离屏 WebGL canvas 上 render 成功，但 `main-2d` 没有收到最新帧。iOS 上 `drawImage(webglCanvas)` 可能卡住旧帧，中心像素仍是 boot 时的探针红色 `rgba(255,0,0,255)` 或全透明。

**修复要点**（`src/core/Game.ts`）

- `syncFrameToScreen()`：主动 `renderer.render(stage)` + `_compositeToScreen()`
- compositor 挂 `postrender` 钩子，每次 Pixi render 后同步
- `warmSceneCompositor()`：场景 build 后多帧 render + 合成；若 `_isMain2dCompositorStale()` 则 `forceReadPixelsCompositor()` 走 readPixels 兜底
- 切场景后调用：`SceneManager.switchTo`、`deferSceneBuild`、各场景 async build 完成处

**排查**

- 读 `main-2d` 中心像素：仍是红色探针或 `rgba(0,0,0,0)` → 合成未跟上
- 对比 WebGL canvas 与 main-2d 内容是否一致

---

### 坑 2：完整游戏渲染路径判断错误

**现象**

- 排除法 L1 direct-webgl 正常，完整游戏却走到另一条路径
- 或旧版本完整游戏没有创建预期 canvas，导致黑屏/旧帧

**根因**

`game.js` 里曾用 `_minimalLevel >= 2` 判断是否创建 `main-2d`。当 `_minimalLevel = false`（完整游戏）时，JS 里 `false >= 2` 为 **false**，导致完整游戏和分级测试走的不是同一条渲染路径。

**修复**

当前采用显式开关：

- `_directWebgl = true`：完整游戏走 huahua 同款单 canvas direct-webgl
- `_directWebgl = false`：回到旧的 2D compositor 兜底路径

不要再用隐式比较判断完整游戏路径。

**相关文件**：`minigame/game.js`

---

### 坑 3：切页后场景 `_build()` 没执行（假黑屏）

**现象**

- 点击导航能切场景，但新页只有 loading 壳或全黑
- 不是合成问题，而是 **场景内容根本没 build 出来**

**根因**

异步 preload 完成后用 `deferNextFrame`（内部 `ticker.addOnce`）推迟 build。真机上常见路径是：

```
pointerup → setTimeout(0) → SceneManager.switchTo → deferNextFrame
```

此时 **ticker.addOnce 经常不触发**，`_build()` 永远不跑，stage 上只剩空容器。

**修复**（`src/utils/deferAfterPointer.ts`）

- 真机 `deferNextFrame` 改为 `setTimeout(fn, 0)`，不依赖 ticker
- `deferSceneBuild` build 完成后调用 `Game.warmSceneCompositor()`

**相关文件**

- `src/utils/sceneEnterSeq.ts`
- 各场景的 `onEnter` → `deferSceneBuild` 路径

---

### 坑 4：EventSystem 坐标映射失败 → 命中测试全挂（表现为「点了没反应」，有时误判为黑屏）

**现象**

- 画面有了，但所有点击无效
- 或拖拽/命中区域完全错乱

**根因**

真机 `canvas.parentElement` 不可写，Pixi 内部 `mapPositionToPoint` 走到 fallback `rect { width: 0, height: 0 }`，坐标变 **NaN**，hit test 全部失败。

**修复**（`Game.init`）

手动 patch `evtSys.mapPositionToPoint`，用 `dom.width / rect.width` 与屏幕逻辑像素对齐；业务侧统一用 `Game.pointerEventToStageLocal()` 做坐标换算。

---

### 坑 5：iOS WebGL / 纹理 / mask 等（次要，排查时用）

排除法 L0–L11 过程中还遇到过：

- WebGL2 在 iOS 上需禁用，走 WebGL1（`pixi-adapter/canvas.js`、`webglContextPatch.ts`）
- 真机 canvas 纹理上传需 patch（`pixiUnsafeEvalPatch.ts`）
- Pixi `mask` 在 iOS 微信 WebGL 上可能黑屏（TitleScene 真机禁用 mask）

这些属于 **启动/首页** 阶段问题，与「切页黑屏」是不同层，但排查黑屏时应一并排除。

---

## 三、触摸无响应（常与黑屏同期出现）

黑屏修好后，真机仍可能出现 **导航能点 / 战斗转珠不能 / 编队不能上下阵**。根因是 **两套事件系统在微信 adapter 下互相隔离**。

### 坑 6：`pointertap` 到不了业务 listener

**现象**

- Pixi EventBoundary 日志里有 `pointertap`
- 业务 `.on('pointertap', fn)` 不触发

**根因**

微信真机 adapter 走 pointer 链时，`pointertap` 常在 Boundary 层结束，不派发到 DisplayObject。

**修复**

- 通用点击：`src/utils/bindPointerTap.ts`  
  真机用 `pointerdown` 标记 + `pointerup` 触发；模拟器/浏览器仍用 `pointertap`
- 所有按钮、列表项、Tab、槽位等 **禁止** 直接 `.on('pointertap')`
- 已接入：`Button`、`IconButton`、`TeamScene`、`teamPetList`、`CodexScene`、`GachaScene`、`battleWidgets` 等

---

### 坑 7：canvas 级 move/up 与 Pixi 监听隔离（转珠、划技能）

**现象**

- `pointerdown` 能进棋盘，但拖动无反应
- 或宠物上滑施法无效

**根因**

Pixi 7 把部分 `pointermove` / `pointerup` 注册在 `document` / `window`；微信 adapter 主要向 **canvas** 分发 touch/pointer。若 down、move、up 混用不同链路，真机就会出现 down 有、move/up 丢，或 tapRouter 与拖拽互相干扰。

**修复**

- `minigame/pixi-adapter/TouchEvent.js` 对齐 `game2D_huahua`：wx touch 同时 dispatch canvas touch/pointer，并转发 window pointer
- 棋盘 `BoardView` 对齐 huahua：`pointerdown` 走 Pixi 容器命中；`pointermove/pointerup` 直接挂 `Game.app.view`
- 坐标统一走 `Game.pointerEventToStageLocal()`，不要 down 用 `toLocal`、move 用另一套算法
- 宠物栏：`BattlePetBar` 技能划动、槽位按下走同一 canvas pointer 链
- 纵向列表：`ScrollListController`（已有）
- 抽卡池横向滚动：`gachaPoolPreview.ts`

---

### 坑 8：切场景在 pointer 事件栈内执行

**现象**

- 点击后切场景报错（如 `null.scale`）或状态错乱

**修复**

- 点击回调经 `deferAfterPointerEvent` 推迟；真机同样用 `setTimeout(0)`

---

### 坑 9：路径转珠只能换一格

**现象**

- 相邻两颗能换
- 手指继续拖住穿过多格，后续不再 `board.swap`

**根因**

交换逻辑锁一开始绑在 Pixi ticker 动画进度上。iOS 真机拖动时连续 `touchmove` 会挤压 ticker，导致锁不释放，表现为只能交换第一格。

**修复**

- 交换逻辑锁改用 `Date.now()` 真实时间：`_swapLockUntilMs`
- 交换动画同样用真实时间推进：`startMs` / `durationMs`
- `touchmove` 内主动 `_advanceSwapAnim()` 并立即 `renderer.render(stage)`，避免视觉滞后一帧
- 被拖的真实视觉由 `floatOrb` 跟手；棋盘底层半透明珠固定在当前逻辑格，只让被挤开的珠子滑到旧格

**关键文件**

- `src/game/board/BoardView.ts`
- `src/balance/ui.ts`（`orbSwap = 4/60`，`orbSwapLogicLock = 2/60`，对齐 `xiao_chu`）

---

### 坑 10：战斗结算 Promise 卡死在 resolving

**现象**

- L2/完整战斗松手后进入 `board.resolve | playClear combo=1`
- 之后连续点击都显示 `busy=true state=resolving`
- 8 秒后 `resolve timeout 8s`

**根因**

部分棋盘动画 Promise 依赖 `TweenManager.onComplete`。真机上 ticker 在切场景、触摸或重负载时可能不稳定，Tween 回调偶发不触发，导致 `await playClear()` / `playFall()` / `playConvert()` 永远不 resolve。

**修复**

- 新增 `src/core/animationGuard.ts`，统一封装 `once`、`minigameFallback`、`guardedTween`、`guardedPromise`
- `src/game/board/boardAnimations.ts` 对真机增加统一 timer 兜底
- 兜底触发时强制设置终态、取消 Tween、释放对象池，再 resolve Promise
- `BattleScene` 的宠物攻击、`BattleFx` 的弹道/技能横幅、`BattleHud` 的敌人死亡/入场/蓄力统一接入 guard
- `BattleScene` 保留 8 秒 resolve 超时兜底，避免状态机永久 busy
- `battleWidgets.delay()` 真机使用 timer，不依赖 Tween delay

**规范**

战斗状态机里凡是 `await` 表现层动画，都不能直接依赖裸 `TweenManager.onComplete`；必须使用 `animationGuard` 或 timer 驱动的封装。

---

### 坑 11：ticker.maxFPS 导致真机 ticker 永久静默（坑 9/10 的真正根因）

**现象**

- 转珠松手后逻辑跑完但画面冻结、点一下屏幕才刷新
- Tween `onComplete`「不回调」、`await` 挂死、8 秒超时
- 同一台 iPhone 15 Pro 跑 `game2D_huahua` 完全正常

**根因（Pixi Ticker 内部实现）**

`@pixi/ticker` 设置 `maxFPS` 后走节流分支：

```js
const delta = currentTime - this._lastFrame | 0;
if (delta < this._minElapsedMS) return;   // skip，且 _lastFrame 不更新
this._lastFrame = currentTime - delta % this._minElapsedMS;
```

- `_lastFrame` 在 `ticker.start()` 用 `performance.now()` 初始化
- 每帧 `currentTime` 却来自微信原生 rAF 的时间戳参数
- 微信 iOS 上两个时钟**不同源**（社区已知坑，iOS 版本间行为不同）
- `_lastFrame` 一旦被污染成未来值 → `delta` 恒为负 → 恒 `return` → **ticker 永久静默且无法自愈**

ticker 死 → `TweenManager.update` 不跑 → Tween 回调不触发 → 所有「玄学」症状。
`game2D_huahua` 从不设 `maxFPS`（`_minElapsedMS = 0`，节流代码整段跳过），所以同机稳定。
这也解释了 iPhone 13 与 15 Pro 表现差异：不同 iOS/微信版本 rAF 时间戳基准不同。

**修复**

- `Game.setMaxFPS()` 在小游戏环境 no-op（对齐 huahua：全程 ticker 全速，不节流）
- 坑 9 的「拖动手动 render」、坑 10 的 timer 兜底降级为保险层，不再是主路径

**规范**

小游戏环境**禁止**设置 `ticker.maxFPS`。省电降帧需求需另行评估（如 `wx.setPreferredFramesPerSecond`），不可走 Pixi 节流。

---

## 四、推荐排查流程（排除法）

`minigame/game.js` 保留 `_minimalLevel` 0–11 分级 boot，由简到繁：

排查阶段曾用 L0–L11 / `_battleMinimal` 分级启动做排除法，问题定位完成后已从 `game.js` 与 `main.ts` 移除，仅保留生产启动路径。若需复现黑屏/触摸问题，可临时改 `GameGlobal.__renderPath` 或对照 `game2D_huahua`。

**判断分支**（历史排查思路，仍适用）

1. L0 不红 → canvas/微信环境本身问题  
2. L1 红、L2+ 黑 → compositor / 合成  
3. 画面正常、点不了 → EventSystem 坐标 / bindPointerTap  
4. 首页正常、切页黑 → deferSceneBuild + warmSceneCompositor  
5. 切页有 UI、转珠/编队不行 → TouchEvent / canvas pointer 链  
6. 转珠逻辑有日志但画面飘 → ticker/真实时间/即时 present  
7. 松手后 busy=true resolving → 棋盘动画 Promise / Tween 兜底  

---

## 五、修复清单（代码入口）

| 问题 | 关键文件 |
|------|----------|
| 双 canvas 与合成 | `minigame/game.js`、`src/core/Game.ts` |
| 切场景 build + 合成 | `src/utils/sceneEnterSeq.ts`、`src/utils/deferAfterPointer.ts`、`src/core/SceneManager.ts` |
| 坐标映射 | `src/core/Game.ts`（`mapPositionToPoint` patch、`pointerEventToStageLocal`） |
| 点击 | `src/utils/bindPointerTap.ts` |
| 拖拽/划动 | `src/minigame/canvasInteraction.ts`、`src/utils/canvasPointerBridge.ts`、`src/game/board/BoardView.ts` |
| 路径转珠 | `src/game/board/BoardView.ts`、`src/balance/ui.ts` |
| 动画 Promise 兜底 | `src/core/animationGuard.ts`、`src/game/board/boardAnimations.ts`、`src/scenes/battle/BattleScene.ts`、`src/scenes/battle/BattleFx.ts`、`src/scenes/battle/BattleHud.ts`、`src/scenes/battle/battleWidgets.ts` |
| 触摸 adapter | `minigame/pixi-adapter/TouchEvent.js`、`minigame/pixi-adapter/index.js` |

---

## 六、经验法则（避免复发）

1. **iOS 真机为准**，开发者工具触摸/合成行为不可信。  
2. **先确认渲染路径**：当前优先 direct-webgl；compositor 仅作为兜底和历史排查路径。  
3. **完整游戏路径显式配置**，不要用 `false >= 2` 这类隐式比较判断。  
4. **真机推迟逻辑用 `setTimeout(0)`**，不要依赖 `ticker.addOnce` 接在 `switchTo` 后面。  
5. **小游戏里不要直接依赖 `pointertap`**；点击用 `bindPointerTap` / `canvasTapRouter`。  
6. **拖拽 move/up 挂 `Game.app.view` 的 pointer 链**，坐标统一走 `Game.pointerEventToStageLocal()`。  
7. **真机交互动画不要把逻辑锁绑死在 ticker 上**；触摸驱动的转珠用真实时间锁。  
8. **所有会被 await 的动画 Promise 必须走 `animationGuard` 或 timer 兜底**，否则状态机可能永久 busy。  
9. 新场景/新交互上线前，在真机过一遍：**导航、切页、列表点击、拖拽、结算** 五类。

---

## 七、相关对话与改动说明

上述问题在 `xiaochu2` iOS 黑屏与触摸修复过程中逐层暴露：先解决 compositor 上屏，再验证 direct-webgl，再解决切页 build 时序、TouchEvent/坐标链、路径转珠手感，最后给战斗结算动画补 timer 兜底。排除法 boot 与 `game.js` 弹窗诊断仍保留，便于以后再拆问题。
