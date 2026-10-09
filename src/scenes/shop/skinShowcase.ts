/**
 * 外观货架的展示件：月夜舞台、限定角标、原貌对比条、全屏预览。
 *
 * 舞台里的光环 / 星点 / 呼吸由调用方在 Scene.update 里推 tick，场景销毁即停。
 * 预览遮罩走 bindPointerTap，确保微信 canvas 路由里它压在下层商品钮之上。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UI_FX_IMAGES, UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE, bindLazySprite, makeText } from '@/ui';
import { makeCloseButton } from '@/ui/CloseButton';
import { pressFeedback } from '@/ui/motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

export const SKIN_UI = {
  night: 0x1b2150,
  nightLift: 0x34437f,
  silver: 0xd7deef,
  moon: 0xf5f1dc,
  glow: 0xbcd0ff,
  star: 0xffffff,
  ink: 0x2f3768,
  ribbon: 0xc8463a,
  ribbonEdge: 0xf0cf7a,
  dim: 0x0b0f2a,
} as const;

export type Ticker = (dt: number) => void;

/** 小电视 + 播放三角：激励视频的通用识别符号，中心 (0,0) */
export function makeAdIcon(size: number, body: number, mark: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const w = size;
  const h = size * 0.78;
  g.beginFill(body, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, size * 0.22);
  g.endFill();
  const t = size * 0.2;
  g.beginFill(mark, 1);
  g.drawPolygon([-t * 0.7, -t, t * 1.05, 0, -t * 0.7, t]);
  g.endFill();
  return g;
}

/**
 * 全屏大图底部的一对支付钮：灵玉是金漆，广告是月夜银边，同宽同高并排。
 * 文案用书法标题字，和皮肤名同一套字。
 */
export function makeSkinPayButton(opts: {
  kind: 'lingyu' | 'ad';
  text: string;
  width: number;
  height: number;
  onTap: () => void;
}): PIXI.Container {
  const { kind, text, width: w, height: h } = opts;
  const gold = kind === 'lingyu';
  const btn = new PIXI.Container();
  const r = h / 2;
  const g = new PIXI.Graphics();
  g.beginFill(0x000000, 0.28);
  g.drawRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
  g.endFill();
  g.lineStyle(3, gold ? 0xa8742c : SKIN_UI.silver, 1);
  g.beginFill(gold ? SKIN_UI.ribbonEdge : SKIN_UI.nightLift, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  g.lineStyle(0);
  g.beginFill(0xffffff, gold ? 0.35 : 0.12);
  g.drawRoundedRect(-w / 2 + 8, -h / 2 + 5, w - 16, h * 0.38, r * 0.7);
  g.endFill();
  g.lineStyle(1.5, gold ? 0xfff3c8 : SKIN_UI.glow, 0.7);
  g.drawRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, r - 5);
  btn.addChild(g);

  const fill = gold ? SKIN_UI.ink : SKIN_UI.moon;
  const label = makeText(text, {
    size: Math.round(h * 0.4), fill, anchor: [0, 0.5], role: 'title',
    ...(gold ? {} : { strokeColor: SKIN_UI.dim, strokeWidth: 3 }),
  });
  const iconSize = Math.round(h * 0.46);
  const gap = 10;
  const total = iconSize + gap + label.width;
  const left = -total / 2;
  if (gold) {
    const icon = new PIXI.Sprite(PIXI.Texture.EMPTY);
    icon.anchor.set(0.5);
    icon.position.set(left + iconSize / 2, 0);
    bindLazySprite(icon, {
      path: UI_IMAGES.iconLingyu,
      ensure: true,
      onApplied: (tex) => icon.scale.set(iconSize / Math.max(tex.width, tex.height)),
    });
    btn.addChild(icon);
  } else {
    const icon = makeAdIcon(iconSize, SKIN_UI.moon, SKIN_UI.nightLift);
    icon.position.set(left + iconSize / 2, 0);
    btn.addChild(icon);
  }
  label.position.set(left + iconSize + gap, 0);
  btn.addChild(label);

  btn.eventMode = 'static';
  btn.cursor = 'pointer';
  btn.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
  btn.interactiveChildren = false;
  bindPointerTap(btn, opts.onTap);
  pressFeedback(btn);
  return btn;
}

