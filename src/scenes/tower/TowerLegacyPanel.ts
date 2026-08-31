/**
 * 传承面板：塔币（登塔印记）的唯一消耗端。
 *
 * 视觉对齐 docs/ui-redesign/tower/legacy-ui-v1.png ——
 * 卷轴金玉边框 + 圆形节点图标 + 三列色带 + 人话教学句。
 * 「传承」有限永久解锁；印记兑换在商店，不在这里另开一口。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { TweenManager, Ease } from '@/core/TweenManager';
import {
  LEGACY_LINE_HINT, LEGACY_LINE_NAME, LEGACY_PANEL_FOOTER, LEGACY_PANEL_INTRO,
  TOWER_LEGACY_NODES,
  type LegacyLine, type TowerLegacyNode,
} from '@/balance/towerLegacy';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  bindLazySprite, makeCloseButton, makePanel, makeText, pressFeedback,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { analytics } from '@/analytics';

const LINES: readonly LegacyLine[] = ['insight', 'root', 'legacy'];

/** 三列强调色：描边 / 标签（玉绿 / 陶红 / 蜜琥珀） */
const LINE_ACCENT: Readonly<Record<LegacyLine, number>> = {
  insight: 0x6b8f6a,
  root: 0xc47a5a,
  legacy: 0xd4a24a,
};

/** 列头卷云匾贴图（自原型裁切，含卷云与描边；字由代码渲染） */
const LINE_PLAQUE: Readonly<Record<LegacyLine, string>> = {
  insight: UI_IMAGES.towerLegacyPlaqueInsight,
  root: UI_IMAGES.towerLegacyPlaqueRoot,
  legacy: UI_IMAGES.towerLegacyPlaqueLegacy,
};

/** 列头匾缺图时的兜底实心色（对齐原型采样：橄榄玉 / 陶橙 / 蜜金） */
const LINE_BANNER: Readonly<Record<LegacyLine, number>> = {
  insight: 0xb0b28d,
  root: 0xdfb07e,
  legacy: 0xe4c37c,
};

/** 列底板淡染：原型里与羊皮纸几乎同色，只留一点色相，别糊成色块 */
const LINE_WASH: Readonly<Record<LegacyLine, number>> = {
  insight: 0xeee5cd,
  root: 0xf0e3cd,
  legacy: 0xf1e7ca,
};

const NODE_ICON: Readonly<Record<string, string>> = {
  legacy_pick_wide: UI_IMAGES.towerLegacyPickWide,
  legacy_reroll: UI_IMAGES.towerLegacyReroll,
  legacy_insight: UI_IMAGES.towerLegacyInsight,
  legacy_start_bless: UI_IMAGES.towerLegacyStartBless,
  legacy_checkpoint: UI_IMAGES.towerLegacyCheckpoint,
  legacy_second_wind: UI_IMAGES.towerLegacySecondWind,
  legacy_regen: UI_IMAGES.towerLegacyRegen,
  legacy_coin: UI_IMAGES.towerLegacyCoin,
};

const LEGACY_ASSET_PATHS: readonly string[] = [
  UI_IMAGES.towerLegacyPanelBg,
  UI_IMAGES.towerCurrencySeal,
  UI_IMAGES.towerLegacyPlaqueInsight,
  UI_IMAGES.towerLegacyPlaqueRoot,
  UI_IMAGES.towerLegacyPlaqueLegacy,
  ...Object.values(NODE_ICON),
];

/** 装饰框内安全区比例（相对整板宽高；角饰/莲花/流苏之外） */
const INSET = { left: 0.078, right: 0.078, top: 0.085, bottom: 0.095 } as const;
const COL_GAP = 10;
/** 三列统一卡高：按「最多条目数」算，少条目的列顶对齐留空，绝不再按本列条数拉高 */
const NODE_H_MIN = 118;
const NODE_GAP = 8;
const ICON_SIZE = 44;
const INK = 0x4a3428;
const GOLD = 0xc9a15b;
/** 外层羊皮纸（对齐原型暖米） */
const PARCHMENT = 0xf1e2c7;
/** 节点卡面（对齐原型采样 ~238,222,195） */
const CARD_BG = 0xeedec3;
const CARD_BG_MAXED = 0xe4d6bc;

