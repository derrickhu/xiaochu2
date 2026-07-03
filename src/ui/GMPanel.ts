/**
 * GM 调试面板（开发者工具专用）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { GMManager, type GMCommand } from '@/core/GMManager';
import { FONT_FAMILY } from './theme';
import { bindPointerTap } from '@/utils/bindPointerTap';

const BTN_H = 72;
const BTN_GAP = 10;
const PAD = 20;

const C = {
  panelBg: 0x1a1d33,
  panelStroke: 0x3d4d73,
  headerBg: 0x232742,
  title: 0xe8ecf4,
  muted: 0x7a8699,
  group: 0x9aacbf,
  btnFill: 0x2a314f,
  btnStroke: 0x455078,
  btnText: 0xedf1f7,
  desc: 0x8a93a8,
  accent: 0x5eb8d4,
  ok: 0x6bc9a6,
};

export class GMPanel extends PIXI.Container {
  private _bg!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _resultText!: PIXI.Text;
  private _isOpen = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9000;
    this._buildShell();
    EventBus.on('gm:open', () => this.open());
  }

  open(): void {
    if (!GMManager.isRuntimeAllowed || !GMManager.isEnabled) return;
    if (this._isOpen) return;
    this._isOpen = true;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    this._content.scale.set(0.92);
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    TweenManager.to({
      target: this._content.scale, props: { x: 1, y: 1 }, duration: 0.22, ease: Ease.easeOutBack,
    });
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
    this._bg.on('pointerdown', () => this.close());
    this.addChild(this._bg);

    this._content = new PIXI.Container();
    this._content.pivot.set(w / 2, h / 2);
    this._content.position.set(w / 2, h / 2);
    this.addChild(this._content);
  }

  private _refresh(): void {
    while (this._content.children.length > 0) {
      const child = this._content.children[0];
      this._content.removeChild(child);
      child.destroy({ children: true });
    }

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
    bg.on('pointerdown', (e: PIXI.FederatedPointerEvent) => e.stopPropagation());
    this._content.addChild(bg);

    const headerH = 54;
    const title = new PIXI.Text('GM 调试', {
      fontSize: 26, fill: C.title, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    title.position.set(panelX + PAD, panelY + 14);
    this._content.addChild(title);

    const closeBtn = new PIXI.Text('关闭', {
      fontSize: 20, fill: C.accent, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    closeBtn.anchor.set(1, 0);
    closeBtn.position.set(panelX + panelW - PAD, panelY + 16);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    bindPointerTap(closeBtn, () => this.close());
    this._content.addChild(closeBtn);

    const sub = new PIXI.Text('仅开发者工具可用 · 真机自动禁用', {
      fontSize: 14, fill: C.muted, fontFamily: FONT_FAMILY,
    });
    sub.position.set(panelX + PAD, panelY + headerH);
    this._content.addChild(sub);

    let curY = panelY + headerH + 36;
    const btnW = panelW - PAD * 2;

    for (const group of GMManager.groups) {
      const groupTitle = new PIXI.Text(group, {
        fontSize: 17, fill: C.group, fontFamily: FONT_FAMILY, fontWeight: 'bold',
      });
      groupTitle.position.set(panelX + PAD, curY);
      this._content.addChild(groupTitle);
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
    this._resultText.position.set(panelX + PAD, panelY + panelH - 52);
    this._content.addChild(this._resultText);
  }

  private _createCommandButton(cmd: GMCommand, x: number, y: number, w: number): void {
    const btn = new PIXI.Container();
    btn.position.set(x, y);
    btn.eventMode = 'static';
    btn.cursor = 'pointer';

    const g = new PIXI.Graphics();
    g.beginFill(C.btnFill, 1);
    g.lineStyle(1.5, C.btnStroke, 0.9);
    g.drawRoundedRect(0, 0, w, BTN_H, 12);
    g.endFill();
    btn.addChild(g);

    const name = new PIXI.Text(cmd.name, {
      fontSize: 20, fill: C.btnText, fontFamily: FONT_FAMILY, fontWeight: 'bold',
    });
    name.position.set(14, 10);
    btn.addChild(name);

    const desc = new PIXI.Text(cmd.desc, {
      fontSize: 14, fill: C.desc, fontFamily: FONT_FAMILY, wordWrap: true, wordWrapWidth: w - 28,
    });
    desc.position.set(14, 36);
    btn.addChild(desc);

    bindPointerTap(btn, () => {
      this._resultText.text = GMManager.executeCommand(cmd.id);
    });
    this._content.addChild(btn);
  }
}