export interface MoonStage {
  root: PIXI.Container;
  /** 角色立绘放这里（已在舞台遮罩内） */
  art: PIXI.Container;
  tick: Ticker;
}

function drawSparkle(g: PIXI.Graphics, x: number, y: number, r: number, alpha = 1): void {
  g.beginFill(SKIN_UI.star, alpha);
  g.drawPolygon([
    x, y - r, x + r * 0.28, y - r * 0.28, x + r, y, x + r * 0.28, y + r * 0.28,
    x, y + r, x - r * 0.28, y + r * 0.28, x - r, y, x - r * 0.28, y - r * 0.28,
  ]);
  g.endFill();
}

/** 星点散布：同一组坐标按奇偶分成 A/B 两层，交替淡入淡出看起来像在闪 */
function sparkleSpots(w: number, h: number, count: number): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: (((i * 97) % 100) / 100 - 0.5) * w * 0.86,
      y: (((i * 61 + 23) % 100) / 100 - 0.5) * h * 0.86,
      r: 2.5 + ((i * 7) % 5),
    });
  }
  return out;
}

/**
 * 把一组 Graphics 烘成一张贴图。失败（Canvas 宿主等）就原样返回 Graphics，效果一样只是贵一点。
 * 贴图随返回节点销毁。
 */
function bake(g: PIXI.Graphics, w: number, h: number): PIXI.Sprite | PIXI.Graphics {
  const renderer = Game.app?.renderer;
  if (!renderer) return g;
  try {
    const tex = renderer.generateTexture(g, {
      region: new PIXI.Rectangle(-w / 2, -h / 2, w, h),
      resolution: Math.min(2, renderer.resolution || 1),
    });
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5);
    spr.once('destroyed', () => tex.destroy(true));
    g.destroy();
    return spr;
  } catch (e) {
    console.warn('[skinShowcase] 舞台烘焙失败，退回矢量绘制', e);
    return g;
  }
}

/**
 * 靛蓝夜幕 + 满月 + 旋转光环 + 闪烁星点。中心 (0,0)。
 *
 * 性能：夜幕/满月/边框/星点各烘成一张贴图，不用遮罩，光环缩在舞台内。
 * 一张舞台每帧只有 5 个 sprite、2 次加法混合，旋转和淡入淡出只改 transform/alpha。
 * 货架上多张卡并排拖动也不会打断合批；调用方只给视口内的舞台推 tick。
 */