/**
 * 打开传承面板。
 * @param onClose 关闭回调，供调用场景重建自身以刷新塔币等展示
 */
export function showTowerLegacyPanel(
  parent: PIXI.Container,
  onClose?: () => void,
): void {
  const w = Game.logicWidth;
  const h = Game.logicHeight;

  const root = new PIXI.Container();
  parent.addChild(root);

  const scrim = new PIXI.Graphics();
  scrim.beginFill(COLORS.scrim, 0.62);
  scrim.drawRect(0, 0, w, h);
  scrim.endFill();
  scrim.eventMode = 'static';
  root.addChild(scrim);

  const panelW = Math.min(720, w - 28);
  const panelH = Math.min(h - 56, 820);
  const panel = new PIXI.Container();
  panel.position.set(w / 2, h / 2);
  root.addChild(panel);

  /** 装饰框内安全区（相对 panel 中心坐标系） */
  const contentLeft = -panelW / 2 + panelW * INSET.left;
  const contentRight = panelW / 2 - panelW * INSET.right;
  const contentTop = -panelH / 2 + panelH * INSET.top;
  const contentBottom = panelH / 2 - panelH * INSET.bottom;
  const contentW = contentRight - contentLeft;

  const unbinds: Array<() => void> = [];
  const close = (): void => {
    if (root.destroyed) return;
    for (const u of unbinds) u();
    unbinds.length = 0;
    root.destroy({ children: true });
    onClose?.();
  };
  bindPointerTap(scrim, close);

  const render = (): void => {
    for (const u of unbinds) u();
    unbinds.length = 0;
    panel.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 仅卷轴框贴图（外沿透明）；缺图时只画内区羊皮纸，绝不再铺整板奶油底
    const bgSpr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    bgSpr.anchor.set(0.5);
    bgSpr.eventMode = 'none';
    panel.addChild(bgSpr);
    const fitBg = (tex: PIXI.Texture): void => {
      bgSpr.texture = tex;
      bgSpr.width = panelW;
      bgSpr.height = panelH;
      // 原图偏冷白，轻暖色 tint 对齐 UI 原型羊皮纸
      bgSpr.tint = 0xf2e2c4;
    };
    const cachedBg = TextureCache.get(UI_IMAGES.towerLegacyPanelBg);
    if (cachedBg?.width) {
      fitBg(cachedBg);
    } else {
      const fallback = new PIXI.Graphics();
      fallback.beginFill(PARCHMENT, 0.96);
      fallback.lineStyle(2, GOLD, 0.85);
      fallback.drawRoundedRect(contentLeft, contentTop, contentW, contentBottom - contentTop, 16);
      fallback.endFill();
      panel.addChildAt(fallback, 0);
      unbinds.push(bindLazySprite(bgSpr, {
        path: UI_IMAGES.towerLegacyPanelBg,
        ensure: true,
        onApplied: (tex) => {
          fitBg(tex);
          fallback.visible = false;
        },
      }));
    }

    // 关闭：落在内区左上角，不骑到框外
    const closeWrap = new PIXI.Container();
    closeWrap.position.set(contentLeft + 18, contentTop + 18);
    const closeRing = new PIXI.Graphics();
    closeRing.lineStyle(2.2, 0x6b9e7a, 0.95);
    closeRing.beginFill(0xf5efe4, 0.95);
    closeRing.drawCircle(0, 0, 15);
    closeRing.endFill();
    closeWrap.addChild(closeRing);
    closeWrap.addChild(makeCloseButton({
      onTap: close, size: 34, arm: 7, color: INK,
    }));
    panel.addChild(closeWrap);

    const title = makeText('传承', {
      size: FONT_SIZE.lg, fill: INK, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, contentTop + 20);
    panel.addChild(title);

    panel.addChild(buildBalanceChip(contentRight - 4, contentTop + 20, unbinds));

    const intro = makeText(LEGACY_PANEL_INTRO, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: 0.5,
      wordWrapWidth: contentW - 24, align: 'center',
    });
    intro.position.set(0, contentTop + 46);
    panel.addChild(intro);

    const bodyTop = contentTop + 72;
    const footerReserve = 30;
    const bodyBottom = contentBottom - footerReserve;
    panel.addChild(buildLegacyBody(
      contentLeft, contentW, bodyTop, bodyBottom, render, unbinds,
    ));

    // 底栏教学：贴内区底边之上
    const footerY = contentBottom - 12;
    const rule = new PIXI.Graphics();
    const ruleHalf = contentW * 0.34;
    rule.lineStyle(1.2, GOLD, 0.55);
    rule.moveTo(-ruleHalf, footerY - 12);
    rule.lineTo(-8, footerY - 12);
    rule.moveTo(8, footerY - 12);
    rule.lineTo(ruleHalf, footerY - 12);
    rule.beginFill(GOLD, 0.7);
    rule.drawPolygon([-4, footerY - 12, 0, footerY - 16, 4, footerY - 12, 0, footerY - 8]);
    rule.endFill();
    panel.addChild(rule);

    const footer = makeText(LEGACY_PANEL_FOOTER, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: 0.5,
      wordWrapWidth: contentW - 16, align: 'center',
    });
    footer.position.set(0, footerY);
    panel.addChild(footer);
  };

  render();

  void ensureAssets([...LEGACY_ASSET_PATHS]).then(() => {
    if (!root.destroyed) render();
  }).catch((e) => {
    console.warn('[TowerLegacy] 资源预热失败', e);
  });

  panel.scale.set(0.9);
  panel.alpha = 0;
  TweenManager.to({
    target: panel.scale, props: { x: 1, y: 1 }, duration: 0.26, ease: Ease.easeOutBack,
  });
  TweenManager.to({ target: panel, props: { alpha: 1 }, duration: 0.18 });
}

