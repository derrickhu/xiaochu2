/**
 * 设置弹窗：调节 BGM / 音效音量。
 *
 * 入口在首页左栏「设置」。拖滑条即生效并落盘（见 AudioSettings）。
 *
 * 滑条拖动必须挂到全屏层：微信小游戏里 pointermove 只在当前 hit 目标上派发，
 * 手指稍微滑出细条就会断——看起来像「不能拖」。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import {
  getAudioSettings,
  setBgmVolume,
  setSfxVolume,
} from '@/core/AudioSettings';
import { SfxManager } from '@/core/SfxManager';
import {
  COLORS, FONT_SIZE,
  makeCloseButton, makePanel, makeText, makeModalTitlePlaque,
} from '@/ui';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

const PANEL_W = 560;
const PANEL_H = 460;
const SLIDER_W = 300;
const SLIDER_H = 36;
const KNOB_R = 20;
const STEP = 0.05;

interface SliderHandle {
  root: PIXI.Container;
  setValue: (v: number) => void;
}

function makeStepBtn(label: string, onTap: () => void): PIXI.Container {
  const btn = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(COLORS.panelBg, 1);
  g.lineStyle(2, COLORS.panelBorder, 1);
  g.drawCircle(0, 0, 22);
  g.endFill();
  btn.addChild(g);
  const t = makeText(label, {
    size: FONT_SIZE.lg, fill: COLORS.textMain, bold: true, anchor: 0.5,
  });
  btn.addChild(t);
  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Circle(0, 0, 26);
  bindPointerTap(btn, onTap);
  pressFeedback(btn, { scale: 0.9, sfx: 'none' });
  return btn;
}

function makeVolumeSlider(opts: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  /** 拖动手势要挂到的全屏容器（本弹窗根），手指移出细条也能续拖 */
  dragLayer: PIXI.Container;
  previewSfx?: boolean;
}): SliderHandle {
  const root = new PIXI.Container();

  const title = makeText(opts.label, {
    size: FONT_SIZE.md, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
  });
  title.position.set(-SLIDER_W / 2 - 52, -44);
  root.addChild(title);

  const pct = makeText(`${Math.round(opts.value * 100)}%`, {
    size: FONT_SIZE.sm, fill: COLORS.textSub, bold: true, anchor: [1, 0.5],
  });
  pct.position.set(SLIDER_W / 2 + 52, -44);
  root.addChild(pct);

  const track = new PIXI.Graphics();
  const fill = new PIXI.Graphics();
  const knob = new PIXI.Graphics();
  root.addChild(track, fill, knob);

  // 用 hitArea 而不是近透明填充：部分真机对 alpha≈0 的 Graphics 不命中
  const hit = new PIXI.Container();
  hit.eventMode = 'static';
  hit.cursor = 'pointer';
  hit.hitArea = new PIXI.Rectangle(
    -SLIDER_W / 2 - 8, -SLIDER_H / 2 - 24, SLIDER_W + 16, SLIDER_H + 48,
  );
  root.addChild(hit);

  let value = Math.max(0, Math.min(1, opts.value));
  let dragging = false;
  let moveBound: ((e: PIXI.FederatedPointerEvent) => void) | null = null;
  let upBound: (() => void) | null = null;

  const paint = (): void => {
    track.clear();
    track.beginFill(COLORS.trackBg, 1);
    track.drawRoundedRect(-SLIDER_W / 2, -SLIDER_H / 2, SLIDER_W, SLIDER_H, SLIDER_H / 2);
    track.endFill();

    const fw = Math.max(SLIDER_H, SLIDER_W * value);
    fill.clear();
    fill.beginFill(COLORS.trackFill, 1);
    fill.drawRoundedRect(-SLIDER_W / 2, -SLIDER_H / 2, fw, SLIDER_H, SLIDER_H / 2);
    fill.endFill();

    const kx = -SLIDER_W / 2 + SLIDER_W * value;
    knob.clear();
    knob.lineStyle(3, COLORS.panelBorder, 1);
    knob.beginFill(0xfff6e4, 1);
    knob.drawCircle(kx, 0, KNOB_R);
    knob.endFill();
    // 中心小点，增强「可拖」手感
    knob.beginFill(COLORS.trackFill, 1);
    knob.drawCircle(kx, 0, 6);
    knob.endFill();

    pct.text = `${Math.round(value * 100)}%`;
  };

  const applyValue = (next: number, announce: boolean): void => {
    const v = Math.max(0, Math.min(1, next));
    if (Math.abs(v - value) < 0.001) return;
    value = v;
    paint();
    opts.onChange(value);
    if (announce && opts.previewSfx) SfxManager.playUiClick();
  };

  const setFromGlobal = (global: PIXI.Point | PIXI.ObservablePoint): void => {
    const local = root.toLocal(global);
    applyValue((local.x + SLIDER_W / 2) / SLIDER_W, false);
  };

  const unbindDrag = (): void => {
    if (moveBound) opts.dragLayer.off('pointermove', moveBound);
    if (upBound) {
      opts.dragLayer.off('pointerup', upBound);
      opts.dragLayer.off('pointerupoutside', upBound);
      opts.dragLayer.off('pointercancel', upBound);
    }
    moveBound = null;
    upBound = null;
  };

  const endDrag = (): void => {
    if (!dragging) return;
    dragging = false;
    unbindDrag();
    if (opts.previewSfx) SfxManager.playUiClick();
  };

  hit.on('pointerdown', (e: PIXI.FederatedPointerEvent) => {
    e.stopPropagation();
    dragging = true;
    setFromGlobal(e.global);
    // 拖动手势挂全屏层：移出细条 / 滑到遮罩上也不会断
    moveBound = (ev: PIXI.FederatedPointerEvent) => {
      if (!dragging) return;
      ev.stopPropagation();
      setFromGlobal(ev.global);
    };
    upBound = () => endDrag();
    opts.dragLayer.on('pointermove', moveBound);
    opts.dragLayer.on('pointerup', upBound);
    opts.dragLayer.on('pointerupoutside', upBound);
    opts.dragLayer.on('pointercancel', upBound);
  });

  const minus = makeStepBtn('−', () => applyValue(value - STEP, true));
  minus.position.set(-SLIDER_W / 2 - 44, 0);
  root.addChild(minus);

  const plus = makeStepBtn('+', () => applyValue(value + STEP, true));
  plus.position.set(SLIDER_W / 2 + 44, 0);
  root.addChild(plus);

  paint();
  return {
    root,
    setValue: (v) => {
      value = Math.max(0, Math.min(1, v));
      paint();
    },
  };
}

