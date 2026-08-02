/**
 * 分支路径选择与事件结算浮层。
 *
 * 路径在进入前就落盘（见 PlayerData.towerPaths），这里只负责呈现与确认 ——
 * 退出重进不会刷出更好的分支，否则「选哪条」会退化成「重开到出好路为止」。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { TweenManager, Ease } from '@/core/TweenManager';
import {
  rollTowerEvent, TOWER_FLOOR_KINDS,
  type TowerEventDef, type TowerFloorKind,
} from '@/balance/towerPath';
import { PlayerData } from '@/game/PlayerData';
import { resolveTowerEvent, resolveTowerRest } from '@/game/towerEventResolve';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const TITLE_BROWN = 0x5c4033;
const PAD = 18;
const CARD_GAP = 12;
const CARD_H = 150;

const KIND_STYLE: Readonly<Record<TowerFloorKind, { border: number; bg: number }>> = {
  battle: { border: 0xb08a52, bg: 0xfdf6e9 },
  elite: { border: 0xc85a4a, bg: 0xfdeeea },
  event: { border: 0x4a86c8, bg: 0xeef4fd },
  rest: { border: 0x5aa86a, bg: 0xeefaf0 },
  guard: { border: 0xd8a63c, bg: 0xfff3d8 },
};

export interface TowerPathChoice {
  kind: TowerFloorKind;
  /** 战斗路径：调用方据此进入编队；非战斗路径已在浮层内结算完毕 */
  needsBattle: boolean;
}

/**
 * 弹出路径选择。战斗路径直接 resolve 交还调用方；
 * 事件层与休整层在浮层内结算并展示结果，resolve 时层数已经推进。
 */
export function showTowerPathPicker(
  layer: PIXI.Container,
  floor: number,
): Promise<TowerPathChoice | null> {
  const paths = PlayerData.towerPaths();
  // 单一路径（前几层与守关层）不值得为了一次点击多插一屏
  if (paths.length <= 1) {
    const kind = paths[0] ?? 'battle';
    PlayerData.chooseTowerPath(kind);
    return Promise.resolve({ kind, needsBattle: TOWER_FLOOR_KINDS[kind].combat });
  }

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
    const dismiss = (result: TowerPathChoice | null): void => {
      if (done) return;
      done = true;
      TweenManager.to({
        target: root, props: { alpha: 0 }, duration: 0.16, ease: Ease.easeInQuad,
        onComplete: () => {
          if (!root.destroyed) root.destroy({ children: true });
          resolve(result);
        },
      });
    };
    // 路径可以先不选（返回塔首页看看传承），所以点击遮罩允许取消
    bindPointerTap(scrim, () => dismiss(null));

    const cardW = Math.min(
      190,
      (Game.logicWidth - PAD * 2 - 48 - CARD_GAP * (paths.length - 1)) / paths.length,
    );
    const panelW = cardW * paths.length + CARD_GAP * (paths.length - 1) + PAD * 2;
    const panelH = CARD_H + 116;

    const panel = new PIXI.Container();
    panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
    root.addChild(panel);
    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 18,
      bg: 0xfffaf0, bgAlpha: 0.98, border: 0xb08a52, borderWidth: 2,
      centered: true,
    }));

    const top = -panelH / 2;
    const title = makeText(`第 ${floor} 层 · 择路`, {
      size: FONT_SIZE.lg, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, top + 32);
    panel.addChild(title);

    const sub = makeText('走得越险，机缘越厚', {
      size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5,
    });
    sub.position.set(0, top + 58);
    panel.addChild(sub);

    const choose = (kind: TowerFloorKind): void => {
      if (done) return;
      PlayerData.chooseTowerPath(kind);
      Platform.vibrateShort('light');
      if (TOWER_FLOOR_KINDS[kind].combat) {
        dismiss({ kind, needsBattle: true });
        return;
      }
      // 非战斗路径就地结算，玩家不必来回切场景
      done = true;
      const event: TowerEventDef | null = kind === 'rest' ? null : rollTowerEvent();
      const outcome = event
        ? resolveTowerEvent(event, floor)
        : resolveTowerRest(floor);
      root.removeChildren().forEach((c) => c.destroy({ children: true }));
      root.addChild(scrimOf());
      root.addChild(buildOutcomePanel(
        event ? event.name : '静室',
        event ? [event.text, ...outcome.lines] : outcome.lines,
        () => {
          if (!root.destroyed) root.destroy({ children: true });
          resolve({ kind, needsBattle: false });
        },
      ));
    };

    const rowY = top + 82;
    let x = -(panelW / 2) + PAD;
    paths.forEach((kind, i) => {
      const card = buildPathCard(kind, cardW);
      card.position.set(x, rowY);
      panel.addChild(card);
      x += cardW + CARD_GAP;

      card.eventMode = 'static';
      card.cursor = 'pointer';
      card.hitArea = new PIXI.Rectangle(0, 0, cardW, CARD_H);
      pressFeedback(card);
      bindPointerTap(card, () => choose(kind));

      card.alpha = 0;
      card.y = rowY + 16;
      TweenManager.to({
        target: card, props: { alpha: 1, y: rowY },
        duration: 0.22, delay: 0.05 * i, ease: Ease.easeOutQuad,
      });
    });

    panel.scale.set(0.88);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 }, duration: 0.28, ease: Ease.easeOutBack,
    });
  });
}

