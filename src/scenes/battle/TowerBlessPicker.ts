/**
 * 通天塔「机缘」三选一浮层
 *
 * 每通过一层，在结算面板之前先让玩家挑一条灵机。放在结算之前是刻意的：
 * 玩家对这一层的记忆点应该是「我选了什么」，而不是「我又拿了 300 灵宠币」。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { isMilestoneFloor } from '@/balance/tower';
import type { BlessTier, TowerBlessDef } from '@/balance/towerBless';
import { TOWER_FLOOR_KINDS } from '@/balance/towerPath';
import { PlayerData } from '@/game/PlayerData';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const TIER_STYLE: Readonly<Record<BlessTier, { border: number; bg: number; label: string }>> = {
  common: { border: 0xb08a52, bg: 0xfdf6e9, label: '寻常' },
  rare: { border: 0x4a86c8, bg: 0xeef4fd, label: '罕有' },
  epic: { border: 0xa960d8, bg: 0xf7eefd, label: '奇珍' },
};

const TITLE_BROWN = 0x5c4033;
const CARD_GAP = 14;
const CARD_H = 232;
const PANEL_PAD = 20;

/**
 * 弹出三选一并等待玩家选择。
 *
 * 候选为空（灵机全部叠满）时直接 resolve，不会卡住结算流程。
 */
export function showTowerBlessPicker(
  layer: PIXI.Container,
  floor: number,
): Promise<TowerBlessDef | null> {
  // 险径与守关层共用「珍稀更易现身」这套倾斜：选了更难的路就该有更好的回报
  const guard = isMilestoneFloor(floor)
    || TOWER_FLOOR_KINDS[PlayerData.towerPathKind].richBless;
  let choices = PlayerData.rollTowerBlessChoices(guard);
  if (choices.length === 0) return Promise.resolve(null);

  return new Promise((resolve) => {
    const root = new PIXI.Container();
    layer.addChild(root);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(0x000000, 0.62);
    scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
    scrim.endFill();
    // 吃掉穿透点击：没选之前不允许操作下面的战斗层
    scrim.eventMode = 'static';
    root.addChild(scrim);

    // 面板按「最多可能的候选数」定宽，重掷后候选变少也不会跳版
    const maxSlots = Math.max(choices.length, PlayerData.towerLegacy.pickCount);
    const cardW = Math.min(
      210,
      (Game.logicWidth - PANEL_PAD * 2 - 48 - CARD_GAP * (maxSlots - 1)) / maxSlots,
    );
    const panelW = cardW * maxSlots + CARD_GAP * (maxSlots - 1) + PANEL_PAD * 2;
    const panelH = CARD_H + 158;

    const panel = new PIXI.Container();
    panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
    root.addChild(panel);

    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 18,
      bg: 0xfffaf0, bgAlpha: 0.98,
      border: guard ? 0xd8a63c : 0xb08a52, borderWidth: guard ? 3 : 2,
      centered: true,
    }));

    const top = -panelH / 2;
    const title = makeText(guard ? '守关机缘 · 择一' : '机缘 · 择一', {
      size: FONT_SIZE.lg, fill: TITLE_BROWN, bold: true, anchor: 0.5,
      role: 'title',
    });
    title.position.set(0, top + 34);
    panel.addChild(title);

    const sub = makeText(
      guard ? `第 ${floor} 层守关已破 · 珍稀机缘更易现身` : `第 ${floor} 层已破`,
      { size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5 },
    );
    sub.position.set(0, top + 62);
    panel.addChild(sub);

    const rowY = top + 86;
    /** 卡片重建时只清这一层，标题与重掷钮保持不动 */
    const cardLayer = new PIXI.Container();
    panel.addChild(cardLayer);

    let done = false;
    const pick = (def: TowerBlessDef): void => {
      if (done) return;
      done = true;
      PlayerData.grantTowerBless(def.id);
      Platform.vibrateShort('light');
      TweenManager.to({
        target: root, props: { alpha: 0 }, duration: 0.18, ease: Ease.easeInQuad,
        onComplete: () => {
          if (!root.destroyed) root.destroy({ children: true });
          resolve(def);
        },
      });
    };

    const renderCards = (animate: boolean): void => {
      cardLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
      const rowW = cardW * choices.length + CARD_GAP * (choices.length - 1);
      let x = -rowW / 2;
      choices.forEach((def, i) => {
        const card = buildBlessCard(def, cardW);
        card.position.set(x, rowY);
        cardLayer.addChild(card);
        x += cardW + CARD_GAP;

        card.eventMode = 'static';
        card.cursor = 'pointer';
        card.hitArea = new PIXI.Rectangle(0, 0, cardW, CARD_H);
        pressFeedback(card);
        bindPointerTap(card, () => pick(def));

        if (!animate) return;
        card.alpha = 0;
        card.y = rowY + 18;
        TweenManager.to({
          target: card, props: { alpha: 1, y: rowY },
          duration: 0.24, delay: 0.05 * i, ease: Ease.easeOutQuad,
        });
      });
    };
    renderCards(true);

    const rerollBtn = buildRerollButton(panelW - PANEL_PAD * 2, () => {
      if (done || !PlayerData.consumeTowerReroll()) return false;
      choices = PlayerData.rollTowerBlessChoices(guard);
      renderCards(true);
      Platform.vibrateShort('light');
      return true;
    });
    rerollBtn.position.set(0, top + panelH - 40);
    panel.addChild(rerollBtn);

    panel.scale.set(0.86);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 },
      duration: 0.3, ease: Ease.easeOutBack,
    });
  });
}