function buildBalanceChip(
  x: number,
  y: number,
  unbinds: Array<() => void>,
): PIXI.Container {
  const chip = new PIXI.Container();
  const label = makeText(`印记 ${PlayerData.towerCoins}`, {
    size: FONT_SIZE.xs, fill: INK, bold: true, anchor: [0, 0.5],
  });
  const iconSize = 24;
  const padX = 10;
  const h = 32;
  const w = iconSize + 6 + label.width + padX * 2;

  const bg = new PIXI.Graphics();
  bg.beginFill(0xe8f0e4, 0.95);
  bg.lineStyle(1.5, 0x6b9e7a, 0.85);
  bg.drawRoundedRect(-w, -h / 2, w, h, h / 2);
  bg.endFill();
  chip.addChild(bg);

  const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
  icon.anchor.set(0.5);
  icon.position.set(-w + padX + iconSize / 2, 0);
  chip.addChild(icon);
  unbinds.push(bindLazySprite(icon, {
    path: UI_IMAGES.towerCurrencySeal,
    ensure: true,
    onApplied: (tex) => {
      icon.texture = tex;
      icon.scale.set(iconSize / Math.max(tex.width, tex.height));
    },
  }));

  label.position.set(-w + padX + iconSize + 6, 0);
  chip.addChild(label);
  chip.position.set(x, y);
  return chip;
}

