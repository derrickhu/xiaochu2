/**
 * 通天塔「机缘」三选一浮层 —— 严格对齐 docs/ui-redesign/tower/implemented-02-bless.png
 *
 * 结构：标题匾「获得机缘」→ 释义半句 → 层数分隔行
 * → 三张独立卡（角标 + 圆图标 + 名 + 细线 + 描述）
 * → 底部提示 → 暖金重掷钮（骰子）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager, Ease } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { isMilestoneFloor } from '@/balance/tower';
import type { BlessTier, TowerBlessDef } from '@/balance/towerBless';
import { TOWER_FLOOR_KINDS } from '@/balance/towerPath';
import {
  UI_IMAGES, towerBlessIcon, towerBlessPickerAssets,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

/** 稀有度色：寻常=灰、罕有=金、奇珍=紫（金色留给更高档，避免寻常像稀有） */
const TIER_STYLE: Readonly<Record<BlessTier, {
  border: number; bg: number; label: string; nameFill: number;
  cardKey: 'towerBlessCardCommon' | 'towerBlessCardRare' | 'towerBlessCardEpic';
  badgeKey: 'towerBlessBadgeCommon' | 'towerBlessBadgeRare' | 'towerBlessBadgeEpic';
}>> = {
  common: {
    border: 0x7a7e86, bg: 0xf2f1ee, label: '寻常', nameFill: 0x4a4e56,
    cardKey: 'towerBlessCardCommon', badgeKey: 'towerBlessBadgeCommon',
  },
  rare: {
    border: 0xd4a03a, bg: 0xfff6e4, label: '罕有', nameFill: 0x8a5a10,
    cardKey: 'towerBlessCardRare', badgeKey: 'towerBlessBadgeRare',
  },
  epic: {
    border: 0xa960d8, bg: 0xf7eefd, label: '奇珍', nameFill: 0x6b3a96,
    cardKey: 'towerBlessCardEpic', badgeKey: 'towerBlessBadgeEpic',
  },
};

const TITLE_BROWN = 0x5c4033;
const CARD_GAP = 14;
/** 卡面接近素材 360×540 的竖比例 */
const CARD_H = 292;
const PANEL_PAD = 24;
const ICON_SIZE = 100;
const HEADER_H = 112;
const FOOTER_H = 118;

/**
 * 弹出三选一并等待玩家选择。
 * 候选为空（机缘全部叠满）时直接 resolve，不会卡住结算流程。
 */
export async function showTowerBlessPicker(
  layer: PIXI.Container,
  floor: number,
): Promise<TowerBlessDef | null> {
  const guard = isMilestoneFloor(floor)
    || TOWER_FLOOR_KINDS[PlayerData.towerPathKind].richBless;
  let choices = PlayerData.rollTowerBlessChoices(guard);
  if (choices.length === 0) return null;

  await TextureCache.preload(towerBlessPickerAssets(choices.map((c) => c.id)));

  return new Promise((resolve) => {
    const root = new PIXI.Container();
    layer.addChild(root);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(0x000000, 0.62);
    scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
    scrim.endFill();
    scrim.eventMode = 'static';
    root.addChild(scrim);

    const slots = choices.length;
    const cardW = Math.min(
      188,
      Math.floor((Game.logicWidth - PANEL_PAD * 2 - 48 - CARD_GAP * (slots - 1)) / slots),
    );
    const panelW = Math.min(
      Game.logicWidth - 28,
      cardW * slots + CARD_GAP * (slots - 1) + PANEL_PAD * 2,
    );
    const panelH = HEADER_H + CARD_H + FOOTER_H;

    const panel = new PIXI.Container();
    panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
    root.addChild(panel);

    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 20,
      bg: 0xfffaf0, bgAlpha: 0.98,
      border: guard ? 0xd8a63c : 0xb08a52, borderWidth: guard ? 3 : 2,
      centered: true,
    }));
    drawCornerFlourishes(panel, panelW, panelH, guard ? 0xd8a63c : 0xb08a52);

    const top = -panelH / 2;

    // ── 标题匾 ──
    const plaque = mountSprite(UI_IMAGES.towerBlessTitlePlaque, Math.min(panelW - 56, 340), 52);
    if (plaque) {
      plaque.position.set(0, top + 34);
      panel.addChild(plaque);
    }
    const title = makeText(guard ? '获得守关机缘' : '获得机缘', {
      size: FONT_SIZE.lg, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, top + 34);
    panel.addChild(title);

    const teach = makeText('本轮临时变强，重置后消失', {
      size: FONT_SIZE.xs, fill: 0x7a5520, bold: true, anchor: 0.5,
    });
    teach.position.set(0, top + 68);
    panel.addChild(teach);

    const subLine = guard
      ? `第 ${floor} 层守关已破 · 选一张带走 · 珍稀更易现身`
      : `第 ${floor} 层已破 · 选一张带走`;
    panel.addChild(buildRuledLine(panelW - 64, top + 94, subLine));

    const rowY = top + HEADER_H;
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

    // ── 底部提示 + 重掷（固定在面板底，不压卡）──
    const footerTop = top + HEADER_H + CARD_H;
    panel.addChild(buildRuledLine(
      panelW - 64,
      footerTop + 18,
      '点一张即可 · 本轮一直生效',
    ));

    const rerollBtn = buildRerollButton(Math.min(260, panelW - 72), () => {
      if (done || !PlayerData.consumeTowerReroll()) return false;
      choices = PlayerData.rollTowerBlessChoices(guard);
      void TextureCache.preload(choices.map((c) => towerBlessIcon(c.id)))
        .then(() => { if (!done) renderCards(true); });
      Platform.vibrateShort('light');
      return true;
    });
    rerollBtn.position.set(0, footerTop + 62);
    panel.addChild(rerollBtn);

    panel.scale.set(0.9);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 },
      duration: 0.3, ease: Ease.easeOutBack,
    });
  });
}

