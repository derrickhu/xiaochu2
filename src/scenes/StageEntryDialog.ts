/**
 * 主地图点关后的进战前弹层（排版严格对齐 stage-entry-dialog-ui-v2）：
 * 顶匾 → 关卡名/章属性 → 普通|精英胶囊 → 星/体力分栏 → 菱形分节门槛 → 敌情 → 奖励图标 → 出战编队。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import {
  ELITE_MODE, eliteStageIdOf, eliteStageOf, hasEliteVariant, isEliteUnlocked,
} from '@/balance/eliteMode';
import { CHAPTER_NAME, formatStageShortLabel, type StageDef } from '@/balance/stages';
import { ELEMENT_NAME } from '@/balance/ui';
import { getStageType } from '@/balance/stageTypes';
import { ENEMY_MAP } from '@/balance/enemies';
import { CREATURE_MAP } from '@/balance/creatures';
import { starTurnThresholds } from '@/formulas/stars';
import { PlayerData } from '@/game/PlayerData';
import { stageStaminaCost } from '@/game/staminaService';
import { UI_IMAGES } from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makeCloseButton, makePanel, makeText,
  makeModalTitlePlaque, makeStarRow, makeElementOrb,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';

/** 对齐 UI 图：略宽于签到板；PAD_TOP 加大避免关卡名贴顶匾 */
const PANEL_W = 620;
const INNER_W = 540;
const PAD_TOP = 86;
const PAD_BOT = 40;
const SEG_H = 92;
const SEG_GAP = 14;
/** 对齐 UI 图选中绿：偏玉叶绿，非荧光扁色 */
const GREEN = 0x6ec85a;
const GREEN_DEEP = 0x3f8a38;
const GREEN_EDGE = 0x2f6a28;
const CREAM = 0xfff8ec;
const CREAM_RIM = 0xfffdf6;
const GOLD_LINE = 0xc9a063;
const GOLD_LINE_DEEP = 0xb08948;
/** 未选中星级数字（UI 图偏蓝） */
const STAR_COUNT_IDLE = 0x3d7ec9;
/** 内容底板：比外层 panelBg(0xfdf3df) 更淡的奶油白，对齐 UI 图浅嵌板 */
const BOX_BG = 0xfffdf8;
const BOX_W = INNER_W;
const BOX_RADIUS = 14;
const BOX_PAD_X = 22;
const BOX_GAP = 14;

export interface StageEntryDialogHandle {
  dismiss: () => void;
}