export class SettingsPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _isOpen = false;
  private _bgmSlider: SliderHandle | null = null;
  private _sfxSlider: SliderHandle | null = null;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9600;
    this.eventMode = 'static';
    this.interactiveChildren = true;
    this._buildShell();
    EventBus.on('settings:open', () => this.open());
    EventBus.on('settings:close', () => this.close());
  }

  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.visible = true;
    this._syncFromSettings();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { this.visible = false; },
    });
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._dim = new PIXI.Graphics();
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._dim.eventMode = 'static';
    // 点遮罩关闭；拖滑条时 pointerdown 已 stopPropagation，不会误关
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.position.set(w / 2, h / 2 - 20);
    this._content.eventMode = 'static';
    this._content.interactiveChildren = true;
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    this._content.addChild(makePanel({
      width: PANEL_W,
      height: PANEL_H,
      bg: COLORS.panelBg,
      border: COLORS.panelBorder,
      centered: true,
    }));

    const plaque = makeModalTitlePlaque({ text: '设置', panelWidth: PANEL_W });
    plaque.position.set(0, -PANEL_H / 2 + 52);
    this._content.addChild(plaque);

    const tip = makeText('拖动滑条或点两侧加减；音乐默认偏低，避免盖过按钮音效', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
      wordWrapWidth: PANEL_W - 80,
    });
    tip.position.set(0, -PANEL_H / 2 + 108);
    this._content.addChild(tip);

    const s = getAudioSettings();
    this._bgmSlider = makeVolumeSlider({
      label: '音乐',
      value: s.bgmVolume,
      onChange: (v) => setBgmVolume(v),
      dragLayer: this,
    });
    this._bgmSlider.root.position.set(0, -10);
    this._content.addChild(this._bgmSlider.root);

    this._sfxSlider = makeVolumeSlider({
      label: '音效',
      value: s.sfxVolume,
      onChange: (v) => setSfxVolume(v),
      dragLayer: this,
      previewSfx: true,
    });
    this._sfxSlider.root.position.set(0, 120);
    this._content.addChild(this._sfxSlider.root);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(PANEL_W / 2 - 28, -PANEL_H / 2 + 28);
    this._content.addChild(closeBtn);
    pressFeedback(closeBtn, { sfx: 'back' });
  }

  private _syncFromSettings(): void {
    const s = getAudioSettings();
    this._bgmSlider?.setValue(s.bgmVolume);
    this._sfxSlider?.setValue(s.sfxVolume);

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._dim.clear();
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._content.position.set(w / 2, h / 2 - 20);
  }
}
