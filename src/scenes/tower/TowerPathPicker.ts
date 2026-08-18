/**
 * 分支路径选择与事件结算浮层 —— 对齐 docs/ui-redesign/tower/implemented-01-path.png
 *
 * 卡面结构：角标 → 路名 → 一句事 → 一行回报 → 底部水墨插画。
 * 扫一眼靠色+图区分险径 / 奇遇 / 寻常道；文案只补「交不交手」和「换来什么」。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager, Ease } from '@/core/TweenManager';
import {
  rollTowerEvent, TOWER_FLOOR_KINDS,
  type TowerEventDef, type TowerFloorKind,
} from '@/balance/towerPath';
import { towerAffixSummary } from '@/balance/towerAffix';
import { towerPathArt, towerPathPickerAssets } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { resolveTowerEvent, resolveTowerRest } from '@/game/towerEventResolve';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { COLORS, FONT_SIZE, RADIUS, SPACING } from '@/ui/theme';
import type { TowerEventDelta, TowerEventOutcome } from '@/game/towerEventResolve';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const TITLE_BROWN = 0x5c4033;
const PAD = 16;
const CARD_GAP = 10;
/** 含底部插画，贴近 implemented-01 的竖卡比例 */
const CARD_H = 268;
const ART_H = 118;
const TEXT_ZONE_H = CARD_H - ART_H;

const KIND_STYLE: Readonly<Record<TowerFloorKind, {
  border: number; bg: number; badgeBg: number; badgeFill: number; nameFill: number;
}>> = {
  battle: {
    border: 0xb08a52, bg: 0xfdf6e9,
    badgeBg: 0xfff3d8, badgeFill: 0x7a5520, nameFill: 0x7a5520,
  },
  elite: {
    border: 0xc85a4a, bg: 0xfdeeea,
    badgeBg: 0xfadad4, badgeFill: 0xa83a2c, nameFill: 0xa83a2c,
  },
  event: {
    border: 0x4a86c8, bg: 0xeef4fd,
    badgeBg: 0xdceaf8, badgeFill: 0x2f5f96, nameFill: 0x2f5f96,
  },
  rest: {
    border: 0x5aa86a, bg: 0xeefaf0,
    badgeBg: 0xd8f0de, badgeFill: 0x2f7040, nameFill: 0x2f7040,
  },
  guard: {
    border: 0xd8a63c, bg: 0xfff3d8,
    badgeBg: 0xffe6b0, badgeFill: 0x8a5a10, nameFill: 0x8a5a10,
  },
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
export async function showTowerPathPicker(
  layer: PIXI.Container,
  floor: number,
): Promise<TowerPathChoice | null> {
  const paths = PlayerData.towerPaths();
  // 单一路径（前几层与守关层）不值得为了一次点击多插一屏
  if (paths.length <= 1) {
    const kind = paths[0] ?? 'battle';
    PlayerData.chooseTowerPath(kind);
    return { kind, needsBattle: TOWER_FLOOR_KINDS[kind].combat };
  }

  await TextureCache.preload(towerPathPickerAssets(paths));

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
      196,
      (Game.logicWidth - PAD * 2 - 40 - CARD_GAP * (paths.length - 1)) / paths.length,
    );
    const panelW = cardW * paths.length + CARD_GAP * (paths.length - 1) + PAD * 2;
    const panelH = CARD_H + 148;

    const panel = new PIXI.Container();
    panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
    root.addChild(panel);
    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 18,
      bg: 0xfffaf0, bgAlpha: 0.98, border: 0xb08a52, borderWidth: 2,
      centered: true,
    }));
    drawCornerFlourishes(panel, panelW, panelH, 0xb08a52);

    const top = -panelH / 2;
    const title = makeText(`第 ${floor} 层 · 择路`, {
      size: FONT_SIZE.lg, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, top + 28);
    panel.addChild(title);

    const sub = makeText('险径有试炼 · 静室回血 · 奇遇看运气', {
      size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5,
      wordWrapWidth: panelW - 40, align: 'center',
    });
    sub.position.set(0, top + 52);
    panel.addChild(sub);

    panel.addChild(buildHpStrip(panelW - PAD * 2, top + 72));

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
        kind === 'rest' ? 'rest' : 'event',
        outcome,
        () => {
          if (!root.destroyed) root.destroy({ children: true });
          resolve({ kind, needsBattle: false });
        },
      ));
    };

    const rowY = top + 102;
    let x = -(panelW / 2) + PAD;
    paths.forEach((kind, i) => {
      const card = buildPathCard(kind, cardW, floor);
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

    const hint = makeText('点遮罩可返回', {
      size: 12, fill: 0x9b8b80, bold: true, anchor: 0.5,
    });
    hint.position.set(0, -top - 18);
    panel.addChild(hint);

    panel.scale.set(0.88);
    TweenManager.to({
      target: panel.scale, props: { x: 1, y: 1 }, duration: 0.28, ease: Ease.easeOutBack,
    });
  });
}