function buildRuledLine(width: number, y: number, text: string): PIXI.Container {
  const row = new PIXI.Container();
  row.position.set(0, y);
  const label = makeText(text, {
    size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5,
  });
  row.addChild(label);

  const gap = label.width / 2 + 12;
  const g = new PIXI.Graphics();
  g.lineStyle(1.2, 0xc4b49a, 0.85);
  g.moveTo(-width / 2, 0);
  g.lineTo(-gap, 0);
  g.moveTo(gap, 0);
  g.lineTo(width / 2, 0);
  for (const sx of [-1, 1] as const) {
    const dx = sx * (gap + 5);
    g.beginFill(0xc4b49a, 0.9);
    g.moveTo(dx, -3.2);
    g.lineTo(dx + 3.2, 0);
    g.lineTo(dx, 3.2);
    g.lineTo(dx - 3.2, 0);
    g.closePath();
    g.endFill();
  }
  row.addChildAt(g, 0);
  return row;
}

function buildRerollButton(w: number, onTap: () => boolean): PIXI.Container {
  const btn = new PIXI.Container();
  const h = 42;

  const draw = (): void => {
    btn.removeChildren().forEach((c) => c.destroy({ children: true }));
    const left = PlayerData.towerRerollsLeft;
    const perRun = PlayerData.towerLegacy.rerollsPerRun;
    const enabled = left > 0;
    // 重掷靠传承印记解锁，不是看广告
    const subText = enabled
      ? `本轮可重掷 ${left} 次`
      : perRun > 0
        ? '本轮重掷已用完'
        : '去传承用印记解锁「重掷」';

    const plate = mountSprite(UI_IMAGES.towerBlessRerollBtn, w, h);
    if (plate) {
      plate.alpha = enabled ? 1 : 0.55;
      btn.addChild(plate);
    } else {
      const bg = new PIXI.Graphics();
      bg.beginFill(enabled ? 0xfff3d8 : 0xf0ebe0, 1);
      bg.lineStyle(2, enabled ? 0xd8a63c : 0xc4b49a, 1);
      bg.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      bg.endFill();
      btn.addChild(bg);
    }

    const dice = mountSprite(UI_IMAGES.towerBlessDice, 26, 26);
    const label = makeText('重掷机缘', {
      size: FONT_SIZE.xs, fill: enabled ? 0x7a5520 : 0x9b8b80, bold: true, anchor: 0.5,
    });
    if (dice) {
      const groupW = 26 + 8 + label.width;
      dice.position.set(-groupW / 2 + 13, 0);
      label.position.set(-groupW / 2 + 26 + 8 + label.width / 2, 0);
      btn.addChild(dice);
    }
    btn.addChild(label);

    const sub = makeText(subText, {
      size: 11, fill: 0x9b8b80, bold: true, anchor: 0.5,
    });
    sub.position.set(0, h / 2 + 14);
    btn.addChild(sub);
  };
  draw();

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h + 22);
  pressFeedback(btn);
  bindPointerTap(btn, () => { if (onTap()) draw(); });
  return btn;
}

/**
 * 单卡垂直节奏（对齐 UI 稿）：
 * 角标 → 圆图标 → 名称 → 细分隔线 → 描述 →（可选叠层）
 */
