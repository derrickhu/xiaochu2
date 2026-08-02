/**
 * 宠物技能就绪提示（对齐 skill_ready_v1_badge）
 *
 * 就绪态：元素色粗光边 + 头顶双箭头 + 底部「技能」金匾 + 闪点。
 * 性能：贴图/Graphics 创建时一次，运行时只改 transform / alpha / tint。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { setScaleSafe } from '@/core/animationGuard';
import { UI_BATTLE_IMAGES } from '@/config/Assets';
import { makeText } from '@/ui/text';

const FLASH_DURATION = 0.28;
const SPARK_COUNT = 5;

export interface PetSkillReadyFxView {
  root: PIXI.Container;
  /** 外圈柔光 */
  glow: PIXI.Graphics;
  /** 粗描边框 */
  border: PIXI.Graphics;
  flash: PIXI.Graphics;
  arrow: PIXI.Container;
  badge: PIXI.Container;
  badgeLabel: PIXI.Text;
  sparks: PIXI.Sprite[];
  /** 边框闪点相位 */
  sparkPhase: number[];
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

function drawBadgeFallback(w: number, h: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0xf6efd8, 0.98);
  g.lineStyle(3, 0xd4b05a, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.endFill();
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

/** 创建单个宠物槽的就绪动效层（默认隐藏） */
export function createPetSkillReadyFx(petSize: number, color: number): PetSkillReadyFxView {
  const root = new PIXI.Container();
  root.visible = false;
  const half = petSize / 2;
  const radius = Math.max(12, Math.round(petSize * 0.14));

  const glow = new PIXI.Graphics();
  glow.beginFill(color, 0.35);
  glow.drawRoundedRect(
    -half - 10, -half - 10,
    petSize + 20, petSize + 20,
    radius + 8,
  );
  glow.endFill();
  root.addChild(glow);

  const border = new PIXI.Graphics();
  border.lineStyle(5, color, 1);
  border.drawRoundedRect(-half - 2, -half - 2, petSize + 4, petSize + 4, radius);
  border.lineStyle(2, 0xffffff, 0.55);
  border.drawRoundedRect(-half + 1, -half + 1, petSize - 2, petSize - 2, Math.max(8, radius - 2));
  root.addChild(border);

  const flash = new PIXI.Graphics();
  flash.beginFill(color, 0.65);
  flash.drawRoundedRect(-half, -half, petSize, petSize, radius);
  flash.endFill();
  flash.visible = false;
  root.addChild(flash);

  const arrowSize = petSize * 0.42;
  const arrowBox = new PIXI.Container();
  arrowBox.y = -half - arrowSize * 0.55;
  root.addChild(arrowBox);

  const badge = new PIXI.Container();
  const badgeW = petSize * 0.92;
  const badgeH = Math.max(28, Math.round(petSize * 0.28));
  badge.y = half - badgeH * 0.15;
  root.addChild(badge);

  const badgeLabel = makeText('技能', {
    size: Math.max(16, Math.round(petSize * 0.168)),
    fill: 0x5a3a14,
    bold: true,
    anchor: 0.5,
    strokeColor: 0xfff6dc,
    strokeWidth: 2,
  });

  const sparks: PIXI.Sprite[] = [];
  const sparkPhase: number[] = [];
  const sparkTex = TextureCache.get(UI_BATTLE_IMAGES.skillReadySpark) ?? PIXI.Texture.WHITE;
  for (let i = 0; i < SPARK_COUNT; i++) {
    const sp = new PIXI.Sprite(sparkTex);
    sp.anchor.set(0.5);
    sp.tint = i % 2 === 0 ? 0xffffff : color;
    sparks.push(sp);
    sparkPhase.push(i / SPARK_COUNT);
    root.addChild(sp);
  }

  const fx: PetSkillReadyFxView = {
    root,
    glow,
    border,
    flash,
    arrow: arrowBox,
    badge,
    badgeLabel,
    sparks,
    sparkPhase,
    color,
    flashT: 0,
    animT: 0,
    arrowBaseScale: 1,
  };

  // 箭头贴图（可异步）
  const arrowTex = TextureCache.get(UI_BATTLE_IMAGES.skillReadyArrow);
  if (arrowTex) {
    fx.arrowBaseScale = mountArrowSprite(arrowBox, arrowTex, color, arrowSize);
  } else {
    arrowBox.addChild(drawChevronFallback(arrowSize, color));
    void TextureCache.load(UI_BATTLE_IMAGES.skillReadyArrow).then((tex) => {
      if (arrowBox.destroyed) return;
      arrowBox.removeChildren().forEach((c) => c.destroy());
      fx.arrowBaseScale = mountArrowSprite(arrowBox, tex, color, arrowSize);
    }).catch(() => {});
  }

  // 技能匾贴图（可异步）
  const badgeTex = TextureCache.get(UI_BATTLE_IMAGES.skillReadyBadge);
  if (badgeTex) {
    const sp = new PIXI.Sprite(badgeTex);
    sp.anchor.set(0.5);
    sp.width = badgeW;
    sp.height = badgeH;
    badge.addChild(sp);
  } else {
    badge.addChild(drawBadgeFallback(badgeW, badgeH));
    void TextureCache.load(UI_BATTLE_IMAGES.skillReadyBadge).then((tex) => {
      if (badge.destroyed) return;
      const old = badge.children[0];
      if (old && old !== badgeLabel) {
        badge.removeChild(old);
        old.destroy();
      }
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = badgeW;
      sp.height = badgeH;
      badge.addChildAt(sp, 0);
    }).catch(() => {});
  }
  badge.addChild(badgeLabel);

  if (!TextureCache.get(UI_BATTLE_IMAGES.skillReadySpark)) {
    void TextureCache.load(UI_BATTLE_IMAGES.skillReadySpark).then((tex) => {
      if (root.destroyed) return;
      for (const sp of sparks) sp.texture = tex;
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
  const arrowSize = petSize * 0.42;

  fx.glow.alpha = canAct ? 0.28 + pulse * 0.22 : 0.18;
  fx.border.alpha = canAct ? 0.85 + pulse * 0.15 : 0.7;
  fx.badge.alpha = canAct ? 0.95 + pulse * 0.05 : 0.88;

  const bounce = canAct ? Math.sin(t * 1.6) * 5 : Math.sin(t) * 2;
  fx.arrow.y = -half - arrowSize * 0.55 - bounce;
  fx.arrow.alpha = canAct ? 0.95 + pulse * 0.05 : 0.8;
  const breathe = canAct ? 1 + pulse * 0.08 : 1;
  const arrowSp = fx.arrow.children[0];
  if (arrowSp instanceof PIXI.Sprite && fx.arrowBaseScale > 0) {
    arrowSp.scale.set(fx.arrowBaseScale * breathe);
  }

  for (let i = 0; i < fx.sparks.length; i++) {
    const sp = fx.sparks[i];
    const phase = (fx.animT * 1.8 + fx.sparkPhase[i]) % 1;
    const peri = petSize * 4;
    const d = phase * peri;
    let px = 0;
    let py = 0;
    if (d < petSize) {
      px = -half + d;
      py = -half;
    } else if (d < petSize * 2) {
      px = half;
      py = -half + (d - petSize);
    } else if (d < petSize * 3) {
      px = half - (d - petSize * 2);
      py = half;
    } else {
      px = -half;
      py = half - (d - petSize * 3);
    }
    const twinkle = 0.45 + 0.55 * Math.sin((fx.animT * 8 + i) * 2);
    const sz = (canAct ? 10 : 8) * (0.75 + twinkle * 0.45);
    sp.position.set(px, py);
    sp.width = sp.height = sz;
    sp.alpha = canAct ? 0.55 + twinkle * 0.45 : 0.35 + twinkle * 0.25;
    sp.visible = true;
  }

  if (canAct && slotScale) {
    slotScale.set(1 + pulse * 0.035);
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