function buildHpStrip(width: number, y: number): PIXI.Container {
  const strip = new PIXI.Container();
  strip.position.set(0, y);

  const label = makeText('本轮生命', {
    size: 12, fill: 0x8a6a4a, bold: true, anchor: [1, 0.5],
  });
  label.position.set(-width / 2 + 56, 0);
  strip.addChild(label);

  const barW = width - 120;
  const barH = 12;
  const barX = -width / 2 + 66;
  const track = new PIXI.Graphics();
  track.beginFill(0xe8dcc8, 1);
  track.drawRoundedRect(barX, -barH / 2, barW, barH, barH / 2);
  track.endFill();
  strip.addChild(track);

  const pct = Math.max(0, Math.min(1, PlayerData.tower.runHpPct));
  if (pct > 0) {
    const fill = new PIXI.Graphics();
    fill.beginFill(pct > 0.35 ? 0xd4a24a : 0xc85a4a, 1);
    fill.drawRoundedRect(barX, -barH / 2, Math.max(barH, barW * pct), barH, barH / 2);
    fill.endFill();
    strip.addChild(fill);
  }

  const pctText = makeText(`${Math.round(pct * 100)}%`, {
    size: 12, fill: TITLE_BROWN, bold: true, anchor: [0, 0.5],
  });
  pctText.position.set(barX + barW + 8, 0);
  strip.addChild(pctText);
  return strip;
}

function scrimOf(): PIXI.Graphics {
  const scrim = new PIXI.Graphics();
  scrim.beginFill(0x000000, 0.6);
  scrim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
  scrim.endFill();
  scrim.eventMode = 'static';
  return scrim;
}

function measureText(text: PIXI.Text): void {
  try {
    text.updateText(true);
  } catch {
    /* 字体未就绪时用布局估算，不能让排版停住 */
  }
}

