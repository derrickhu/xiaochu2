/**
 * 章末 Boss 收服演出（全屏）
 *
 * 特效贴图（光柱/法阵）本身是黑底不透明 PNG，必须用 ADD 混合，
 * 播完后淡出销毁，否则会留下难看的矩形/菱形黑框。
 * 立绘优先用干净头像 + 五行相框放大展示（全身怪面常带灰雾脏边）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { SfxManager } from '@/core/SfxManager';
import { PET_MAP } from '@/balance/pets';
import { getRarity } from '@/balance/rarity';
import { ELEMENT_NAME, ORB_COLOR } from '@/balance/ui';
import {
  UI_FX_IMAGES, petAvatarPath, petFrameImage, petShowcaseImage,
} from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import {
  FONT_SIZE,
  attachPetFrameOrb, makeActionButton, makeText, makeRarityBadge, popIn, pulse,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface BossPetRevealOpts {
  parent: PIXI.Container;
  petIds: readonly string[];
  onDone: () => void;
}

export async function playBossPetReveal(opts: BossPetRevealOpts): Promise<void> {
  const petId = opts.petIds[0];
  if (!petId) {
    opts.onDone();
    return;
  }

  const pet = PET_MAP.get(petId);
  const rarity = pet?.rarity ?? 1;
  const rar = getRarity(rarity);
  const el = pet?.element;
  const color = rar.color;
  // 头像抠图干净；全身怪面作次选（常有灰雾脏边）
  const avatarPath = petAvatarPath(petId, 1);
  const bodyPath = petShowcaseImage(petId, 1);

  const w = Game.logicWidth;
  const h = Game.logicHeight;
  const root = new PIXI.Container();
  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, w, h);
  opts.parent.addChild(root);

  const fxKeep: PIXI.DisplayObject[] = [];
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    TweenManager.to({
      target: root,
      props: { alpha: 0 },
      duration: 0.28,
      ease: Ease.easeInQuad,
      onComplete: () => {
        root.destroy({ children: true });
        opts.onDone();
      },
    });
  };

  // 柔和暗场（无硬边框）
  const scrim = new PIXI.Graphics();
  scrim.beginFill(0x120c08, 0.82);
  scrim.drawRect(0, 0, w, h);
  scrim.endFill();
  root.addChild(scrim);

  const framePath = el ? petFrameImage(el) : null;
  await ensureAssets([
    avatarPath,
    bodyPath,
    ...(framePath ? [framePath] : []),
    UI_FX_IMAGES.lightPillar,
    UI_FX_IMAGES.summonCircle,
    UI_FX_IMAGES.starburst,
    UI_FX_IMAGES.auraRing,
    UI_FX_IMAGES.particleSpark,
  ]).catch(() => { /* 缺图走降级 */ });
  if (finished || root.destroyed) return;

  // 稀有度色柔光：仅出场闪一下，定格前淡出（停留会像脏紫圈）
  const glow = new PIXI.Graphics();
  for (let i = 4; i >= 1; i--) {
    glow.beginFill(color, 0.06 * i);
    glow.drawCircle(0, 0, Math.min(w, h) * (0.18 + i * 0.07));
    glow.endFill();
  }
  glow.position.set(w / 2, h * 0.40);
  glow.alpha = 0;
  root.addChild(glow);
  fxKeep.push(glow);

  const fxBack = new PIXI.Container();
  const stage = new PIXI.Container();
  const fxFront = new PIXI.Container();
  root.addChild(fxBack, stage, fxFront);

  // 法阵 / 光柱：ADD 混合，黑底会被吃掉；播完淡出
  const circle = addGlowSprite(fxBack, UI_FX_IMAGES.summonCircle, w / 2, h * 0.48, color);
  if (circle) {
    fxKeep.push(circle);
    circle.scale.set(0.25);
    circle.alpha = 0;
    const target = (w * 0.85) / Math.max(1, circle.texture.width);
    TweenManager.to({ target: circle, props: { alpha: 0.9 }, duration: 0.35, ease: Ease.easeOutQuad });
    TweenManager.to({
      target: circle.scale, props: { x: target, y: target },
      duration: 0.55, ease: Ease.easeOutCubic,
    });
    TweenManager.to({
      target: circle, props: { rotation: Math.PI * 1.6 },
      duration: 3.2, ease: Ease.linear,
    });
  }

  const pillar = addGlowSprite(fxBack, UI_FX_IMAGES.lightPillar, w / 2, h * 0.55, color);
  if (pillar) {
    fxKeep.push(pillar);
    pillar.anchor.set(0.5, 0.5);
    pillar.alpha = 0;
    const ph = h * 0.9;
    const pw = Math.min(260, w * 0.38);
    pillar.height = ph;
    pillar.width = pw;
    TweenManager.to({
      target: pillar, props: { alpha: 0.85 },
      duration: 0.3, delay: 0.05, ease: Ease.easeOutQuad,
    });
  }

  // 眉标
  const eyebrow = makeText('章末试炼 · 收服成功', {
    size: FONT_SIZE.sm, fill: 0xfff3d0, bold: true, anchor: 0.5,
    role: 'title',
    strokeColor: 0x3a2a10, strokeWidth: 4,
  });
  eyebrow.position.set(w / 2, h * 0.11);
  eyebrow.alpha = 0;
  stage.addChild(eyebrow);

  // 灵宠展示：头像 + 五行相框（与编队/战斗槽同款，不画程序圆圈）
  const hero = new PIXI.Container();
  hero.position.set(w / 2, h * 0.40);
  hero.alpha = 0;
  hero.scale.set(0.35);
  stage.addChild(hero);

  const frameSize = Math.min(w, h) * 0.46;
  const avatarTex = TextureCache.get(avatarPath) ?? TextureCache.get(bodyPath);
  if (avatarTex) {
    const sp = new PIXI.Sprite(avatarTex);
    sp.anchor.set(0.5);
    sp.scale.set((frameSize - 16) / Math.max(avatarTex.width, avatarTex.height));
    hero.addChild(sp);
  }
  const frameTex = framePath ? TextureCache.get(framePath) : null;
  if (frameTex) {
    const frame = new PIXI.Sprite(frameTex);
    frame.anchor.set(0.5);
    frame.width = frameSize;
    frame.height = frameSize;
    hero.addChild(frame);
  }
  if (el) attachPetFrameOrb(hero, el, frameSize);

  const badge = makeRarityBadge({ tier: rarity, height: 44 });
  badge.position.set(w / 2 - frameSize / 2 - 4, h * 0.40 - frameSize / 2 - 2);
  badge.alpha = 0;
  stage.addChild(badge);

  const name = makeText(pet?.name ?? petId, {
    size: 48, fill: 0xfff8e8, bold: true, anchor: 0.5,
    role: 'title',
    strokeColor: color, strokeWidth: 6,
  });
  name.position.set(w / 2, h * 0.62);
  name.alpha = 0;
  stage.addChild(name);

  const metaBits = [
    rar.code,
    el ? ELEMENT_NAME[el] : '',
    opts.petIds.length > 1 ? `等 ${opts.petIds.length} 只` : '',
  ].filter(Boolean);
  const meta = makeText(metaBits.join(' · '), {
    size: FONT_SIZE.md,
    fill: el ? ORB_COLOR[el] : 0xffe7b0,
    bold: true, anchor: 0.5,
    strokeColor: 0x2a1a0c, strokeWidth: 3,
  });
  meta.position.set(w / 2, h * 0.68);
  meta.alpha = 0;
  stage.addChild(meta);

  const tip = makeText('已加入图鉴 · 可编入队伍', {
    size: FONT_SIZE.xs, fill: 0xe8d9b0, bold: true, anchor: 0.5,
  });
  tip.position.set(w / 2, h * 0.73);
  tip.alpha = 0;
  stage.addChild(tip);

  const cta = makeActionButton({
    title: '太棒了 · 继续',
    width: 360,
    height: 78,
    variant: 'gold',
    fontSize: FONT_SIZE.lg,
    onTap: finish,
  });
  cta.position.set(w / 2, h * 0.84);
  cta.alpha = 0;
  cta.eventMode = 'none';
  stage.addChild(cta);

  let canSkip = false;
  bindPointerTap(root, () => {
    if (canSkip) finish();
  });

  Platform.vibrateShort('heavy');
  SfxManager.playBoss();

  TweenManager.to({
    target: glow, props: { alpha: 1 }, duration: 0.35, ease: Ease.easeOutQuad,
  });

  setTimeout(() => {
    if (finished) return;
    popIn(eyebrow, { duration: 0.28, fromScale: 0.7 });
  }, 120);

  setTimeout(() => {
    if (finished) return;
    SfxManager.playSkill();
    TweenManager.to({
      target: hero, props: { alpha: 1 }, duration: 0.28, ease: Ease.easeOutQuad,
    });
    TweenManager.to({
      target: hero.scale, props: { x: 1, y: 1 },
      duration: 0.55, ease: Ease.easeOutBack,
      onComplete: () => pulse(hero, { peak: 1.04, duration: 0.32 }),
    });
    spawnStarburst(fxFront, w / 2, h * 0.40, color);
    spawnSparks(fxFront, w / 2, h * 0.40, color);
  }, 280);

  setTimeout(() => {
    if (finished) return;
    popIn(badge, { duration: 0.26, fromScale: 0.5 });
    popIn(name, { duration: 0.32, fromScale: 0.6 });
    popIn(meta, { duration: 0.28, fromScale: 0.8 });
    popIn(tip, { duration: 0.24, fromScale: 0.9 });
    SfxManager.playNextFloor();
    Platform.vibrateShort('medium');
    // 特效收干净：光柱/法阵/背景柔光淡出，定格不留光晕
    for (const sp of fxKeep) {
      TweenManager.to({
        target: sp, props: { alpha: 0 },
        duration: 0.45, ease: Ease.easeInQuad,
        onComplete: () => { if (!sp.destroyed) sp.destroy(); },
      });
    }
  }, 620);

  setTimeout(() => {
    if (finished) return;
    const aura = addGlowSprite(fxFront, UI_FX_IMAGES.auraRing, w / 2, h * 0.40, color);
    if (aura) {
      aura.alpha = 0.75;
      aura.scale.set(0.35);
      TweenManager.to({
        target: aura.scale, props: { x: 1.5, y: 1.5 },
        duration: 0.65, ease: Ease.easeOutQuad,
      });
      TweenManager.to({
        target: aura, props: { alpha: 0 },
        duration: 0.65, ease: Ease.easeInQuad,
        onComplete: () => { if (!aura.destroyed) aura.destroy(); },
      });
    }
    popIn(cta, { duration: 0.3, fromScale: 0.85 });
    cta.eventMode = 'static';
    canSkip = true;
  }, 900);
}