function buildLegacyBody(
  contentLeft: number,
  contentW: number,
  top: number,
  bottom: number,
  refresh: () => void,
  unbinds: Array<() => void>,
): PIXI.Container {
  const body = new PIXI.Container();
  const colW = (contentW - COL_GAP * (LINES.length - 1)) / LINES.length;

  // 三列统一行高：按最多条目的那一列算，少条目列顶对齐、底下留空
  const maxNodes = Math.max(
    ...LINES.map((line) => TOWER_LEGACY_NODES.filter((n) => n.line === line).length),
  );
  // 匾额贴图原始 244x74。面板比原型更方，等比会吃掉描述的行高，故压上限
  const plaqueW = colW - 4;
  const bannerH = Math.min(46, Math.round(plaqueW * 74 / 244));
  const hintReserve = 24;
  const cardsTop = bannerH + hintReserve;
  const avail = bottom - top - cardsTop - Math.max(0, maxNodes - 1) * NODE_GAP;
  const nodeH = Math.max(NODE_H_MIN, avail / maxNodes);

  let x = contentLeft;
  for (const line of LINES) {
    const col = new PIXI.Container();
    col.position.set(x, top);
    body.addChild(col);
    x += colW + COL_GAP;

    const accent = LINE_ACCENT[line];
    const colH = bottom - top;

    // 列底板：暖色淡染 + 细色框；顶边压在匾额下半，做出「匾骑框上」的原型效果
    const trackTop = bannerH * 0.55;
    const track = new PIXI.Graphics();
    track.beginFill(LINE_WASH[line], 0.9);
    track.lineStyle(1.6, accent, 0.5);
    track.drawRoundedRect(0, trackTop, colW, colH - trackTop, 12);
    track.endFill();
    col.addChild(track);

    // 列头卷云匾：直接用原型裁图，缺图时兜底画实心匾
    const plaqueSpr = new PIXI.Sprite(PIXI.Texture.EMPTY);
    plaqueSpr.eventMode = 'none';
    plaqueSpr.position.set((colW - plaqueW) / 2, 0);
    plaqueSpr.width = plaqueW;
    plaqueSpr.height = bannerH;
    const cachedPlaque = TextureCache.get(LINE_PLAQUE[line]);
    if (cachedPlaque?.width) {
      plaqueSpr.texture = cachedPlaque;
      col.addChild(plaqueSpr);
    } else {
      const fallbackPlaque = buildLinePlaque(colW, bannerH, LINE_BANNER[line], accent);
      col.addChild(fallbackPlaque);
      col.addChild(plaqueSpr);
      unbinds.push(bindLazySprite(plaqueSpr, {
        path: LINE_PLAQUE[line],
        ensure: true,
        onApplied: (tex) => {
          plaqueSpr.texture = tex;
          plaqueSpr.width = plaqueW;
          plaqueSpr.height = bannerH;
          fallbackPlaque.visible = false;
        },
      }));
    }

    const header = makeText(LEGACY_LINE_NAME[line], {
      size: FONT_SIZE.sm, fill: INK, bold: true, anchor: 0.5, role: 'title',
    });
    header.position.set(colW / 2, bannerH * 0.5);
    col.addChild(header);

    const hint = makeText(LEGACY_LINE_HINT[line], {
      size: FONT_SIZE.xxs + 1, fill: 0x6b5a48, anchor: 0.5,
      wordWrapWidth: colW - 10, align: 'center',
    });
    hint.position.set(colW / 2, bannerH + 13);
    col.addChild(hint);

    const nodes = TOWER_LEGACY_NODES.filter((n) => n.line === line);
    let y = cardsTop;
    for (const node of nodes) {
      const card = buildNodeCard(node, colW - 8, nodeH, refresh, unbinds);
      card.position.set(4, y);
      col.addChild(card);
      y += nodeH + NODE_GAP;
    }
  }
  return body;
}

