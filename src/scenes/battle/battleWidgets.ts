/**
 * 战斗场景通用小部件（纯函数，零状态）：按钮 + 延时。
 * 被 BattleScene 与 BattleResultOverlay 共用，避免重复实现。
 */
import * as PIXI from 'pixi.js';
import { TweenManager } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { minigameFrameDelay } from '@/core/animationGuard';
import { bindPointerTap } from '@/utils/bindPointerTap';

/** 圆角文字按钮：纯 Graphics 底 + 居中文字，点击回调 */
export function makeButton(
  label: string, width: number, height: number, color: number, onTap: () => void,
): PIXI.Container {
  const btn = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.beginFill(color);
  bg.drawRoundedRect(-width / 2, -height / 2, width, height, height / 2);
  bg.endFill();
  btn.addChild(bg);
  const text = new PIXI.Text(label, { fontSize: Math.floor(height * 0.45), fill: 0xffffff, fontWeight: 'bold' });
  text.anchor.set(0.5);
  btn.addChild(text);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  bindPointerTap(btn, onTap);
  return btn;
}

/** 基于补间时钟的延时（与场景动画同一时间轴，暂停/销毁自动失效） */
export function delay(sec: number): Promise<void> {
  return new Promise((resolve) => {
    if (Platform.isMinigame) {
      void minigameFrameDelay(sec).then(resolve);
      return;
    }
    TweenManager.to({
      target: { t: 0 }, props: { t: 1 },
      duration: sec, onComplete: resolve,
    });
  });
}
