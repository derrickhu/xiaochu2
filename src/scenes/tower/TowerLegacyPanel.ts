/**
 * 传承面板：塔币（登塔印记）的唯一消耗端。
 *
 * 两个页签分工明确 ——「传承」是有限的永久解锁（点满即止），
 * 「兑换」是不封顶的长期出口，靠每日次数限制通胀。缺了后者，
 * 满级玩家的塔币产出会彻底作废，爬塔的长线动机也跟着断掉。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { TweenManager, Ease } from '@/core/TweenManager';
import { formatReward } from '@/balance/rewards';
import {
  LEGACY_LINE_HINT, LEGACY_LINE_NAME, TOWER_EXCHANGES, TOWER_LEGACY_NODES,
  type LegacyLine, type TowerLegacyNode,
} from '@/balance/towerLegacy';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { makePanel } from '@/ui/Panel';
import { makeText } from '@/ui/text';
import { FONT_SIZE } from '@/ui/theme';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { analytics } from '@/analytics';

const LINES: readonly LegacyLine[] = ['insight', 'root', 'legacy'];
const TITLE_BROWN = 0x5c4033;
const GOLD = 0xb08a52;
const PAD = 18;
const COL_GAP = 12;
const NODE_H = 108;
const NODE_GAP = 10;

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
  scrim.beginFill(0x000000, 0.58);
  scrim.drawRect(0, 0, w, h);
  scrim.endFill();
  scrim.eventMode = 'static';
  root.addChild(scrim);

  const panelW = Math.min(600, w - 48);
  const panelH = Math.min(h - 96, 620);
  const panel = new PIXI.Container();
  panel.position.set(w / 2, h / 2);
  root.addChild(panel);

  const close = (): void => {
    if (root.destroyed) return;
    root.destroy({ children: true });
    onClose?.();
  };
  bindPointerTap(scrim, close);

  let tab: 'legacy' | 'exchange' = 'legacy';
  /** 每次操作后整板重绘：面板内容全是派生态，增量更新只会写出对不上的分支 */
  const render = (): void => {
    panel.removeChildren().forEach((c) => c.destroy({ children: true }));

    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 18,
      bg: 0xfffaf0, bgAlpha: 0.98, border: GOLD, borderWidth: 2,
      centered: true,
    }));

    const top = -panelH / 2;
    const title = makeText('传承', {
      size: FONT_SIZE.lg, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, top + 30);
    panel.addChild(title);

    const balance = makeText(`登塔印记 ${PlayerData.towerCoins}`, {
      size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: [1, 0.5],
    });
    balance.position.set(panelW / 2 - PAD, top + 30);
    panel.addChild(balance);

    const closeBtn = makeText('✕', {
      size: FONT_SIZE.md, fill: 0x9b8b80, bold: true, anchor: [0, 0.5],
    });
    closeBtn.position.set(-panelW / 2 + PAD, top + 30);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.hitArea = new PIXI.Rectangle(-10, -16, 36, 32);
    bindPointerTap(closeBtn, close);
    panel.addChild(closeBtn);

    panel.addChild(buildTabs(panelW, top + 62, tab, (next) => {
      tab = next;
      render();
    }));

    const bodyTop = top + 92;
    const bodyH = panelH / 2 - 20 - bodyTop;
    if (tab === 'legacy') {
      panel.addChild(buildLegacyBody(panelW, bodyTop, render));
    } else {
      panel.addChild(buildExchangeBody(panelW, bodyTop, bodyH, render));
    }
  };
  render();

  panel.scale.set(0.9);
  panel.alpha = 0;
  TweenManager.to({
    target: panel.scale, props: { x: 1, y: 1 }, duration: 0.26, ease: Ease.easeOutBack,
  });
  TweenManager.to({ target: panel, props: { alpha: 1 }, duration: 0.18 });
}

