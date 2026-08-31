/**
 * 重置确认：战败后重来，或中途主动放弃本轮。
 * 次数是日限，必须把「从哪一层满血再爬」写在脸上。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const TITLE_BROWN = 0x5c4033;
const GOLD = 0xb08a52;

export function showTowerResetDialog(
  layer: PIXI.Container,
  opts: {
    startFloor: number;
    reroll: number;
    needsAd: boolean;
    midRun: boolean;
    left: number;
    total: number;
  },
): Promise<boolean> {
  const lines = [
    `从第 ${opts.startFloor} 层满血再爬，本轮机缘清空后随机补发 ${opts.reroll} 道。`,
    opts.midRun
      ? '本轮还没战败，现在重置也会消耗 1 次。'
      : '战败后从最近存档点重来。',
    opts.needsAd
      ? `今日还剩 ${opts.left}/${opts.total} 次，这次要看广告。`
      : `今日还剩 ${opts.left}/${opts.total} 次，这次免费。`,
  ];

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

    const panelW = Math.min(480, Game.logicWidth - 56);
    const textW = panelW - 48;
    const padTop = 22;
    const padBottom = 18;
    const titleGap = 14;
    const lineGap = 8;
    const btnGap = 18;
    const btnH = 38;

    const title = makeText('重置本轮', {
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
    panel.addChild(buildButton(
      opts.needsAd ? '看广告重置' : '重置',
      panelW / 4, btnY, 0xfff3d8, 0xd8a63c, 0x7a5520,
      () => dismiss(true),
    ));

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