function buildPathCard(kind: TowerFloorKind, w: number, floor: number): PIXI.Container {
  const def = TOWER_FLOOR_KINDS[kind];
  const style = KIND_STYLE[kind];
  const card = new PIXI.Container();
  card.addChild(makePanel({
    width: w, height: CARD_H, radius: 14,
    bg: style.bg, bgAlpha: 1, border: style.border, borderWidth: 2.5,
    centered: false,
  }));

  const cx = w / 2;
  const badge = buildBadge(def.badge, style.badgeBg, style.border, style.badgeFill);
  badge.position.set(cx, 20);
  card.addChild(badge);

  const name = makeText(def.name, {
    size: FONT_SIZE.md, fill: style.nameFill, bold: true, anchor: 0.5, role: 'title',
  });
  name.position.set(cx, 48);
  card.addChild(name);

  // 说明 / 回报按实测行高往下推，禁止写死 Y：折成两行时不能压住下一句
  const textW = w - SPACING.sm * 2;
  const summary = makeText(towerAffixSummary(floor, kind, def.summary), {
    size: FONT_SIZE.xs, fill: 0x4a3a2c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: textW, align: 'center',
  });
  const payoff = makeText(def.payoff, {
    size: FONT_SIZE.xxs, fill: style.border, bold: true, anchor: [0.5, 0],
    wordWrapWidth: textW, align: 'center',
  });
  measureText(summary);
  measureText(payoff);

  const textBlock = new PIXI.Container();
  summary.position.set(w / 2, 0);
  payoff.position.set(w / 2, summary.height + SPACING.xs);
  textBlock.addChild(summary, payoff);

  const textTop = 66;
  const textMaxH = TEXT_ZONE_H - textTop - SPACING.xs;
  textBlock.pivot.set(w / 2, 0);
  textBlock.position.set(cx, textTop);
  if (textBlock.height > textMaxH && textBlock.height > 0) {
    textBlock.scale.set(textMaxH / textBlock.height);
  }
  card.addChild(textBlock);

  // 底部水墨插画：圆角裁切贴在卡底，一眼分辨三条路
  const artPad = 6;
  const artW = w - artPad * 2;
  const artY = TEXT_ZONE_H + 2;
  const art = mountPathArt(kind, artW, ART_H - 10);
  if (art) {
    art.position.set(artPad, artY);
    card.addChild(art);
  } else {
    const placeholder = new PIXI.Graphics();
    placeholder.beginFill(style.border, 0.12);
    placeholder.drawRoundedRect(artPad, artY, artW, ART_H - 10, 10);
    placeholder.endFill();
    card.addChild(placeholder);
  }

  return card;
}

function mountPathArt(kind: TowerFloorKind, w: number, h: number): PIXI.Container | null {
  const tex = TextureCache.get(towerPathArt(kind));
  if (!tex?.valid) return null;

  const wrap = new PIXI.Container();
  const sp = new PIXI.Sprite(tex);
  // cover：铺满圆角窗，略裁上下边缘保留主体
  const scale = Math.max(w / sp.texture.width, h / sp.texture.height);
  sp.width = sp.texture.width * scale;
  sp.height = sp.texture.height * scale;
  sp.x = (w - sp.width) / 2;
  sp.y = (h - sp.height) / 2;
  wrap.addChild(sp);

  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff, 1);
  mask.drawRoundedRect(0, 0, w, h, 10);
  mask.endFill();
  wrap.addChild(mask);
  wrap.mask = mask;
  return wrap;
}