function buildTabs(
  panelW: number,
  y: number,
  active: 'legacy' | 'exchange',
  onSwitch: (tab: 'legacy' | 'exchange') => void,
): PIXI.Container {
  const row = new PIXI.Container();
  row.position.set(0, y);
  const tabs: Array<{ id: 'legacy' | 'exchange'; label: string }> = [
    { id: 'legacy', label: '传承' },
    { id: 'exchange', label: '兑换' },
  ];
  const tabW = 108;
  const tabH = 30;
  let x = -(tabs.length * tabW + (tabs.length - 1) * 10) / 2 + tabW / 2;

  for (const t of tabs) {
    const on = t.id === active;
    const item = new PIXI.Container();
    item.position.set(x, 0);
    const bg = new PIXI.Graphics();
    bg.beginFill(on ? 0xf0d9a8 : 0xf5efe4, 1);
    bg.lineStyle(1.5, on ? GOLD : 0xd4c8b4, 1);
    bg.drawRoundedRect(-tabW / 2, -tabH / 2, tabW, tabH, tabH / 2);
    bg.endFill();
    item.addChild(bg);
    const label = makeText(t.label, {
      size: FONT_SIZE.xs, fill: on ? 0x5c4033 : 0x9b8b80, bold: true, anchor: 0.5,
    });
    item.addChild(label);

    if (!on) {
      item.eventMode = 'static';
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(-tabW / 2, -tabH / 2, tabW, tabH);
      pressFeedback(item);
      bindPointerTap(item, () => onSwitch(t.id));
    }
    row.addChild(item);
    x += tabW + 10;
  }
  return row;
}

function buildLegacyBody(
  panelW: number,
  top: number,
  refresh: () => void,
): PIXI.Container {
  const body = new PIXI.Container();
  const colW = (panelW - PAD * 2 - COL_GAP * (LINES.length - 1)) / LINES.length;
  let x = -panelW / 2 + PAD;

  for (const line of LINES) {
    const col = new PIXI.Container();
    col.position.set(x, top);
    body.addChild(col);
    x += colW + COL_GAP;

    const header = makeText(LEGACY_LINE_NAME[line], {
      size: FONT_SIZE.sm, fill: TITLE_BROWN, bold: true, anchor: 0.5, role: 'title',
    });
    header.position.set(colW / 2, 10);
    col.addChild(header);

    const hint = makeText(LEGACY_LINE_HINT[line], {
      size: 11, fill: 0x9b8b80, bold: true, anchor: 0.5,
      wordWrapWidth: colW - 8, align: 'center',
    });
    hint.position.set(colW / 2, 30);
    col.addChild(hint);

    let y = 46;
    for (const node of TOWER_LEGACY_NODES.filter((n) => n.line === line)) {
      const card = buildNodeCard(node, colW, refresh);
      card.position.set(0, y);
      col.addChild(card);
      y += NODE_H + NODE_GAP;
    }
  }
  return body;
}

