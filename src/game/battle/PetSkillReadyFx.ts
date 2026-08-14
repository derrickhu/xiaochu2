/**
 * 宠物技能就绪
 *
 * 软光点贴图 + 加法混合：12 颗小粒子沿相框宽度分列，从底循环升到顶。
 * 单颗约框宽 13%，不画几何圆、不加光柱。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { setScaleSafe } from '@/core/animationGuard';
import { UI_BATTLE_IMAGES, UI_FX_IMAGES } from '@/config/Assets';

const FLASH_DURATION = 0.28;
const MOTE_COUNT = 12;
const RISE_HZ = 0.58;
/** 单颗相对相框：业界 HUD 粒子大约一成多，再大就会糊成泡 */
const MOTE_SIZE = 0.14;

function lighten(color: number, t: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (
    (Math.round(r + (255 - r) * t) << 16)
    | (Math.round(g + (255 - g) * t) << 8)
    | Math.round(b + (255 - b) * t)
  );
}

interface ReadyMote {
  spr: PIXI.Sprite;
  lane: number;
  phase: number;
  size: number;
  drift: number;
}

export interface PetSkillReadyFxView {
  root: PIXI.Container;
  glow: PIXI.Graphics;
  ring: PIXI.Graphics;
  flash: PIXI.Graphics;
  arrow: PIXI.Container;
  motes: ReadyMote[];
  color: number;
  flashT: number;
  animT: number;
  arrowBaseScale: number;
}

function drawChevronFallback(size: number, color: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const drawOne = (y: number, s: number, fill: number, alpha: number) => {
    g.beginFill(fill, alpha);
    g.moveTo(0, y);
    g.lineTo(-s * 0.75, y + s * 0.7);
    g.lineTo(-s * 0.35, y + s * 0.7);
    g.lineTo(0, y + s * 0.28);
    g.lineTo(s * 0.35, y + s * 0.7);
    g.lineTo(s * 0.75, y + s * 0.7);
    g.closePath();
    g.endFill();
  };
  drawOne(0, size, 0x3a2c10, 1);
  drawOne(size * 0.42, size * 0.78, 0x3a2c10, 1);
  drawOne(size * 0.06, size * 0.88, color, 1);
  drawOne(size * 0.48, size * 0.68, color, 1);
  drawOne(size * 0.14, size * 0.62, 0xffffff, 0.9);
  drawOne(size * 0.54, size * 0.48, 0xffffff, 0.85);
  return g;
}

function mountArrowSprite(
  parent: PIXI.Container,
  tex: PIXI.Texture,
  color: number,
  arrowSize: number,
): number {
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5);
  const baseScale = arrowSize / Math.max(tex.width, tex.height);
  sp.scale.set(baseScale);
  sp.tint = color;
  parent.addChild(sp);
  return baseScale;
}

function moteTexture(): PIXI.Texture {
  return TextureCache.get(UI_BATTLE_IMAGES.skillReadyMote)
    ?? TextureCache.get(UI_FX_IMAGES.particleSpark)
    ?? TextureCache.get(UI_BATTLE_IMAGES.skillReadySpark)
    ?? PIXI.Texture.WHITE;
}