export function makeMoonStage(w: number, h: number, radius = 22, rich = false): MoonStage {
  const root = new PIXI.Container();

  const bgG = new PIXI.Graphics();
  bgG.beginFill(SKIN_UI.night, 1);
  bgG.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
  bgG.endFill();
  bgG.beginFill(SKIN_UI.nightLift, 0.55);
  bgG.drawEllipse(0, -h * 0.08, w * 0.46, h * 0.38);
  bgG.endFill();
  bgG.beginFill(SKIN_UI.nightLift, 0.35);
  bgG.drawEllipse(0, h * 0.4, w * 0.44, h * 0.08);
  bgG.endFill();
  const moonX = w * 0.26;
  const moonY = -h * 0.34;
  const moonR = Math.max(16, Math.min(w, h) * 0.1);
  bgG.beginFill(SKIN_UI.moon, 0.12);
  bgG.drawCircle(moonX, moonY, Math.min(moonR * 2.1, w / 2 - moonX - 2));
  bgG.endFill();
  bgG.beginFill(SKIN_UI.moon, 0.22);
  bgG.drawCircle(moonX, moonY, moonR * 1.45);
  bgG.endFill();
  bgG.beginFill(SKIN_UI.moon, 0.95);
  bgG.drawCircle(moonX, moonY, moonR);
  bgG.endFill();
  const spots = sparkleSpots(w, h, rich ? 22 : 12);
  for (let i = 0; i < spots.length; i += 3) {
    drawSparkle(bgG, spots[i].x, spots[i].y, spots[i].r * 0.7, 0.45);
  }
  root.addChild(bake(bgG, w, h));

  // 光环：直径不超过舞台短边，转起来也不出框，免遮罩
  const glowD = Math.min(w, h) * 0.98;
  const rays = new PIXI.Sprite(PIXI.Texture.EMPTY);
  rays.anchor.set(0.5);
  rays.tint = SKIN_UI.glow;
  rays.alpha = rich ? 0.34 : 0.3;
  rays.blendMode = PIXI.BLEND_MODES.ADD;
  rays.position.set(0, -h * 0.03);
  root.addChild(rays);
  bindLazySprite(rays, {
    path: UI_FX_IMAGES.gachaRays,
    ensure: true,
    onApplied: (tex) => rays.scale.set(glowD / Math.max(tex.width, tex.height)),
  });

  const ring = new PIXI.Sprite(PIXI.Texture.EMPTY);
  ring.anchor.set(0.5);
  ring.tint = SKIN_UI.glow;
  ring.alpha = 0.5;
  ring.blendMode = PIXI.BLEND_MODES.ADD;
  ring.position.set(0, -h * 0.03);
  root.addChild(ring);
  const ringD = Math.min(w, h) * 0.86;
  bindLazySprite(ring, {
    path: UI_FX_IMAGES.auraRing,
    ensure: true,
    onApplied: (tex) => ring.scale.set(ringD / Math.max(tex.width, tex.height)),
  });

  const layerA = new PIXI.Graphics();
  const layerB = new PIXI.Graphics();
  spots.forEach((p, i) => {
    if (i % 3 === 0) return;
    drawSparkle(i % 2 === 0 ? layerA : layerB, p.x, p.y, p.r);
  });
  const twinkleA = bake(layerA, w, h);
  const twinkleB = bake(layerB, w, h);
  twinkleA.blendMode = PIXI.BLEND_MODES.ADD;
  twinkleB.blendMode = PIXI.BLEND_MODES.ADD;
  root.addChild(twinkleA, twinkleB);

  const art = new PIXI.Container();
  root.addChild(art);

  const frameG = new PIXI.Graphics();
  frameG.lineStyle(3, SKIN_UI.silver, 0.95);
  frameG.drawRoundedRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, radius);
  frameG.lineStyle(1.5, SKIN_UI.silver, 0.45);
  frameG.drawRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, Math.max(4, radius - 5));
  root.addChild(bake(frameG, w, h));

  let t = 0;
  const tick: Ticker = (dt) => {
    if (root.destroyed) return;
    t += dt;
    rays.rotation += dt * 0.12;
    ring.rotation -= dt * 0.25;
    ring.alpha = 0.42 + Math.sin(t * 1.6) * 0.12;
    const v = (Math.sin(t * 2.2) + 1) / 2;
    twinkleA.alpha = 0.2 + v * 0.8;
    twinkleB.alpha = 1 - v * 0.8;
    art.y = Math.sin(t * 1.4) * 4;
  };
  return { root, art, tick };
}

/** 立绘按框等比放进舞台 art 层；返回取消函数 */
export function fillStageArt(
  stage: MoonStage,
  path: string | readonly string[],
  boxW: number,
  boxH: number,
  offsetY = 0,
): () => void {
  stage.art.removeChildren().forEach((c) => c.destroy());
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  spr.position.set(0, offsetY);
  stage.art.addChild(spr);
  return bindLazySprite(spr, {
    path,
    ensure: true,
    onApplied: (tex) => spr.scale.set(Math.min(boxW / tex.width, boxH / tex.height)),
  });
}

/** 左上角「限定」红签 */
export function makeLimitedTag(label = '限定'): PIXI.Container {
  const root = new PIXI.Container();
  const t = makeText(label, {
    size: FONT_SIZE.xs, fill: 0xffffff, bold: true, anchor: 0.5, role: 'title',
  });
  const w = Math.ceil(t.width + 26);
  const h = 34;
  const g = new PIXI.Graphics();
  g.lineStyle(2, SKIN_UI.ribbonEdge, 1);
  g.beginFill(SKIN_UI.ribbon, 1);
  g.drawRoundedRect(0, 0, w, h, 10);
  g.endFill();
  root.addChild(g);
  t.position.set(w / 2, h / 2);
  root.addChild(t);
  return root;
}