/** 列头色匾：实心填充 + 深色内描边 + 两端装饰点 */
function buildLinePlaque(
  w: number,
  h: number,
  fill: number,
  accent: number,
): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const padX = 6;
  // 外阴影条（轻）
  g.beginFill(accent, 0.18);
  g.drawRoundedRect(padX + 1, 3, w - padX * 2, h, 10);
  g.endFill();
  // 实心匾
  g.beginFill(fill, 1);
  g.lineStyle(1.6, accent, 0.9);
  g.drawRoundedRect(padX, 1, w - padX * 2, h, 10);
  g.endFill();
  // 内细线
  g.lineStyle(1, 0xfff6e4, 0.35);
  g.drawRoundedRect(padX + 3, 4, w - padX * 2 - 6, h - 6, 8);
  // 两端卷云圆点
  g.lineStyle(0);
  g.beginFill(accent, 0.85);
  g.drawCircle(padX + 11, 1 + h / 2, 3);
  g.drawCircle(w - padX - 11, 1 + h / 2, 3);
  g.endFill();
  g.beginFill(0xfff6e4, 0.55);
  g.drawCircle(padX + 11, 1 + h / 2, 1.3);
  g.drawCircle(w - padX - 11, 1 + h / 2, 1.3);
  g.endFill();
  return g;
}

