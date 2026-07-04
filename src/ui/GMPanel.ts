/**
 * GM 调试面板（开发者工具专用）
 *
 * 交互走 Pixi pointer（勿用 canvasTapRouter：_content 缩放/pivot 会导致 hitTest 偏移）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { GMManager, type GMCommand } from '@/core/GMManager';
import { Platform } from '@/core/PlatformService';
import { FONT_FAMILY } from './theme';

const BTN_H = 72;
const BTN_GAP = 10;
const PAD = 20;

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
  ok: 0x6bc9a6,
  warn: 0xffb347,
};

function bindGmTap(target: PIXI.Container, fn: () => void): void {
  target.eventMode = 'static';
  target.cursor = 'pointer';
  let armed = false;
  target.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    armed = true;
  });
  target.on('pointerup', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    if (!armed) return;
    armed = false;
    fn();
  });
  target.on('pointerupoutside', () => { armed = false; });
  target.on('pointercancel', () => { armed = false; });
}

export class GMPanel extends PIXI.Container {
  private _bg!: PIXI.Graphics;
  private _panelRoot!: PIXI.Container;
  private _resultText!: PIXI.Text;
  private _isOpen = false;

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
    if (this._isOpen) return;
    this._isOpen = true;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    TweenManager.to({
      target: this, props: { alpha: 0 }, duration: 0.15, ease: Ease.easeInQuad,
      onComplete: () => { this.visible = false; },
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

  private _refresh(): void {
    this._panelRoot.removeChildren().forEach((c) => c.destroy({ children: true }));

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const panelW = Math.min(680, w - 32);
    const panelH = Math.min(560, h - 80);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

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
    closeBtn.hitArea = new PIXI.Rectangle(0, 0, 56, 32);
    const closeTxt = new PIXI.Text('关闭', {
      fontSize: 20, fill: C.accent, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    closeBtn.addChild(closeTxt);
    bindGmTap(closeBtn, () => this.close());
    this._panelRoot.addChild(closeBtn);

    const sub = new PIXI.Text('仅开发者工具可用 · 真机自动禁用', {
      fontSize: 14, fill: C.muted, fontFamily: FONT_FAMILY,
    });
    sub.position.set(panelX + PAD, panelY + 54);
    sub.eventMode = 'none';
    this._panelRoot.addChild(sub);

    let curY = panelY + 90;
    const btnW = panelW - PAD * 2;

    for (const group of GMManager.groups) {
      const groupTitle = new PIXI.Text(group, {
        fontSize: 17, fill: C.group, fontFamily: FONT_FAMILY, fontWeight: 'bold',
      });
      groupTitle.position.set(panelX + PAD, curY);
      groupTitle.eventMode = 'none';
      this._panelRoot.addChild(groupTitle);
      curY += 30;

      for (const cmd of GMManager.getCommandsByGroup(group)) {
        this._createCommandButton(cmd, panelX + PAD, curY, btnW);
        curY += BTN_H + BTN_GAP;
      }
    }

    this._resultText = new PIXI.Text('', {
      fontSize: 16, fill: C.ok, fontFamily: FONT_FAMILY, fontWeight: 'bold',
      wordWrap: true, wordWrapWidth: btnW, lineHeight: 22,
    });
    this._resultText.position.set(panelX + PAD, Math.min(curY + 8, panelY + panelH - 72));
    this._resultText.eventMode = 'none';
    this._panelRoot.addChild(this._resultText);
  }

  private _createCommandButton(cmd: GMCommand, x: number, y: number, w: number): void {
    const btn = new PIXI.Container();
    btn.position.set(x, y);
    btn.hitArea = new PIXI.Rectangle(0, 0, w, BTN_H);

    const g = new PIXI.Graphics();
    g.beginFill(C.btnFill, 1);
    g.lineStyle(1.5, C.btnStroke, 0.9);
    g.drawRoundedRect(0, 0, w, BTN_H, 12);
    g.endFill();
    g.eventMode = 'none';
    btn.addChild(g);

    const name = new PIXI.Text(cmd.name, {
      fontSize: 20, fill: C.btnText, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    name.position.set(14, 10);
    name.eventMode = 'none';
    btn.addChild(name);

    const desc = new PIXI.Text(cmd.desc, {
      fontSize: 14, fill: C.desc, fontFamily: FONT_FAMILY, wordWrap: true, wordWrapWidth: w - 28,
    });
    desc.position.set(14, 36);
    desc.eventMode = 'none';
    btn.addChild(desc);

    bindGmTap(btn, () => {
      const result = GMManager.executeCommand(cmd.id);
      this._resultText.text = result;
      this._resultText.style.fill = result.includes('失败') || result.includes('暂无') || result.includes('请进入')
        ? C.warn
        : C.ok;
      console.warn('[GMPanel]', cmd.name, '→', result);
    });
    this._panelRoot.addChild(btn);
  }
}
