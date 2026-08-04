/**
 * 直登确认层。
 *
 * 塔的难度曲线是绝对的，所以推了很久主线才第一次进塔的玩家，底下几十层全是空气。
 * 这里给的是「跳过它们」而不是「把它们拉到你头上」—— 后者是隐性 level scaling，
 * 会把变强的成就感一并抵消掉。代价必须写在脸上：跳过的层不发任何奖励。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TOWER } from '@/balance/tower';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const TITLE_BROWN = 0x5c4033;
const GOLD = 0xb08a52;

/** @returns 玩家是否确认直登 */
export function showTowerSkipDialog(
  layer: PIXI.Container,
  fromFloor: number,
  toFloor: number,
): Promise<boolean> {
  const skippedMilestones = Math.floor((toFloor - 1) / TOWER.milestoneEvery)
    - Math.floor(Math.max(0, fromFloor - 1) / TOWER.milestoneEvery);
  const lines = [
    `直接从第 ${toFloor} 层起步，并按层数补发 ${toFloor - 1} 道随机机缘。`,
    `第 ${fromFloor}~${toFloor - 1} 层视为跳过，不发登塔印记。`,
  ];
  if (skippedMilestones > 0) {
    lines.push(`其中 ${skippedMilestones} 个守关奖励将一并放弃。`);
  }
  lines.push('想拿满奖励就自己爬上去 —— 这些层对现在的你并不难。');

  return new Promise((resolve) => {
    const root = new PIXI.Container();
    layer.addChild(root);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(0x000000, 0.6);
    scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
    scrim.endFill();
    scrim.eventMode = 'static';
    root.addChild(scrim);

    let done = false;
    const dismiss = (ok: boolean): void => {
      if (done) return;
      done = true;
      TweenManager.to({
        target: root, props: { alpha: 0 }, duration: 0.16, ease: Ease.easeInQuad,
        onComplete: () => {
          if (!root.destroyed) root.destroy({ children: true });
          resolve(ok);
        },
      });
    };
    bindPointerTap(scrim, () => dismiss(false));

    // 先排文案量高度，再定板高（书法标题 + 换行说明不能用固定步进）
    const panelW = Math.min(480, Game.logicWidth - 56);
    const textW = panelW - 48;
    const padTop = 22;
    const padBottom = 18;
    const titleGap = 14;
    const lineGap = 8;
    const btnGap = 18;
    const btnH = 38;

    const title = makeText(`直登第 ${toFloor} 层`, {
      size: FONT_SIZE.sm, fill: TITLE_BROWN, bold: true, anchor: [0.5, 0], role: 'title',
    });
    const bodyTexts = lines.map((line) => makeText(line, {
      size: FONT_SIZE.xs, fill: 0x5b4a3c, anchor: [0.5, 0],
      wordWrapWidth: textW, align: 'center',
    }));
    const bodyH = bodyTexts.reduce(
      (sum, t, i) => sum + t.height + (i > 0 ? lineGap : 0),
      0,
    );
    const panelH = Math.ceil(
      padTop + title.height + titleGap + bodyH + btnGap + btnH + padBottom,
    );

    const panel = new PIXI.Container();
    panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
    root.addChild(panel);
    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 18,
      bg: 0xfffaf0, bgAlpha: 0.98, border: GOLD, borderWidth: 2,
      centered: true,
    }));

    let y = -panelH / 2 + padTop;
    title.position.set(0, y);
    panel.addChild(title);
    y += title.height + titleGap;
    for (const text of bodyTexts) {
      text.position.set(0, y);
      panel.addChild(text);
      y += text.height + lineGap;
    }
    const btnY = y + btnGap - lineGap + btnH / 2;
    panel.addChild(buildButton('再想想', -panelW / 4, btnY, 0xf2ece2, 0xbdae9c, 0x7c6f62,
      () => dismiss(false)));
    panel.addChild(buildButton('直登', panelW / 4, btnY, 0xfff3d8, 0xd8a63c, 0x7a5520,
      () => dismiss(true)));

    panel.scale.set(0.9);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 }, duration: 0.26, ease: Ease.easeOutBack,
    });
  });
}

function buildButton(
  label: string,
  x: number,
  y: number,
  bgColor: number,
  border: number,
  fill: number,
  onTap: () => void,
): PIXI.Container {
  const w = 128;
  const h = 38;
  const btn = new PIXI.Container();
  btn.position.set(x, y);

  const bg = new PIXI.Graphics();
  bg.beginFill(bgColor, 1);
  bg.lineStyle(2, border, 1);
  bg.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  bg.endFill();
  btn.addChild(bg);

  const text = makeText(label, { size: FONT_SIZE.xs, fill, bold: true, anchor: 0.5 });
  btn.addChild(text);

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
  pressFeedback(btn);
  bindPointerTap(btn, onTap);
  return btn;
}