function scrimOf(): PIXI.Graphics {
  const scrim = new PIXI.Graphics();
  scrim.beginFill(0x000000, 0.6);
  scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
  scrim.endFill();
  scrim.eventMode = 'static';
  return scrim;
}

function buildPathCard(kind: TowerFloorKind, w: number): PIXI.Container {
  const def = TOWER_FLOOR_KINDS[kind];
  const style = KIND_STYLE[kind];
  const card = new PIXI.Container();
  card.addChild(makePanel({
    width: w, height: CARD_H, radius: 14,
    bg: style.bg, bgAlpha: 1, border: style.border, borderWidth: 2,
    centered: false,
  }));

  const cx = w / 2;
  const name = makeText(def.name, {
    size: FONT_SIZE.md, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
  });
  name.position.set(cx, 32);
  card.addChild(name);

  const rule = new PIXI.Graphics();
  rule.lineStyle(1.5, style.border, 0.5);
  rule.moveTo(14, 52);
  rule.lineTo(w - 14, 52);
  card.addChild(rule);

  const desc = makeText(def.desc, {
    size: FONT_SIZE.xs, fill: 0x4a3a2c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: w - 22, align: 'center',
  });
  desc.position.set(cx, 64);
  card.addChild(desc);

  if (def.coinBonus > 0) {
    const bonus = makeText(`额外 ${def.coinBonus} 印记`, {
      size: 12, fill: style.border, bold: true, anchor: 0.5,
    });
    bonus.position.set(cx, CARD_H - 18);
    card.addChild(bonus);
  }
  return card;
}

function buildOutcomePanel(
  title: string,
  lines: readonly string[],
  onClose: () => void,
): PIXI.Container {
  const panelW = Math.min(400, Game.logicWidth - 72);
  const panelH = 100 + lines.length * 30;
  const panel = new PIXI.Container();
  panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
  panel.addChild(makePanel({
    width: panelW, height: panelH, radius: 16,
    bg: 0xfffaf0, bgAlpha: 0.98, border: 0xb08a52, borderWidth: 2,
    centered: true,
  }));

  const top = -panelH / 2;
  const head = makeText(title, {
    size: FONT_SIZE.md, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
  });
  head.position.set(0, top + 28);
  panel.addChild(head);

  let y = top + 58;
  for (const line of lines) {
    const text = makeText(line, {
      size: FONT_SIZE.xs, fill: 0x5b4a3c, bold: true, anchor: 0.5,
      wordWrapWidth: panelW - 40, align: 'center',
    });
    text.position.set(0, y);
    panel.addChild(text);
    y += 30;
  }

  const btnW = 140;
  const btnH = 34;
  const btn = new PIXI.Container();
  btn.position.set(0, -top - 30);
  const bg = new PIXI.Graphics();
  bg.beginFill(0xfff3d8, 1);
  bg.lineStyle(2, 0xd8a63c, 1);
  bg.drawRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
  bg.endFill();
  btn.addChild(bg);
  const label = makeText('继续登塔', {
    size: FONT_SIZE.xs, fill: 0x7a5520, bold: true, anchor: 0.5,
  });
  btn.addChild(label);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-btnW / 2, -btnH / 2, btnW, btnH);
  pressFeedback(btn);
  bindPointerTap(btn, onClose);
  panel.addChild(btn);

  panel.scale.set(0.9);
  TweenManager.to({
    target: panel.scale, props: { x: 1, y: 1 }, duration: 0.26, ease: Ease.easeOutBack,
  });
  return panel;
}