function buildBadge(
  text: string,
  bgColor: number,
  border: number,
  fill: number,
): PIXI.Container {
  const badge = new PIXI.Container();
  const label = makeText(text, {
    size: 12, fill, bold: true, anchor: 0.5,
  });
  const bw = Math.max(56, label.width + 18);
  const bh = 22;
  const bg = new PIXI.Graphics();
  bg.beginFill(bgColor, 1);
  bg.lineStyle(1.5, border, 0.9);
  bg.drawRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  bg.endFill();
  badge.addChild(bg);
  badge.addChild(label);
  return badge;
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

function deltaStyle(tone: TowerEventDelta['tone']): { bg: number; border: number; fill: number; mark: string } {
  if (tone === 'loss') {
    return { bg: 0xfde8e4, border: COLORS.btnDangerBorder, fill: COLORS.btnDangerBorder, mark: '−' };
  }
  if (tone === 'gain') {
    return { bg: 0xe8f4e0, border: COLORS.btnSuccessBorder, fill: COLORS.textPositive, mark: '+' };
  }
  return { bg: COLORS.panelBg, border: COLORS.panelBorderSoft, fill: COLORS.textSub, mark: '·' };
}

function buildDeltaRow(delta: TowerEventDelta, width: number): PIXI.Container {
  const style = deltaStyle(delta.tone);
  const h = 42;
  const row = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.beginFill(style.bg, 0.96);
  bg.lineStyle(2, style.border, 0.9);
  bg.drawRoundedRect(-width / 2, -h / 2, width, h, RADIUS.chip);
  bg.endFill();
  row.addChild(bg);

  const mark = makeText(style.mark, {
    size: FONT_SIZE.sm, fill: style.fill, bold: true, anchor: 0.5,
  });
  mark.position.set(-width / 2 + 22, 0);
  row.addChild(mark);

  const label = makeText(delta.label, {
    size: FONT_SIZE.xs, fill: style.fill, bold: true, anchor: [0, 0.5],
    wordWrapWidth: width - 56,
  });
  measureText(label);
  label.position.set(-width / 2 + 38, 0);
  row.addChild(label);
  return row;
}

function buildOutcomePanel(
  title: string,
  artKind: 'event' | 'rest',
  outcome: TowerEventOutcome,
  onClose: () => void,
): PIXI.Container {
  const panelW = Math.min(520, Game.logicWidth - 48);
  const innerW = panelW - 40;
  const artH = 132;
  const padTop = 12;
  const padBottom = 18;
  const btnW = 220;
  const btnH = 48;

  const head = makeText(title, {
    size: FONT_SIZE.md, fill: TITLE_BROWN, bold: true, anchor: [0.5, 0], role: 'title',
  });
  measureText(head);
  const flavor = makeText(outcome.flavor, {
    size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0.5, 0],
    wordWrapWidth: innerW, align: 'center',
  });
  measureText(flavor);

  const rows = outcome.deltas.map((d) => buildDeltaRow(d, innerW));
  const rowGap = 8;
  const rowsH = rows.length * 42 + Math.max(0, rows.length - 1) * rowGap;
  const hpH = 28;
  const warnH = outcome.nextMustFight ? 22 : 0;
  const panelH = Math.ceil(
    padTop + artH + 12 + head.height + 6 + flavor.height + 14
    + rowsH + 12 + hpH + (warnH ? warnH + 8 : 0) + 16 + btnH + padBottom,
  );

  const panel = new PIXI.Container();
  panel.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
  panel.addChild(makePanel({
    width: panelW, height: panelH, radius: 16,
    bg: COLORS.panelBg, bgAlpha: 0.98, border: COLORS.panelBorder, borderWidth: 2,
    centered: true,
  }));
  drawCornerFlourishes(panel, panelW, panelH, COLORS.panelBorder);

  let y = -panelH / 2 + padTop;
  const art = mountPathArt(artKind, innerW, artH);
  if (art) {
    art.position.set(-innerW / 2, y);
    panel.addChild(art);
  } else {
    const ph = new PIXI.Graphics();
    ph.beginFill(COLORS.panelBgAlt, 0.9);
    ph.drawRoundedRect(-innerW / 2, y, innerW, artH, 10);
    ph.endFill();
    panel.addChild(ph);
  }
  y += artH + 12;

  head.position.set(0, y);
  panel.addChild(head);
  y += head.height + 6;
  flavor.position.set(0, y);
  panel.addChild(flavor);
  y += flavor.height + 14;

  for (const row of rows) {
    row.position.set(0, y + 21);
    panel.addChild(row);
    y += 42 + rowGap;
  }
  y += 4;

  const hp = buildHpStrip(innerW, y + 8);
  panel.addChild(hp);
  y += hpH + 8;

  if (outcome.nextMustFight) {
    const warn = makeText('本层未交手 · 下一层必须开战', {
      size: FONT_SIZE.xxs, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    warn.position.set(0, y + 10);
    panel.addChild(warn);
    y += warnH + 8;
  }
  y += 8;

  const btn = new PIXI.Container();
  btn.position.set(0, y + btnH / 2);
  const bg = new PIXI.Graphics();
  bg.beginFill(COLORS.btnPrimaryBg, 1);
  bg.lineStyle(2.5, COLORS.btnPrimaryBorder, 1);
  bg.drawRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, btnH / 2);
  bg.endFill();
  btn.addChild(bg);
  btn.addChild(makeText('继续登塔', {
    size: FONT_SIZE.sm, fill: COLORS.btnText, bold: true, anchor: 0.5, role: 'title',
  }));
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