function buildBlessCard(def: TowerBlessDef, w: number): PIXI.Container {
  const style = TIER_STYLE[def.tier];
  const owned = PlayerData.towerBlesses[def.id] ?? 0;
  const nextStacks = owned + 1;
  const card = new PIXI.Container();

  // 程序底板托底，避免贴图失败时三列糊成一块
  card.addChild(makePanel({
    width: w, height: CARD_H, radius: 14,
    bg: style.bg, bgAlpha: 1, border: style.border, borderWidth: 2,
    centered: false,
  }));

  // 卡面贴图：锚点居中，对齐卡片矩形（旧实现 centered=false 却位移到中心，整卡漂到右下）
  const cardTex = mountSprite(UI_IMAGES[style.cardKey], w, CARD_H);
  if (cardTex) {
    cardTex.position.set(w / 2, CARD_H / 2);
    card.addChild(cardTex);
  }

  const cx = w / 2;

  const badge = buildTierBadge(style.label, style.badgeKey, style.border, style.nameFill);
  badge.position.set(cx, 26);
  card.addChild(badge);

  const iconY = 98;
  const icon = mountSprite(towerBlessIcon(def.id), ICON_SIZE, ICON_SIZE);
  if (icon) {
    icon.position.set(cx, iconY);
    card.addChild(icon);
  } else {
    const ring = new PIXI.Graphics();
    ring.lineStyle(3, style.border, 0.85);
    ring.beginFill(0xfffaf0, 1);
    ring.drawCircle(0, 0, ICON_SIZE / 2 - 2);
    ring.endFill();
    ring.position.set(cx, iconY);
    card.addChild(ring);
  }

  const nameY = 168;
  const name = makeText(def.name, {
    size: FONT_SIZE.md, fill: style.nameFill, bold: true, anchor: 0.5, role: 'title',
  });
  name.position.set(cx, nameY);
  if (name.width > w - 20) name.scale.set((w - 20) / name.width);
  card.addChild(name);

  // 名与描述之间的细线（稿面分隔）
  const rule = new PIXI.Graphics();
  rule.lineStyle(1.2, style.border, 0.4);
  rule.moveTo(16, nameY + 18);
  rule.lineTo(w - 16, nameY + 18);
  card.addChild(rule);

  const desc = makeText(def.desc(nextStacks), {
    size: FONT_SIZE.xs, fill: 0x4a3a2c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: w - 28, align: 'center',
  });
  desc.position.set(cx, nameY + 28);
  card.addChild(desc);

  if (owned > 0) {
    const stack = makeText(`已有 ${owned} → ${nextStacks}/${def.maxStacks}`, {
      size: 11, fill: style.border, bold: true, anchor: 0.5,
    });
    stack.position.set(cx, CARD_H - 18);
    card.addChild(stack);
  }

  return card;
}

function buildTierBadge(
  label: string,
  badgeKey: 'towerBlessBadgeCommon' | 'towerBlessBadgeRare' | 'towerBlessBadgeEpic',
  border: number,
  fill: number,
): PIXI.Container {
  const badge = new PIXI.Container();
  // 六角角标素材接近正方形，勿压成扁条
  const plate = mountSprite(UI_IMAGES[badgeKey], 54, 54);
  if (plate) {
    badge.addChild(plate);
  } else {
    const bw = 52;
    const bh = 24;
    const g = new PIXI.Graphics();
    g.beginFill(0xfff3d8, 1);
    g.lineStyle(1.5, border, 1);
    g.drawRoundedRect(-bw / 2, -bh / 2, bw, bh, 6);
    g.endFill();
    badge.addChild(g);
  }
  const text = makeText(label, {
    size: 12, fill, bold: true, anchor: 0.5,
  });
  badge.addChild(text);
  return badge;
}

function mountSprite(
  path: string,
  w: number,
  h: number,
  centered = true,
): PIXI.Sprite | null {
  const tex = TextureCache.get(path);
  if (!tex?.valid) return null;
  const sp = new PIXI.Sprite(tex);
  if (centered) sp.anchor.set(0.5);
  sp.width = w;
  sp.height = h;
  return sp;
}

function drawCornerFlourishes(
  parent: PIXI.Container,
  panelW: number,
  panelH: number,
  color: number,
): void {
  const g = new PIXI.Graphics();
  g.lineStyle(1.5, color, 0.55);
  const inset = 10;
  const arm = 18;
  const corners: Array<[number, number, number, number]> = [
    [-panelW / 2 + inset, -panelH / 2 + inset, 1, 1],
    [panelW / 2 - inset, -panelH / 2 + inset, -1, 1],
    [-panelW / 2 + inset, panelH / 2 - inset, 1, -1],
    [panelW / 2 - inset, panelH / 2 - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    g.moveTo(x, y + sy * arm);
    g.lineTo(x, y);
    g.lineTo(x + sx * arm, y);
  }
  parent.addChild(g);
}