function makePortraitTile(path: string, size: number, highlight: boolean): PIXI.Container {
  const root = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.lineStyle(highlight ? 3 : 2, highlight ? SKIN_UI.silver : COLORS.panelBorderSoft, 1);
  g.beginFill(highlight ? SKIN_UI.night : 0xfff6e6, 1);
  g.drawRoundedRect(-size / 2, -size / 2, size, size, 14);
  g.endFill();
  root.addChild(g);
  const box = size - 8;
  const spr = new PIXI.Sprite(PIXI.Texture.EMPTY);
  spr.anchor.set(0.5);
  const m = new PIXI.Graphics();
  m.beginFill(0xffffff);
  m.drawRoundedRect(-box / 2, -box / 2, box, box, 11);
  m.endFill();
  root.addChild(m);
  spr.mask = m;
  root.addChild(spr);
  bindLazySprite(spr, {
    path,
    ensure: true,
    onApplied: (tex) => spr.scale.set(Math.max(box / tex.width, box / tex.height)),
  });
  return root;
}

/** 原貌 → 外观 两格对比，左对齐于 (0,0) 顶部 */
export function makeLookCompare(basePath: string, skinPath: string, size = 76): PIXI.Container {
  const root = new PIXI.Container();
  const gap = 46;
  const left = makePortraitTile(basePath, size, false);
  left.position.set(size / 2, size / 2);
  root.addChild(left);
  const right = makePortraitTile(skinPath, size, true);
  right.position.set(size * 1.5 + gap, size / 2);
  root.addChild(right);

  const arrow = new PIXI.Graphics();
  const ax = size + gap / 2;
  const ay = size / 2;
  arrow.beginFill(COLORS.accent, 1);
  arrow.drawPolygon([ax - 12, ay - 9, ax + 2, ay - 9, ax + 2, ay - 16, ax + 16, ay, ax + 2, ay + 16, ax + 2, ay + 9, ax - 12, ay + 9]);
  arrow.endFill();
  root.addChild(arrow);

  const l1 = makeText('原貌', { size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0.5, 0] });
  l1.position.set(size / 2, size + 6);
  root.addChild(l1);
  const l2 = makeText('外观', { size: FONT_SIZE.xxs, fill: SKIN_UI.ink, bold: true, anchor: [0.5, 0] });
  l2.position.set(size * 1.5 + gap, size + 6);
  root.addChild(l2);
  return root;
}

/** 原貌全屏台：暖色底，不转光环 */
function makeWarmStage(w: number, h: number, radius = 22): MoonStage {
  const root = new PIXI.Container();
  const g = new PIXI.Graphics();
  g.beginFill(0xf5e8d0, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.endFill();
  g.beginFill(0xfff6e2, 0.9);
  g.drawEllipse(0, -h * 0.06, w * 0.4, h * 0.42);
  g.endFill();
  g.beginFill(0xe8d3ad, 0.55);
  g.drawEllipse(0, h * 0.32, w * 0.34, h * 0.05);
  g.endFill();
  root.addChild(g);
  const art = new PIXI.Container();
  root.addChild(art);
  const frame = new PIXI.Graphics();
  frame.lineStyle(3, 0xd9b26a, 1);
  frame.drawRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, radius);
  root.addChild(frame);
  return { root, art, tick: () => undefined };
}

export interface SkinPreviewOpts {
  skinName: string;
  petName: string;
  skinBody: string | readonly string[];
  /** 已拥有时的状态文案；未拥有为 null，底部改显示「只换外观」 */
  ownedNote: string | null;
  /** 底部主按钮（买 / 去更换 / 分享），由调用方构建 */
  makeAction: () => PIXI.Container;
  /** 第二种支付，和主按钮并排。有它时不再把主按钮放大 */
  makeAlt?: () => PIXI.Container;
  onClose: () => void;
  /** 副标题，默认「宠物名 · 限定外观」 */
  subtitle?: string;
  /** 原貌用暖色台，限定外观用月夜台 */
  warm?: boolean;
}