function buildNodeCard(
  node: TowerLegacyNode,
  w: number,
  refresh: () => void,
): PIXI.Container {
  const level = PlayerData.towerLegacyLevel(node.id);
  const maxLevel = node.costs.length;
  const cost = PlayerData.towerLegacyCost(node.id);
  const maxed = cost == null;
  const affordable = !maxed && PlayerData.towerCoins >= cost;

  const card = new PIXI.Container();
  card.addChild(makePanel({
    width: w, height: NODE_H, radius: 12,
    bg: maxed ? 0xf3efe4 : 0xfdf6e9, bgAlpha: 1,
    border: maxed ? 0xc4b49a : (affordable ? 0xd8a63c : 0xd4c8b4),
    borderWidth: affordable ? 2 : 1.5,
    centered: false,
  }));

  const cx = w / 2;
  const name = makeText(node.name, {
    size: FONT_SIZE.xs, fill: maxed ? 0x8a8078 : 0x7a5520, bold: true, anchor: 0.5,
  });
  name.position.set(cx, 16);
  card.addChild(name);

  // 等级点：一眼看出还能升几级，比 "2/3" 更快读
  const dots = new PIXI.Graphics();
  const dotR = 3.5;
  const dotGap = 11;
  const dotStart = cx - ((maxLevel - 1) * dotGap) / 2;
  for (let i = 0; i < maxLevel; i++) {
    dots.beginFill(i < level ? 0xd8a63c : 0xd8d0c4, 1);
    dots.drawCircle(dotStart + i * dotGap, 32, dotR);
    dots.endFill();
  }
  card.addChild(dots);

  // 未满级时展示「下一级」的效果，玩家看到的就是买完之后的样子
  const desc = makeText(node.desc(maxed ? level : level + 1), {
    size: 11, fill: 0x5b4a3c, bold: true, anchor: [0.5, 0],
    wordWrapWidth: w - 16, align: 'center',
  });
  desc.position.set(cx, 44);
  card.addChild(desc);

  const footer = makeText(
    maxed ? '已圆满' : `${cost} 印记`,
    {
      size: 12,
      fill: maxed ? 0x9b8b80 : (affordable ? 0x7a5520 : 0xb0a496),
      bold: true, anchor: 0.5,
    },
  );
  footer.position.set(cx, NODE_H - 16);
  card.addChild(footer);

  if (maxed) return card;
  card.eventMode = 'static';
  card.cursor = 'pointer';
  card.hitArea = new PIXI.Rectangle(0, 0, w, NODE_H);
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

function buildExchangeBody(
  panelW: number,
  top: number,
  bodyH: number,
  refresh: () => void,
): PIXI.Container {
  const body = new PIXI.Container();
  const w = panelW - PAD * 2;
  const rowH = 72;

  const intro = makeText('传承点满之后，印记仍可持续兑换资源（每日限量）', {
    size: 12, fill: 0x9b8b80, bold: true, anchor: 0.5,
    wordWrapWidth: w, align: 'center',
  });
  intro.position.set(0, top + 8);
  body.addChild(intro);

  let y = top + 30;
  for (const opt of TOWER_EXCHANGES) {
    const left = PlayerData.towerExchangeLeft(opt.id);
    const affordable = PlayerData.towerCoins >= opt.cost;
    const enabled = left > 0 && affordable;

    const row = new PIXI.Container();
    row.position.set(-w / 2, y);
    body.addChild(row);
    y += rowH + 10;

    row.addChild(makePanel({
      width: w, height: rowH, radius: 12,
      bg: enabled ? 0xfdf6e9 : 0xf3efe4, bgAlpha: 1,
      border: enabled ? 0xd8a63c : 0xd4c8b4, borderWidth: enabled ? 2 : 1.5,
      centered: false,
    }));

    const name = makeText(formatReward(opt.reward), {
      size: FONT_SIZE.xs, fill: enabled ? 0x7a5520 : 0x9b8b80, bold: true, anchor: [0, 0.5],
    });
    name.position.set(16, 24);
    row.addChild(name);

    const limit = makeText(`今日剩余 ${left}/${opt.dailyLimit}`, {
      size: 11, fill: 0x9b8b80, bold: true, anchor: [0, 0.5],
    });
    limit.position.set(16, 50);
    row.addChild(limit);

    const price = makeText(`${opt.cost} 印记`, {
      size: FONT_SIZE.xs,
      fill: enabled ? 0x7a5520 : 0xb0a496,
      bold: true, anchor: [1, 0.5],
    });
    price.position.set(w - 16, rowH / 2);
    row.addChild(price);

    if (!enabled) continue;
    row.eventMode = 'static';
    row.cursor = 'pointer';
    row.hitArea = new PIXI.Rectangle(0, 0, w, rowH);
    pressFeedback(row);
    bindPointerTap(row, () => {
      const done = PlayerData.consumeTowerExchange(opt.id);
      if (!done) {
        Platform.showToast(left <= 0 ? '今日兑换次数已用完' : '登塔印记不足');
        return;
      }
      grantReward(done.reward);
      analytics.track('tower_exchange', { option_id: opt.id, cost: opt.cost });
      Platform.showToast(`兑换成功 · ${formatReward(done.reward)}`, 'success');
      refresh();
    });
  }

  // bodyH 目前仅用于保证内容不越界，超出时收缩间距而不是裁切
  if (y > top + bodyH) body.scale.set(Math.max(0.8, bodyH / (y - top)));
  return body;
}
