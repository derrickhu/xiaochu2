/**
 * GM 调试面板（开发者工具专用）
 *
 * - 内容区可纵向滚动 + mask，避免按钮溢出面板
 * - 文案强制 wordWrap，按钮高度随描述行数伸缩
 * - 顶部「跳关」卡片：章/关步进 + 快跳预设 + 解锁/开战
 *
 * 交互走 Pixi pointer（勿用 canvasTapRouter：缩放/pivot 会导致 hitTest 偏移）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { GMManager, type GMCommand } from '@/core/GMManager';
import { MAIN_CHAPTER_COUNT, STAGES, formatStageShortLabel } from '@/balance/stages';
import { FONT_FAMILY } from './theme';

const BTN_GAP = 8;
const PAD = 16;
const HEADER_H = 78;
const FOOTER_H = 56;
const MOVE_THRESHOLD = 8;
const JUMP_PRESETS = [1, 4, 8, 12, 16] as const;

const C = {
  panelBg: 0x1a1d33,
  panelStroke: 0x3d4d73,
  title: 0xe8ecf4,
  muted: 0x7a8699,
  group: 0x9aacbf,
  btnFill: 0x2a314f,
  btnStroke: 0x455078,
  btnText: 0xedf1f7,
  desc: 0x8a93a8,
  accent: 0x5eb8d4,
  accentFill: 0x2a4a5c,
  ok: 0x6bc9a6,
  okFill: 0x24483c,
  warn: 0xffb347,
  chipFill: 0x343c5c,
  chipOn: 0x3d6a80,
};

function bindGmTap(target: PIXI.Container, fn: () => void): void {
  target.eventMode = 'static';
  target.cursor = 'pointer';
  let armed = false;
  let startX = 0;
  let startY = 0;
  target.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    armed = true;
    startX = e.global.x;
    startY = e.global.y;
  });
  target.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    if (!armed) return;
    armed = false;
    const dx = e.global.x - startX;
    const dy = e.global.y - startY;
    if (Math.hypot(dx, dy) > MOVE_THRESHOLD) return;
    fn();
  });
  target.on('pointerupoutside', () => { armed = false; });
  target.on('pointercancel', () => { armed = false; });
}

export class GMPanel extends PIXI.Container {
  private _bg!: PIXI.Graphics;
  private _panelRoot!: PIXI.Container;
  private _resultText!: PIXI.Text;
  private _scrollContent: PIXI.Container | null = null;
  private _scrollMin = 0;
  private _scrollTop = 0;
  private _dragging = false;
  private _lastY = 0;
  private _moved = false;
  private _isOpen = false;
  private _jumpChapter = 1;
  private _jumpIndex = 1;
  private _jumpLabel: PIXI.Text | null = null;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9000;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('gm:open', () => this.open());
    EventBus.on('gm:close', () => this.close());
  }

  open(): void {
    if (!GMManager.isRuntimeAllowed || !GMManager.isEnabled) return;
    if (this._isOpen && this.visible) return;
    TweenManager.cancelTarget(this);
    this._isOpen = true;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._dragging = false;
    TweenManager.cancelTarget(this);
    TweenManager.to({
      target: this, props: { alpha: 0 }, duration: 0.15, ease: Ease.easeInQuad,
      onComplete: () => { if (!this._isOpen) this.visible = false; },
    });
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._bg = new PIXI.Graphics();
    this._bg.beginFill(0x000000, 0.55);
    this._bg.drawRect(0, 0, w, h);
    this._bg.endFill();
    this._bg.eventMode = 'static';
    this._bg.hitArea = new PIXI.Rectangle(0, 0, w, h);
    bindGmTap(this._bg, () => this.close());
    this.addChild(this._bg);

    this._panelRoot = new PIXI.Container();
    this._panelRoot.eventMode = 'static';
    this.addChild(this._panelRoot);
  }

  private _showResult(result: string): void {
    this._resultText.text = result;
    this._resultText.style.fill = /失败|暂无|请进入|无效|未激活|禁用/.test(result)
      ? C.warn
      : C.ok;
  }

  private _refresh(): void {
    this._panelRoot.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._scrollContent = null;
    this._jumpLabel = null;
    this._dragging = false;

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const panelW = Math.min(700, w - 24);
    const panelH = Math.min(h - Game.safeTop - 24, h - 48);
    const panelX = (w - panelW) / 2;
    const panelY = Math.max(Game.safeTop + 8, (h - panelH) / 2);

    const bg = new PIXI.Graphics();
    bg.beginFill(C.panelBg, 0.98);
    bg.drawRoundedRect(panelX, panelY, panelW, panelH, 18);
    bg.endFill();
    bg.lineStyle(2, C.panelStroke, 0.92);
    bg.drawRoundedRect(panelX, panelY, panelW, panelH, 18);
    bg.eventMode = 'static';
    bg.hitArea = new PIXI.Rectangle(panelX, panelY, panelW, panelH);
    bg.on('pointerdown', (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
    this._panelRoot.addChild(bg);

    const title = new PIXI.Text('GM 调试', {
      fontSize: 26, fill: C.title, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    title.position.set(panelX + PAD, panelY + 14);
    title.eventMode = 'none';
    this._panelRoot.addChild(title);

    const closeBtn = new PIXI.Container();
    closeBtn.position.set(panelX + panelW - PAD - 56, panelY + 12);
    closeBtn.hitArea = new PIXI.Rectangle(0, 0, 56, 36);
    const closeTxt = new PIXI.Text('关闭', {
      fontSize: 20, fill: C.accent, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    closeBtn.addChild(closeTxt);
    bindGmTap(closeBtn, () => this.close());
    this._panelRoot.addChild(closeBtn);

    const sub = new PIXI.Text('仅开发者工具 · 真机自动禁用 · 列表可上下滑', {
      fontSize: 13, fill: C.muted, fontFamily: FONT_FAMILY,
      wordWrap: true, wordWrapWidth: panelW - PAD * 2 - 70,
    });
    sub.position.set(panelX + PAD, panelY + 48);
    sub.eventMode = 'none';
    this._panelRoot.addChild(sub);

    const viewX = panelX + PAD;
    const viewY = panelY + HEADER_H;
    const viewW = panelW - PAD * 2;
    const viewH = panelH - HEADER_H - FOOTER_H;

    const viewport = new PIXI.Container();
    viewport.position.set(viewX, viewY);
    viewport.eventMode = 'static';
    viewport.hitArea = new PIXI.Rectangle(0, 0, viewW, viewH);
    this._panelRoot.addChild(viewport);

    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawRect(0, 0, viewW, viewH);
    mask.endFill();
    viewport.addChild(mask);
    viewport.mask = mask;

    const content = new PIXI.Container();
    viewport.addChild(content);
    this._scrollContent = content;
    this._scrollTop = 0;

    let curY = 0;
    curY += this._buildJumpCard(content, 0, curY, viewW) + 14;

    for (const group of GMManager.groups) {
      const groupTitle = new PIXI.Text(group, {
        fontSize: 16, fill: C.group, fontFamily: FONT_FAMILY, fontWeight: 'bold',
      });
      groupTitle.position.set(0, curY);
      groupTitle.eventMode = 'none';
      content.addChild(groupTitle);
      curY += 28;

      for (const cmd of GMManager.getCommandsByGroup(group)) {
        curY += this._createCommandButton(content, cmd, 0, curY, viewW) + BTN_GAP;
      }
      curY += 6;
    }

    this._scrollMin = Math.min(0, viewH - curY - 4);
    content.y = 0;

    this._bindScroll(viewport, viewH);

    this._resultText = new PIXI.Text('点上方按钮执行；跳关可快速测后期章节', {
      fontSize: 14, fill: C.muted, fontFamily: FONT_FAMILY,
      wordWrap: true, wordWrapWidth: viewW, lineHeight: 20,
    });
    this._resultText.position.set(viewX, panelY + panelH - FOOTER_H + 10);
    this._resultText.eventMode = 'none';
    this._panelRoot.addChild(this._resultText);
  }

  private _bindScroll(viewport: PIXI.Container, _viewH: number): void {
    viewport.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
      this._dragging = true;
      this._moved = false;
      this._lastY = e.global.y;
    });
    viewport.on('pointermove', (e: PIXI.FederatedPointerEvent) => {
      if (!this._dragging || !this._scrollContent) return;
      const dy = this._lastY - e.global.y;
      if (Math.abs(dy) > MOVE_THRESHOLD) this._moved = true;
      if (dy === 0) return;
      const next = Math.max(this._scrollMin, Math.min(this._scrollTop, this._scrollContent.y - dy));
      this._scrollContent.y = next;
      this._lastY = e.global.y;
    });
    const end = () => {
      this._dragging = false;
      // 松手后清掉，避免「滑过一次后点按钮被误判为拖动」
      setTimeout(() => { this._moved = false; }, 0);
    };
    viewport.on('pointerup', end);
    viewport.on('pointerupoutside', end);
    viewport.on('pointercancel', end);
    // 桌面滚轮
    viewport.on('wheel', (e: PIXI.FederatedWheelEvent) => {
      if (!this._scrollContent) return;
      e.stopPropagation();
      const next = Math.max(
        this._scrollMin,
        Math.min(this._scrollTop, this._scrollContent.y - e.deltaY * 0.5),
      );
      this._scrollContent.y = next;
    });
  }

  private _buildJumpCard(parent: PIXI.Container, x: number, y: number, w: number): number {
    const card = new PIXI.Container();
    card.position.set(x, y);

    const innerPad = 12;
    const title = new PIXI.Text('跳关测试', {
      fontSize: 18, fill: C.btnText, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    title.position.set(innerPad, 10);
    title.eventMode = 'none';
    card.addChild(title);

    this._jumpLabel = new PIXI.Text(this._jumpTargetText(), {
      fontSize: 14, fill: C.accent, fontFamily: FONT_FAMILY,
      wordWrap: true, wordWrapWidth: w - innerPad * 2,
    });
    this._jumpLabel.position.set(innerPad, 36);
    this._jumpLabel.eventMode = 'none';
    card.addChild(this._jumpLabel);

    let rowY = 64;
    const stepW = (w - innerPad * 2 - 8) / 2;
    rowY += this._buildStepperRow(card, innerPad, rowY, stepW, '章', MAIN_CHAPTER_COUNT);
    this._buildStepperRow(card, innerPad + stepW + 8, rowY - 44, stepW, '关', 8);

    // 快跳预设
    const chipGap = 6;
    const chipCount = JUMP_PRESETS.length;
    const chipW = (w - innerPad * 2 - chipGap * (chipCount - 1)) / chipCount;
    let chipX = innerPad;
    for (const ch of JUMP_PRESETS) {
      const chip = this._makeChip(`第${ch}章`, chipW, 36, () => {
        this._jumpChapter = ch;
        this._jumpIndex = 1;
        this._syncJumpLabel();
        this._showResult(GMManager.unlockToStage(ch, 1));
      });
      chip.position.set(chipX, rowY);
      card.addChild(chip);
      chipX += chipW + chipGap;
    }
    rowY += 44;

    const actionGap = 8;
    const actionW = (w - innerPad * 2 - actionGap) / 2;
    const unlockBtn = this._makeChip('解锁到此关', actionW, 44, () => {
      this._showResult(GMManager.unlockToStage(this._jumpChapter, this._jumpIndex));
    }, C.accentFill, C.accent);
    unlockBtn.position.set(innerPad, rowY);
    card.addChild(unlockBtn);

    const enterBtn = this._makeChip('进入此关开战', actionW, 44, () => {
      this._showResult(GMManager.enterStage(this._jumpChapter, this._jumpIndex));
    }, C.okFill, C.ok);
    enterBtn.position.set(innerPad + actionW + actionGap, rowY);
    card.addChild(enterBtn);
    rowY += 52;

    const hint = new PIXI.Text('解锁：目标关之前标 3★ 并发 Boss 掉落宠；开战：解锁后进编队', {
      fontSize: 12, fill: C.muted, fontFamily: FONT_FAMILY,
      wordWrap: true, wordWrapWidth: w - innerPad * 2, lineHeight: 16,
    });
    hint.position.set(innerPad, rowY);
    hint.eventMode = 'none';
    card.addChild(hint);
    rowY += hint.height + 12;

    const g = new PIXI.Graphics();
    g.beginFill(C.btnFill, 1);
    g.lineStyle(1.5, C.accent, 0.55);
    g.drawRoundedRect(0, 0, w, rowY, 12);
    g.endFill();
    g.eventMode = 'none';
    card.addChildAt(g, 0);

    parent.addChild(card);
    return rowY;
  }

  private _jumpTargetText(): string {
    const stage = STAGES.find(
      (s) => s.chapter === this._jumpChapter && s.index === this._jumpIndex,
    );
    return stage
      ? `目标 ${formatStageShortLabel(stage)}`
      : `目标 第${this._jumpChapter}章 第${this._jumpIndex}关`;
  }

  private _syncJumpLabel(): void {
    if (this._jumpLabel) this._jumpLabel.text = this._jumpTargetText();
  }

  private _buildStepperRow(
    parent: PIXI.Container,
    x: number,
    y: number,
    w: number,
    label: string,
    max: number,
  ): number {
    const h = 40;
    const row = new PIXI.Container();
    row.position.set(x, y);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x222844, 1);
    bg.drawRoundedRect(0, 0, w, h, 10);
    bg.endFill();
    bg.eventMode = 'none';
    row.addChild(bg);

    const minus = this._makeChip('−', 40, h - 4, () => this._nudgeJump(label, -1, max));
    minus.position.set(2, 2);
    row.addChild(minus);

    const plus = this._makeChip('+', 40, h - 4, () => this._nudgeJump(label, +1, max));
    plus.position.set(w - 42, 2);
    row.addChild(plus);

    const mid = new PIXI.Text(`${label} ${label === '章' ? this._jumpChapter : this._jumpIndex}`, {
      fontSize: 16, fill: C.btnText, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    mid.anchor.set(0.5, 0.5);
    mid.position.set(w / 2, h / 2);
    mid.eventMode = 'none';
    mid.name = `stepper_${label}`;
    row.addChild(mid);

    parent.addChild(row);
    return h + 4;
  }

  private _nudgeJump(kind: string, delta: number, max: number): void {
    if (kind === '章') {
      this._jumpChapter = Math.max(1, Math.min(max, this._jumpChapter + delta));
    } else {
      this._jumpIndex = Math.max(1, Math.min(max, this._jumpIndex + delta));
    }
    this._syncJumpLabel();
    // 更新步进中间文字
    const content = this._scrollContent;
    if (!content) return;
    const name = `stepper_${kind}`;
    const walk = (node: PIXI.Container) => {
      for (const c of node.children) {
        if (c.name === name && c instanceof PIXI.Text) {
          c.text = `${kind} ${kind === '章' ? this._jumpChapter : this._jumpIndex}`;
        }
        if (c instanceof PIXI.Container) walk(c);
      }
    };
    walk(content);
  }

  private _makeChip(
    text: string,
    w: number,
    h: number,
    onTap: () => void,
    fill = C.chipFill,
    textColor: number = C.btnText,
  ): PIXI.Container {
    const btn = new PIXI.Container();
    btn.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const g = new PIXI.Graphics();
    g.beginFill(fill, 1);
    g.lineStyle(1, C.btnStroke, 0.85);
    g.drawRoundedRect(0, 0, w, h, 10);
    g.endFill();
    g.eventMode = 'none';
    btn.addChild(g);

    const label = new PIXI.Text(text, {
      fontSize: Math.min(16, text.length > 6 ? 14 : 16),
      fill: textColor,
      fontFamily: FONT_FAMILY,
      fontWeight: 'bold',
      wordWrap: true,
      wordWrapWidth: w - 8,
      align: 'center',
    });
    label.anchor.set(0.5, 0.5);
    label.position.set(w / 2, h / 2);
    label.eventMode = 'none';
    btn.addChild(label);

    bindGmTap(btn, onTap);
    return btn;
  }

  private _createCommandButton(
    parent: PIXI.Container,
    cmd: GMCommand,
    x: number,
    y: number,
    w: number,
  ): number {
    const nameStyle = {
      fontSize: 18, fill: C.btnText, fontFamily: FONT_FAMILY, fontWeight: 'bold' as const,
      wordWrap: true, wordWrapWidth: w - 28,
    };
    const descStyle = {
      fontSize: 13, fill: C.desc, fontFamily: FONT_FAMILY,
      wordWrap: true, wordWrapWidth: w - 28, lineHeight: 18,
    };
    const name = new PIXI.Text(cmd.name, nameStyle);
    const desc = new PIXI.Text(cmd.desc, descStyle);
    const h = Math.max(64, 12 + name.height + 4 + desc.height + 12);

    const btn = new PIXI.Container();
    btn.position.set(x, y);
    btn.hitArea = new PIXI.Rectangle(0, 0, w, h);

    const g = new PIXI.Graphics();
    g.beginFill(C.btnFill, 1);
    g.lineStyle(1.5, C.btnStroke, 0.9);
    g.drawRoundedRect(0, 0, w, h, 12);
    g.endFill();
    g.eventMode = 'none';
    btn.addChild(g);

    name.position.set(14, 12);
    name.eventMode = 'none';
    btn.addChild(name);

    desc.position.set(14, 12 + name.height + 4);
    desc.eventMode = 'none';
    btn.addChild(desc);

    bindGmTap(btn, () => {
      const result = GMManager.executeCommand(cmd.id);
      this._showResult(result);
      console.warn('[GMPanel]', cmd.name, '→', result);
    });
    parent.addChild(btn);
    return h;
  }
}