/** 创建单个宠物槽的就绪动效层（默认隐藏） */
export function createPetSkillReadyFx(petSize: number, color: number): PetSkillReadyFxView {
  const root = new PIXI.Container();
  root.visible = false;
  const half = petSize / 2;
  const radius = Math.max(12, Math.round(petSize * 0.14));
  const hot = lighten(color, 0.4);

  const glow = new PIXI.Graphics();
  glow.beginFill(color, 0.16);
  glow.drawRoundedRect(-half - 4, -half - 4, petSize + 8, petSize + 8, radius + 4);
  glow.endFill();
  glow.blendMode = PIXI.BLEND_MODES.ADD;
  root.addChild(glow);

  const ring = new PIXI.Graphics();
  ring.lineStyle(3.5, color, 0.9);
  ring.drawRoundedRect(-half - 1, -half - 1, petSize + 2, petSize + 2, radius);
  ring.lineStyle(1.5, hot, 0.4);
  ring.drawRoundedRect(-half + 2, -half + 2, petSize - 4, petSize - 4, Math.max(8, radius - 2));
  root.addChild(ring);

  const flash = new PIXI.Graphics();
  flash.beginFill(color, 0.7);
  flash.drawRoundedRect(-half, -half, petSize, petSize, radius);
  flash.endFill();
  flash.visible = false;
  root.addChild(flash);

  const tex = moteTexture();
  const motes: ReadyMote[] = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5);
    spr.tint = color;
    spr.blendMode = PIXI.BLEND_MODES.ADD;
    root.addChild(spr);
    motes.push({
      spr,
      lane: 0.10 + (i / (MOTE_COUNT - 1)) * 0.80,
      phase: (i * 0.37) % 1,
      size: MOTE_SIZE * (0.88 + (i % 3) * 0.10),
      drift: i * 1.3,
    });
  }

  const arrowSize = petSize * 0.48;
  const arrowBox = new PIXI.Container();
  arrowBox.y = -half - arrowSize * 0.42;
  root.addChild(arrowBox);

  const fx: PetSkillReadyFxView = {
    root,
    glow,
    ring,
    flash,
    arrow: arrowBox,
    motes,
    color,
    flashT: 0,
    animT: 0,
    arrowBaseScale: 1,
  };

  const arrowTex = TextureCache.get(UI_BATTLE_IMAGES.skillReadyArrow);
  if (arrowTex) {
    fx.arrowBaseScale = mountArrowSprite(arrowBox, arrowTex, color, arrowSize);
  } else {
    arrowBox.addChild(drawChevronFallback(arrowSize, color));
    void TextureCache.load(UI_BATTLE_IMAGES.skillReadyArrow).then((loaded) => {
      if (arrowBox.destroyed) return;
      arrowBox.removeChildren().forEach((c) => c.destroy());
      fx.arrowBaseScale = mountArrowSprite(arrowBox, loaded, color, arrowSize);
    }).catch(() => {});
  }

  if (!TextureCache.get(UI_BATTLE_IMAGES.skillReadyMote)) {
    void TextureCache.load(UI_BATTLE_IMAGES.skillReadyMote).then((loaded) => {
      if (root.destroyed) return;
      for (const m of motes) m.spr.texture = loaded;
    }).catch(() => {});
  }

  return fx;
}

export function triggerPetSkillReadyFlash(fx: PetSkillReadyFxView): void {
  fx.flashT = FLASH_DURATION;
}

/** 每帧更新；canInteract=false 时隐藏（上滑中） */
export function updatePetSkillReadyFx(
  fx: PetSkillReadyFxView,
  dt: number,
  petSize: number,
  canAct: boolean,
  canInteract: boolean,
  slotScale?: PIXI.ObservablePoint,
): void {
  if (!canInteract) {
    fx.root.visible = false;
    return;
  }

  fx.root.visible = true;
  fx.animT += dt;
  const t = fx.animT * 5.2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.15);
  const half = petSize / 2;
  const arrowSize = petSize * 0.48;

  fx.glow.alpha = canAct ? 0.18 + pulse * 0.10 : 0.08;
  fx.ring.alpha = canAct ? 0.80 + pulse * 0.20 : 0.45;

  const bounce = canAct ? Math.sin(t * 1.6) * 6 : Math.sin(t) * 2;
  fx.arrow.y = -half - arrowSize * 0.42 - bounce;
  fx.arrow.alpha = canAct ? 0.96 + pulse * 0.04 : 0.7;
  const breathe = canAct ? 1 + pulse * 0.10 : 1;
  const arrowSp = fx.arrow.children[0];
  if (arrowSp instanceof PIXI.Sprite && fx.arrowBaseScale > 0) {
    arrowSp.scale.set(fx.arrowBaseScale * breathe);
  }

  const riseHz = canAct ? RISE_HZ : RISE_HZ * 0.45;
  for (const m of fx.motes) {
    const phase = (fx.animT * riseHz + m.phase) % 1;
    const px = -half + petSize * m.lane
      + Math.sin(phase * Math.PI * 2 + m.drift) * petSize * 0.035;
    const py = half - phase * petSize;
    const fade = phase < 0.12
      ? phase / 0.12
      : (phase > 0.72 ? Math.max(0, (1 - phase) / 0.28) : 1);
    const sz = petSize * m.size * (canAct ? 1 : 0.88);
    m.spr.position.set(px, py);
    m.spr.width = sz;
    m.spr.height = sz;
    m.spr.alpha = fade * (canAct ? 0.9 : 0.38);
    m.spr.visible = true;
  }

  if (canAct && slotScale) {
    slotScale.set(1 + pulse * 0.02);
  }

  if (fx.flashT > 0) {
    fx.flashT = Math.max(0, fx.flashT - dt);
    const rfP = fx.flashT / FLASH_DURATION;
    fx.flash.visible = true;
    fx.flash.alpha = rfP * 0.75;
    setScaleSafe(fx.flash, 0.85 + (1 - rfP) * 0.25);
  } else {
    fx.flash.visible = false;
    setScaleSafe(fx.flash, 1);
  }
}