/** 黑底特效贴图：ADD 混合，避免露出矩形黑框 */
function addGlowSprite(
  parent: PIXI.Container,
  path: string,
  x: number,
  y: number,
  color: number,
): PIXI.Sprite | null {
  const tex = TextureCache.get(path);
  if (!tex) return null;
  const sp = new PIXI.Sprite(tex);
  sp.anchor.set(0.5);
  sp.position.set(x, y);
  sp.tint = color;
  sp.blendMode = PIXI.BLEND_MODES.ADD;
  parent.addChild(sp);
  return sp;
}

function spawnStarburst(layer: PIXI.Container, x: number, y: number, color: number): void {
  const sp = addGlowSprite(layer, UI_FX_IMAGES.starburst, x, y, color);
  if (!sp) return;
  sp.alpha = 0.95;
  sp.scale.set(0.2);
  TweenManager.to({
    target: sp.scale, props: { x: 1.8, y: 1.8 },
    duration: 0.55, ease: Ease.easeOutQuad,
  });
  TweenManager.to({
    target: sp, props: { alpha: 0, rotation: Math.PI * 0.5 },
    duration: 0.55, ease: Ease.easeInQuad,
    onComplete: () => { if (!sp.destroyed) sp.destroy(); },
  });
}

function spawnSparks(layer: PIXI.Container, x: number, y: number, color: number): void {
  const tex = TextureCache.get(UI_FX_IMAGES.particleSpark);
  for (let i = 0; i < 14; i++) {
    const ang = (Math.PI * 2 * i) / 14 + Math.random() * 0.2;
    const dist = 80 + Math.random() * 100;
    let sp: PIXI.Container;
    if (tex) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0.5);
      s.tint = color;
      s.blendMode = PIXI.BLEND_MODES.ADD;
      s.scale.set(0.5 + Math.random() * 0.6);
      sp = s;
    } else {
      const g = new PIXI.Graphics();
      g.beginFill(0xffffff, 1);
      g.drawCircle(0, 0, 4);
      g.endFill();
      g.blendMode = PIXI.BLEND_MODES.ADD;
      sp = g;
    }
    sp.position.set(x, y);
    sp.alpha = 1;
    layer.addChild(sp);
    TweenManager.to({
      target: sp,
      props: {
        x: x + Math.cos(ang) * dist,
        y: y + Math.sin(ang) * dist,
        alpha: 0,
      },
      duration: 0.55 + Math.random() * 0.25,
      ease: Ease.easeOutQuad,
      onComplete: () => { if (!sp.destroyed) sp.destroy(); },
    });
  }
}