/**
 * 重掷按钮：无次数时仍然显示但置灰，让玩家知道传承里有这个东西可买。
 * @param onTap 返回 true 表示重掷成功，需要刷新按钮上的剩余次数
 */
function buildRerollButton(
  w: number,
  onTap: () => boolean,
): PIXI.Container {
  const btn = new PIXI.Container();
  const h = 34;
  const draw = (): void => {
    btn.removeChildren().forEach((c) => c.destroy({ children: true }));
    const left = PlayerData.towerRerollsLeft;
    const enabled = left > 0;
    const bg = new PIXI.Graphics();
    bg.beginFill(enabled ? 0xfff3d8 : 0xf0ebe0, 1);
    bg.lineStyle(1.5, enabled ? 0xd8a63c : 0xc4b49a, 1);
    bg.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.endFill();
    btn.addChild(bg);

    const label = makeText(
      enabled ? `重掷机缘 · 余 ${left} 次` : '重掷机缘 · 需传承「重掷」',
      { size: 13, fill: enabled ? 0x7a5520 : 0x9b8b80, bold: true, anchor: 0.5 },
    );
    btn.addChild(label);
  };
  draw();

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
  pressFeedback(btn);
  bindPointerTap(btn, () => {
    if (onTap()) draw();
  });
  return btn;
}

function buildBlessCard(def: TowerBlessDef, w: number): PIXI.Container {
  const style = TIER_STYLE[def.tier];
  const owned = PlayerData.towerBlesses[def.id] ?? 0;
  const nextStacks = owned + 1;

  const card = new PIXI.Container();
  card.addChild(makePanel({
    width: w, height: CARD_H, radius: 14,
    bg: style.bg, bgAlpha: 1,
    border: style.border, borderWidth: 2,
    centered: false,
  }));

  const cx = w / 2;

  const tierTag = makeText(style.label, {
    size: 12, fill: 0xfffaf0, bold: true, anchor: 0.5,
  });
  const tagW = Math.max(46, tierTag.width + 16);
  const tagBg = new PIXI.Graphics();
  tagBg.beginFill(style.border, 1);
  tagBg.drawRoundedRect(cx - tagW / 2, 12, tagW, 20, 10);
  tagBg.endFill();
  card.addChild(tagBg);
  tierTag.position.set(cx, 22);
  card.addChild(tierTag);

  const name = makeText(def.name, {
    size: FONT_SIZE.md, fill: TITLE_BROWN, bold: true, anchor: 0.5,
    role: 'title',
  });
  name.position.set(cx, 58);
  if (name.width > w - 16) name.scale.set((w - 16) / name.width);
  card.addChild(name);

  const rule = new PIXI.Graphics();
  rule.lineStyle(1.5, style.border, 0.5);
  rule.moveTo(16, 82);
  rule.lineTo(w - 16, 82);
  card.addChild(rule);

  // 描述按「选完之后」的层数展示，玩家看到的就是选中后的实际效果
  const desc = makeText(def.desc(nextStacks), {
    size: FONT_SIZE.xs, fill: 0x4a3a2c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: w - 24, align: 'center',
  });
  desc.position.set(cx, 96);
  card.addChild(desc);

  const footer = owned > 0
    ? `已有 ${owned} 层 → ${nextStacks}/${def.maxStacks}`
    : (def.category === 'trigger' ? '触发' : '强化');
  const footerText = makeText(footer, {
    size: 12, fill: owned > 0 ? style.border : 0x9b8b80, bold: true, anchor: 0.5,
  });
  footerText.position.set(cx, CARD_H - 18);
  card.addChild(footerText);

  return card;
}