/** 全屏大图：只展示这套限定立绘，底部直接购买 */
export class SkinPreviewOverlay extends PIXI.Container {
  private _stage: MoonStage | null = null;
  private _unbindArt: (() => void) | null = null;
  private _closed = false;
  private readonly _opts: SkinPreviewOpts;

  constructor(opts: SkinPreviewOpts) {
    super();
    this._opts = opts;
    this._build();
  }

  tick(dt: number): void {
    this._stage?.tick(dt);
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._unbindArt?.();
    this._unbindArt = null;
    this._opts.onClose();
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    const dim = new PIXI.Graphics();
    dim.beginFill(SKIN_UI.dim, 0.94);
    dim.drawRect(0, 0, w, h);
    dim.endFill();
    dim.eventMode = 'static';
    dim.hitArea = new PIXI.Rectangle(0, 0, w, h);
    bindPointerTap(dim, () => this.close());
    this.addChild(dim);

    const body = new PIXI.Container();
    body.position.set(w / 2, 0);
    this.addChild(body);

    const top = Game.safeTop + 24;
    const title = makeText(this._opts.skinName, {
      size: 50, fill: SKIN_UI.moon, anchor: 0.5, role: 'title',
      strokeColor: SKIN_UI.ink, strokeWidth: 6,
    });
    title.position.set(0, top + 30);
    body.addChild(title);
    const sub = makeText(this._opts.subtitle ?? `${this._opts.petName} · 限定外观`, {
      size: FONT_SIZE.sm, fill: SKIN_UI.glow, bold: true, anchor: 0.5,
    });
    sub.position.set(0, top + 76);
    body.addChild(sub);

    const footerH = 168;
    const stageTop = top + 104;
    const stageW = Math.min(620, w - 64);
    const stageH = Math.max(480, Math.min(920, h - stageTop - footerH));
    const stage = this._opts.warm
      ? makeWarmStage(stageW, stageH, 28)
      : makeMoonStage(stageW, stageH, 28, true);
    stage.root.position.set(0, stageTop + stageH / 2);
    body.addChild(stage.root);
    this._stage = stage;
    const stageHit = new PIXI.Container();
    stageHit.hitArea = new PIXI.Rectangle(-stageW / 2, -stageH / 2, stageW, stageH);
    stageHit.eventMode = 'static';
    stageHit.position.copyFrom(stage.root.position);
    bindPointerTap(stageHit, () => undefined);
    body.addChild(stageHit);
    this._unbindArt = fillStageArt(
      stage,
      this._opts.skinBody,
      stageW * 0.9,
      stageH * 0.88,
      stageH * 0.03,
    );

    const actionY = stageTop + stageH + 56;
    const action = this._opts.makeAction();
    const alt = this._opts.makeAlt?.() ?? null;
    if (alt) {
      const gap = 20;
      const aw = action.getLocalBounds().width;
      const bw = alt.getLocalBounds().width;
      action.position.set(-(gap + bw) / 2, actionY);
      alt.position.set((gap + aw) / 2, actionY);
      body.addChild(action, alt);
    } else {
      action.position.set(0, actionY);
      action.scale.set(1.3);
      body.addChild(action);
    }
    const note = makeText(this._opts.ownedNote ?? '只换外观，不影响战力', {
      size: FONT_SIZE.xs, fill: SKIN_UI.glow, bold: !!this._opts.ownedNote, anchor: 0.5,
    });
    note.position.set(0, actionY + 54);
    body.addChild(note);

    const close = makeCloseButton({ onTap: () => this.close(), color: SKIN_UI.moon, size: 64, arm: 14 });
    close.position.set(w / 2 - 44, top + 30);
    body.addChild(close);

    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    stage.root.scale.set(0.92);
    TweenManager.to({
      target: stage.root.scale, props: { x: 1, y: 1 }, duration: 0.3, ease: Ease.easeOutBack,
    });
  }

}