export function showStageEntryDialog(
  layer: PIXI.Container,
  baseStage: StageDef,
  opts: {
    onConfirm: (stageId: string) => void;
    onClose?: () => void;
  },
): StageEntryDialogHandle {
  const canElite = hasEliteVariant(baseStage);
  const unlocked = canElite
    && isEliteUnlocked(baseStage, (id) => PlayerData.starsOf(id));
  let eliteOn = false;

  const root = new PIXI.Container();
  root.eventMode = 'static';

  const dim = new PIXI.Graphics();
  dim.beginFill(COLORS.scrim, 0.55);
  dim.drawRect(0, 0, Game.logicWidth, Game.logicHeight);
  dim.endFill();
  dim.eventMode = 'static';
  dim.cursor = 'pointer';
  root.addChild(dim);

  const shell = new PIXI.Container();
  shell.position.set(Game.logicWidth / 2, Game.logicHeight / 2);
  shell.eventMode = 'static';
  root.addChild(shell);

  let closed = false;
  const dismiss = (): void => {
    if (closed) return;
    closed = true;
    TweenManager.cancelTarget(root);
    opts.onClose?.();
    if (!root.destroyed) root.destroy({ children: true });
  };
  bindPointerTap(dim, () => dismiss());

  const paint = (): void => {
    shell.removeChildren().forEach((c) => c.destroy({ children: true }));

    const stage = eliteOn ? (eliteStageOf(baseStage) ?? baseStage) : baseStage;
    const stars = PlayerData.starsOf(stage.id);
    const stamina = stageStaminaCost(stage);
    const { star2, star3 } = starTurnThresholds(stage.starTurnLimit);
    const eliteColor = getStageType('elite').color;

    const body = new PIXI.Container();
    let y = 0;

    // ── 关卡名（无衬线加粗；衬线体在真机上 bold 常失效）──
    const name = makeText(formatStageShortLabel(baseStage), {
      size: 34, fill: COLORS.textMain, bold: true, anchor: [0.5, 0],
      strokeColor: 0xfff8ec, strokeWidth: 3,
    });
    name.position.set(0, y);
    body.addChild(name);
    y += name.height + 14;

    // ── 章 · 属性 + 元素珠（与 UI 图一致）──
    const meta = new PIXI.Container();
    const metaStr = `${CHAPTER_NAME[baseStage.chapter] ?? `第${baseStage.chapter}章`} · ${ELEMENT_NAME[baseStage.element]}`;
    const metaText = makeText(metaStr, {
      size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    const orb = makeElementOrb(baseStage.element, 26);
    const metaW = metaText.width + 8 + 26;
    metaText.position.set(-metaW / 2, 0);
    orb.position.set(-metaW / 2 + metaText.width + 8 + 13, 0);
    meta.addChild(metaText, orb);
    meta.position.set(0, y + 13);
    body.addChild(meta);
    y += 44;

    // ── 普通 | 精英 胶囊 ──
    if (canElite) {
      const seg = buildDifficultyPills({
        width: INNER_W,
        eliteOn,
        unlocked,
        normalStars: PlayerData.starsOf(baseStage.id),
        eliteStars: PlayerData.starsOf(eliteStageIdOf(baseStage.id)),
        onSelect(wantElite) {
          if (wantElite && !unlocked) {
            Platform.showToast(`${ELITE_MODE.unlockStars} 星通关本关后解锁精英模式`);
            return;
          }
          if (wantElite === eliteOn) return;
          eliteOn = wantElite;
          paint();
        },
      });
      seg.root.position.set(-INNER_W / 2, y);
      body.addChild(seg.root);
      y += seg.height + 10;

      const modeHint = makeText(
        eliteOn
          ? `难度 ×${ELITE_MODE.difficultyMult} · 掉通用碎片`
          : unlocked
            ? '默认难度 · 标准奖励'
            : `${ELITE_MODE.unlockStars} 星通关本关后解锁精英`,
        {
          size: FONT_SIZE.xxs,
          fill: eliteOn ? eliteColor : COLORS.textSub,
          bold: true,
          anchor: [0.5, 0],
        },
      );
      modeHint.position.set(0, y);
      body.addChild(modeHint);
      y += modeHint.height + 22;
    } else {
      const typeLine = makeText(`关卡类型 · ${getStageType(baseStage.type).name}`, {
        size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0.5, 0],
      });
      typeLine.position.set(0, y);
      body.addChild(typeLine);
      y += typeLine.height + 22;
    }

    // ── 已获星级 | 体力消耗（双格淡奶油底板）──
    const stats = buildStarStaminaBoxes(stars, stamina);
    stats.root.position.set(0, y);
    body.addChild(stats.root);
    y += stats.height + BOX_GAP;

    // ── 星级回合门槛 / 敌情 / 通关奖励：同款淡奶油底板 ──
    const threshBox = buildStarThresholdBox(star3, star2);
    threshBox.root.position.set(0, y);
    body.addChild(threshBox.root);
    y += threshBox.height + BOX_GAP;

    const enemyBox = buildEnemySummaryBox(stage);
    enemyBox.root.position.set(0, y);
    body.addChild(enemyBox.root);
    y += enemyBox.height + BOX_GAP;

    const rewardBox = buildRewardBox(eliteOn);
    rewardBox.root.position.set(0, y);
    body.addChild(rewardBox.root);
    y += rewardBox.height + 22;

    // ── CTA ──
    const ctaH = 96;
    const cta = makeActionButton({
      title: '出战编队',
      subtitle: `体力 ${stamina} · 当前 ${PlayerData.stamina}/${PlayerData.staminaMax}`,
      width: Math.min(520, INNER_W),
      height: ctaH,
      variant: 'success',
      onTap: () => {
        const id = eliteOn
          ? (eliteStageOf(baseStage)?.id ?? baseStage.id)
          : baseStage.id;
        dismiss();
        opts.onConfirm(id);
      },
    });
    cta.position.set(0, y + ctaH / 2);
    body.addChild(cta);
    y += ctaH;

    const panelH = Math.min(Game.logicHeight * 0.92, Math.max(PAD_TOP + y + PAD_BOT, 780));

    shell.addChild(makePanel({
      width: PANEL_W,
      height: panelH,
      bg: COLORS.panelBg,
      border: COLORS.panelBorder,
      borderWidth: 4,
      radius: 28,
      centered: true,
    }));

    const plaque = makeModalTitlePlaque({
      text: '关卡详情',
      panelWidth: PANEL_W,
    });
    plaque.position.set(0, -panelH / 2 + 18);
    shell.addChild(plaque);

    const closeBtn = makeCloseButton({ onTap: () => dismiss() });
    closeBtn.position.set(PANEL_W / 2 - 36, -panelH / 2 + 36);
    shell.addChild(closeBtn);

    body.position.set(0, -panelH / 2 + PAD_TOP);
    shell.addChild(body);
  };

  paint();
  root.alpha = 0;
  layer.addChild(root);
  TweenManager.to({
    target: root,
    props: { alpha: 1 },
    duration: 0.2,
    ease: Ease.easeOutQuad,
  });

  return { dismiss };
}

/**
 * 普通 | 精英胶囊：对齐 UI 图质感
 * 软阴影 + 奶油金外框 + 内填；标题用展示衬线体。无顶高光条（易被看成脏内框）。
 */
function buildDifficultyPills(opts: {
  width: number;
  eliteOn: boolean;
  unlocked: boolean;
  normalStars: number;
  eliteStars: number;
  onSelect: (elite: boolean) => void;
}): { root: PIXI.Container; height: number } {
  const root = new PIXI.Container();
  const half = Math.floor((opts.width - SEG_GAP) / 2);
  const h = SEG_H;
  const r = h / 2;
  const inset = 5;
  const innerR = Math.max(8, r - inset);

  const place = (
    x: number,
    elite: boolean,
    selected: boolean,
    locked: boolean,
    stars: number,
  ): void => {
    const cell = new PIXI.Container();
    cell.position.set(x, 0);

    const shadow = new PIXI.Graphics();
    shadow.beginFill(0x3a2e22, selected ? 0.14 : 0.10);
    shadow.drawRoundedRect(2, 4, half, h, r);
    shadow.endFill();
    cell.addChild(shadow);

    const frame = new PIXI.Graphics();
    frame.beginFill(CREAM_RIM, 1);
    frame.lineStyle(2.5, locked ? GOLD_LINE : GOLD_LINE_DEEP, locked ? 0.55 : 0.95);
    frame.drawRoundedRect(0, 0, half, h, r);
    frame.endFill();
    cell.addChild(frame);

    const core = new PIXI.Graphics();
    const iw = half - inset * 2;
    const ih = h - inset * 2;
    if (selected) {
      core.beginFill(GREEN, 1);
      core.lineStyle(2, GREEN_DEEP, 1);
    } else {
      core.beginFill(CREAM, locked ? 0.7 : 1);
      core.lineStyle(1.5, GOLD_LINE, locked ? 0.45 : 0.85);
    }
    core.drawRoundedRect(inset, inset, iw, ih, innerR);
    core.endFill();
    cell.addChild(core);

    const titleFill = selected
      ? COLORS.white
      : (locked ? COLORS.textDisabled : COLORS.textMain);
    const title = makeText(elite ? (locked ? '精英 · 锁' : '精英') : '普通', {
      size: 28,
      fill: titleFill,
      bold: true,
      anchor: [0.5, 0],
      role: 'title',
      ...(selected
        ? { strokeColor: GREEN_EDGE, strokeWidth: 3 }
        : locked
          ? {}
          : { strokeColor: 0xfff8ec, strokeWidth: 2 }),
    });
    try { title.updateText(true); } catch { /* noop */ }
    const titleTop = 12;
    title.position.set(half / 2, titleTop);
    cell.addChild(title);

    const starFill = selected
      ? COLORS.white
      : (locked ? COLORS.textDisabled : STAR_COUNT_IDLE);
    const starMeta = new PIXI.Container();
    const starIcon = makeStarRow({
      star: 1, maxStar: 1, style: 'sprite', starSize: 20, gap: 0, anchor: 'left',
    });
    if (locked) starIcon.alpha = 0.45;
    starMeta.addChild(starIcon);
    const count = makeText(`${stars}/3`, {
      size: FONT_SIZE.sm, fill: starFill, bold: true, anchor: [0, 0.5],
    });
    count.position.set(starIcon.width + 4, 0);
    starMeta.addChild(count);
    // 星行锚点在竖直中心：标题底边 + 间距 + 半星高
    const starY = titleTop + title.height + 8 + 10;
    starMeta.position.set((half - starMeta.width) / 2, starY);
    cell.addChild(starMeta);

    cell.eventMode = 'static';
    cell.cursor = 'pointer';
    cell.hitArea = new PIXI.Rectangle(0, 0, half, h);
    cell.interactiveChildren = false;
    bindPointerTap(cell, () => opts.onSelect(elite));
    root.addChild(cell);
  };

  place(0, false, !opts.eliteOn, false, opts.normalStars);
  place(half + SEG_GAP, true, opts.eliteOn, !opts.unlocked, opts.eliteStars);
  return { root, height: h };
}

/** 圆角内容板（相对外层奶油板有色差） */
function makeContentBox(height: number, width = BOX_W): PIXI.Graphics {
  return makePanel({
    width,
    height,
    radius: BOX_RADIUS,
    bg: BOX_BG,
    bgAlpha: 1,
    border: GOLD_LINE,
    borderWidth: 2,
    borderAlpha: 0.75,
    centered: true,
  });
}

/** 已获星级 | 体力消耗：两块同高淡奶油底板并排 */
function buildStarStaminaBoxes(
  stars: number,
  stamina: number,
): { root: PIXI.Container; height: number } {
  const root = new PIXI.Container();
  const h = 78;
  const gap = BOX_GAP;
  const cellW = (INNER_W - gap) / 2;
  const leftX = -INNER_W / 2 + cellW / 2;
  const rightX = INNER_W / 2 - cellW / 2;

  const leftBox = makeContentBox(h, cellW);
  leftBox.position.set(leftX, h / 2);
  root.addChild(leftBox);
  const starLab = makeText('已获星级', {
    size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: 0.5,
  });
  starLab.position.set(leftX, 16);
  root.addChild(starLab);
  const starRow = makeStarRow({
    star: stars, maxStar: 3, style: 'sprite', starSize: 28, gap: 4, anchor: 'center',
  });
  starRow.position.set(leftX, 48);
  root.addChild(starRow);

  const rightBox = makeContentBox(h, cellW);
  rightBox.position.set(rightX, h / 2);
  root.addChild(rightBox);
  const stamLab = makeText('体力消耗', {
    size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: 0.5,
  });
  stamLab.position.set(rightX, 16);
  root.addChild(stamLab);
  const stamVal = makeText(`${stamina}`, {
    size: 36, fill: COLORS.textMain, bold: true, anchor: 0.5,
    role: 'title',
  });
  stamVal.position.set(rightX, 50);
  root.addChild(stamVal);

  return { root, height: h };
}

/** 顶边嵌标题 + 两侧菱形（叠在内容板顶边） */
function addBoxTitle(parent: PIXI.Container, title: string, boxTopY: number): void {
  const titleText = makeText(title, {
    size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: 0.5,
  });
  const tw = titleText.width + 24;
  const lineY = boxTopY;
  // 用底板色盖住顶边中段，形成「线断标题」
  const cap = new PIXI.Graphics();
  cap.beginFill(BOX_BG, 1);
  cap.drawRect(-tw / 2, lineY - 10, tw, 20);
  cap.endFill();
  parent.addChild(cap);

  const g = new PIXI.Graphics();
  const d = 4;
  const drawDiamond = (cx: number): void => {
    g.beginFill(GOLD_LINE, 0.95);
    g.moveTo(cx, lineY - d);
    g.lineTo(cx + d, lineY);
    g.lineTo(cx, lineY + d);
    g.lineTo(cx - d, lineY);
    g.closePath();
    g.endFill();
  };
  drawDiamond(-tw / 2 + 2);
  drawDiamond(tw / 2 - 2);
  parent.addChild(g);
  titleText.position.set(0, lineY);
  parent.addChild(titleText);
}

function buildStarThresholdBox(
  star3: number,
  star2: number,
): { root: PIXI.Container; height: number } {
  const root = new PIXI.Container();
  const rowH = 40;
  const padTop = 28;
  const padBot = 16;
  const rows: { count: number; text: string }[] = [
    { count: 3, text: `≤ ${star3} 回合` },
    { count: 2, text: `≤ ${star2} 回合` },
    { count: 1, text: '通关即可' },
  ];
  const h = padTop + rows.length * rowH + padBot;
  const box = makeContentBox(h);
  box.position.set(0, h / 2);
  root.addChild(box);
  addBoxTitle(root, '星级回合门槛', 0);

  const contentW = BOX_W - BOX_PAD_X * 2;
  rows.forEach((row, i) => {
    const cy = padTop + i * rowH + rowH / 2;
    if (i > 0) {
      const sep = new PIXI.Graphics();
      sep.lineStyle(1, GOLD_LINE, 0.35);
      sep.moveTo(-contentW / 2 + 8, cy - rowH / 2);
      sep.lineTo(contentW / 2 - 8, cy - rowH / 2);
      root.addChild(sep);
    }
    const starsOnly = makeStarRow({
      star: row.count, maxStar: row.count, style: 'sprite', starSize: 22, gap: 2, anchor: 'left',
    });
    starsOnly.position.set(-contentW / 2, cy);
    root.addChild(starsOnly);
    const val = makeText(row.text, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [1, 0.5],
    });
    val.position.set(contentW / 2, cy);
    root.addChild(val);
  });

  return { root, height: h };
}