function buildNodeCard(
  node: TowerLegacyNode,
  w: number,
  h: number,
  refresh: () => void,
  unbinds: Array<() => void>,
): PIXI.Container {
  const level = PlayerData.towerLegacyLevel(node.id);
  const maxLevel = node.costs.length;
  const cost = PlayerData.towerLegacyCost(node.id);
  const maxed = cost == null;
  const affordable = !maxed && PlayerData.towerCoins >= cost;

  const card = new PIXI.Container();

  // 可买高亮外发光（对齐原型「重掷」选中态）
  if (affordable) {
    const glow = new PIXI.Graphics();
    glow.beginFill(0xf0c45a, 0.18);
    glow.drawRoundedRect(-3, -3, w + 6, h + 6, 14);
    glow.endFill();
    card.addChild(glow);
  }

  card.addChild(makePanel({
    width: w, height: h, radius: 12,
    bg: maxed ? CARD_BG_MAXED : CARD_BG, bgAlpha: 1,
    border: maxed ? 0xc4b49a : (affordable ? 0xd8a63c : 0xc9b89a),
    borderWidth: affordable ? 2.2 : 1.4,
    centered: false,
  }));

  // 上部：图标 + 名称同一水平带；描述通栏放下方，避免挤在窄栏里换成三四行
  const iconPath = NODE_ICON[node.id];
  const iconX = 9 + ICON_SIZE / 2;
  const iconY = 8 + ICON_SIZE / 2;
  if (iconPath) {
    const ph = new PIXI.Graphics();
    ph.beginFill(0xe8dfd0, 1);
    ph.lineStyle(1.5, GOLD, 0.7);
    ph.drawCircle(iconX, iconY, ICON_SIZE / 2 - 1);
    ph.endFill();
    card.addChild(ph);

    const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
    icon.anchor.set(0.5);
    icon.position.set(iconX, iconY);
    card.addChild(icon);
    unbinds.push(bindLazySprite(icon, {
      path: iconPath,
      ensure: true,
      onApplied: (tex) => {
        icon.texture = tex;
        icon.scale.set(ICON_SIZE / Math.max(tex.width, tex.height));
        ph.visible = false;
      },
    }));
  }

  const textLeft = 9 + ICON_SIZE + 8;
  const name = makeText(node.name, {
    size: FONT_SIZE.xs, fill: maxed ? 0x8a8078 : INK, bold: true, anchor: [0, 0.5],
  });
  name.position.set(textLeft, iconY - 10);
  card.addChild(name);

  const metaY = iconY + 6;
  if (node.tag && level === 0) {
    const tag = buildTag(node.tag, node.line);
    tag.position.set(textLeft, metaY - 9);
    card.addChild(tag);
  } else if (maxLevel > 1) {
    const dots = new PIXI.Graphics();
    const dotR = 3.4;
    const dotGap = 11;
    for (let i = 0; i < maxLevel; i++) {
      dots.beginFill(i < level ? 0xd8a63c : 0xd8d0c4, 1);
      dots.drawCircle(textLeft + dotR + i * dotGap, metaY, dotR);
      dots.endFill();
    }
    card.addChild(dots);
  }

  // 价格 chip：钉在卡底居中，先占位，描述再按剩余高度排
  const priceLabel = maxed ? '已圆满' : `${cost}`;
  const price = makeText(priceLabel, {
    size: FONT_SIZE.xxs + 2,
    fill: maxed ? COLORS.textDisabled : (affordable ? 0xfffaf0 : 0xb0a496),
    bold: true, anchor: [0, 0.5],
  });
  const chipH = 26;
  const chipPad = 10;
  const sealS = maxed ? 0 : 18;
  const chipW = chipPad + sealS + (sealS ? 4 : 0) + price.width + chipPad;
  const chipX = (w - chipW) / 2;
  const chipY = h - 8 - chipH;

  const descTop = 8 + ICON_SIZE + 5;
  const desc = makeText(node.desc(maxed ? level : level + 1), {
    size: FONT_SIZE.xxs + 1, fill: 0x5b4a3c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: w - 20, align: 'center',
  });
  desc.position.set(w / 2, descTop);
  card.addChild(desc);

  const chipBg = new PIXI.Graphics();
  if (maxed) {
    chipBg.beginFill(0xe8e0d4, 1);
    chipBg.lineStyle(1, 0xc4b49a, 1);
  } else if (affordable) {
    chipBg.beginFill(0x5f8a68, 1);
    chipBg.lineStyle(1, 0x3f6a48, 1);
  } else {
    chipBg.beginFill(0xf3efe4, 1);
    chipBg.lineStyle(1, 0xd4c8b4, 1);
  }
  chipBg.drawRoundedRect(chipX, chipY, chipW, chipH, chipH / 2);
  chipBg.endFill();
  card.addChild(chipBg);

  let px = chipX + chipPad;
  if (!maxed) {
    const seal = new PIXI.Sprite(PIXI.Texture.EMPTY);
    seal.anchor.set(0.5);
    seal.position.set(px + sealS / 2, chipY + chipH / 2);
    card.addChild(seal);
    unbinds.push(bindLazySprite(seal, {
      path: UI_IMAGES.towerCurrencySeal,
      ensure: true,
      onApplied: (tex) => {
        seal.texture = tex;
        seal.scale.set(sealS / Math.max(tex.width, tex.height));
      },
    }));
    px += sealS + 4;
  }
  price.position.set(px, chipY + chipH / 2);
  card.addChild(price);

  if (maxed) return card;
  card.eventMode = 'static';
  card.cursor = 'pointer';
  card.hitArea = new PIXI.Rectangle(0, 0, w, h);
  pressFeedback(card);
  bindPointerTap(card, () => {
    if (!PlayerData.upgradeTowerLegacy(node.id)) {
      Platform.showToast('登塔印记不足');
      return;
    }
    analytics.track('tower_legacy_upgrade', {
      node_id: node.id,
      level: PlayerData.towerLegacyLevel(node.id),
      cost,
    });
    Platform.showToast(`${node.name} 已提升`, 'success');
    Platform.vibrateShort('light');
    refresh();
  });
  return card;
}

function buildTag(text: string, line: LegacyLine): PIXI.Container {
  const c = new PIXI.Container();
  const label = makeText(text, {
    size: FONT_SIZE.xxs - 1, fill: 0xfffaf0, bold: true, anchor: [0, 0.5],
  });
  const padX = 7;
  const h = 18;
  const w = label.width + padX * 2;
  const g = new PIXI.Graphics();
  g.beginFill(LINE_ACCENT[line], 0.92);
  g.drawRoundedRect(0, 0, w, h, 6);
  g.endFill();
  c.addChild(g);
  label.position.set(padX, h / 2);
  c.addChild(label);
  return c;
}