function buildEnemySummaryBox(stage: StageDef): { root: PIXI.Container; height: number } {
  const root = new PIXI.Container();
  const summary = makeText(summarizeEncounters(stage), {
    size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [0.5, 0],
    wordWrapWidth: BOX_W - BOX_PAD_X * 2,
    align: 'center',
  });
  const hint = stage.hintText
    ? makeText(stage.hintText, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: [0.5, 0],
      wordWrapWidth: BOX_W - BOX_PAD_X * 2,
      align: 'center',
    })
    : null;

  const padTop = 28;
  const padBot = 18;
  const gap = 8;
  const innerH = summary.height + (hint ? gap + hint.height : 0);
  const h = padTop + innerH + padBot;

  const box = makeContentBox(h);
  box.position.set(0, h / 2);
  root.addChild(box);
  addBoxTitle(root, '敌情摘要', 0);

  summary.position.set(0, padTop);
  root.addChild(summary);
  if (hint) {
    hint.position.set(0, padTop + summary.height + gap);
    root.addChild(hint);
  }
  return { root, height: h };
}

/** 同宽淡奶油底；标签+图标+文案整行居中 */
function buildRewardBox(eliteOn: boolean): { root: PIXI.Container; height: number } {
  const root = new PIXI.Container();
  const h = 64;
  const iconSize = 32;

  const box = makeContentBox(h);
  box.position.set(0, h / 2);
  root.addChild(box);

  // 无顶线标题（UI 图奖励板内直接写「通关奖励：」）
  const row = new PIXI.Container();
  const label = makeText('通关奖励：', {
    size: FONT_SIZE.xs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  row.addChild(label);

  const items = eliteOn
    ? [
      { icon: UI_IMAGES.iconExp, name: '更高经验' },
      { icon: UI_IMAGES.iconShard, name: '通用碎片' },
    ]
    : [
      { icon: UI_IMAGES.iconExp, name: '标准经验' },
      { icon: UI_IMAGES.iconCoin, name: '灵宠币' },
    ];

  let x = label.width + 6;
  items.forEach((it, i) => {
    const tex = TextureCache.get(it.icon);
    if (tex) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const s = iconSize / Math.max(tex.width, tex.height);
      sp.scale.set(s);
      sp.position.set(x + iconSize / 2, 0);
      row.addChild(sp);
    }
    x += iconSize + 4;
    const slash = i === 0 && items.length > 1 ? ' /' : '';
    const n = makeText(`${it.name}${slash}`, {
      size: FONT_SIZE.xxs, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
    });
    n.position.set(x, 0);
    row.addChild(n);
    x += n.width + 8;
  });

  row.position.set(-row.width / 2, h / 2);
  root.addChild(row);
  return { root, height: h };
}

function summarizeEncounters(stage: StageDef): string {
  const names: string[] = [];
  for (const enc of stage.encounters) {
    if (enc.kind === 'mob') {
      names.push(ENEMY_MAP.get(enc.id)?.name ?? enc.id);
    } else {
      names.push(CREATURE_MAP.get(enc.id)?.name ?? '守关试炼');
    }
  }
  return `${stage.encounters.length} 波 · ${[...new Set(names)].join(' / ')}`;
}
