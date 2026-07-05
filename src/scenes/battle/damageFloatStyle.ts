/**
 * 宠物槽位伤害飘字 — 样式/文案/运动参数对齐 xiao_chu dmgFloat.js
 */
import * as PIXI from 'pixi.js';
import { computePetBarPetSize } from './BattleLayout';
import { Game } from '@/core/Game';
import type { Element } from '@/balance/combat';
import { UI } from '@/balance/ui';
import { displayAlive, setScaleSafe } from '@/core/animationGuard';

/** xiao_chu main.js: S = W / 375 */
export function dmgFloatScale(): number {
  return Game.logicWidth / 375;
}

/** 伤害飘字语义色（策划调数值见 balance/ui.ts → UI.damageFloat） */
export type DamageFloatColorKind = 'normal' | 'crit' | 'total' | 'totalCaption' | 'counterMark';

export interface DmgRenderStyle {
  fontSize: number;
  stroke: number;
  fontWeight: number | string;
  fontFamily: string;
}

const DMG_FONT = '"Avenir Next Condensed","Arial Black","PingFang SC",sans-serif';

/** xiao_chu RENDER_CFG.dmgFloat.styles */
export const DMG_RENDER_STYLES: Readonly<Record<string, DmgRenderStyle>> = {
  slotDamageMain: {
    fontSize: 21,
    stroke: 5,
    fontWeight: 900,
    fontFamily: DMG_FONT,
  },
  slotDamageCrit: {
    fontSize: 29,
    stroke: 6.8,
    fontWeight: 900,
    fontFamily: DMG_FONT,
  },
  slotDamageMinor: {
    fontSize: 13,
    stroke: 3.2,
    fontWeight: 900,
    fontFamily: DMG_FONT,
  },
  /** 回合末各宠物累计伤害（与总伤害同步停留） */
  slotDamageRecap: {
    fontSize: 23,
    stroke: 5.4,
    fontWeight: 900,
    fontFamily: DMG_FONT,
  },
};

export interface DmgMotionPreset {
  startScale: number;
  peakScale: number;
  settleScale: number;
  popFrames: number;
  settleFrames: number;
  startYOffset?: number;
  riseFrames: number;
  riseDist: number;
  returnFrames?: number;
  returnTo?: number;
  reboundFrames?: number;
  reboundTo?: number;
  holdFrames?: number;
  driftFrames?: number;
  driftDist?: number;
  lifeFrames: number;
  fadeStart: number;
  shakeDur?: number;
  shakeAmp?: number;
  jitterFrames?: number;
  jitterAmp?: number;
}

/** xiao_chu MOTION_PRESETS（宠物槽位伤害） */
export const DMG_MOTION: Readonly<Record<string, DmgMotionPreset>> = {
  slotDamageMain: {
    startScale: 0.64,
    peakScale: 1.36,
    settleScale: 1.02,
    popFrames: 4,
    settleFrames: 15,
    startYOffset: 14,
    riseFrames: 11,
    riseDist: 54,
    returnFrames: 10,
    returnTo: -7,
    reboundFrames: 9,
    reboundTo: 4,
    holdFrames: 72,
    driftFrames: 14,
    driftDist: 6,
    lifeFrames: 168,
    fadeStart: 142,
  },
  slotDamageCrit: {
    startScale: 0.68,
    peakScale: 1.62,
    settleScale: 1.1,
    popFrames: 4,
    settleFrames: 16,
    startYOffset: 16,
    riseFrames: 12,
    riseDist: 64,
    returnFrames: 10,
    returnTo: -9,
    reboundFrames: 10,
    reboundTo: 4.5,
    holdFrames: 84,
    driftFrames: 15,
    driftDist: 7,
    lifeFrames: 186,
    fadeStart: 158,
    shakeDur: 13,
    shakeAmp: 4.8,
    jitterFrames: 16,
    jitterAmp: 3.3,
  },
  /** 回合末槽位累计伤害：快速落定后长时间停留，与敌人总伤害同步淡出 */
  slotDamageRecap: {
    startScale: 0.72,
    peakScale: 1.24,
    settleScale: 1.06,
    popFrames: 4,
    settleFrames: 10,
    startYOffset: 12,
    riseFrames: 7,
    riseDist: 32,
    returnFrames: 8,
    returnTo: -4,
    holdFrames: 98,
    driftFrames: 10,
    driftDist: 3,
    lifeFrames: 168,
    fadeStart: 142,
  },
  slotDamageMinor: {
    startScale: 0.8,
    peakScale: 1.12,
    settleScale: 1,
    popFrames: 4,
    settleFrames: 8,
    riseFrames: 5,
    riseDist: 10,
    returnFrames: 7,
    returnTo: 1,
    holdFrames: 18,
    lifeFrames: 42,
    fadeStart: 32,
  },
  /** 打在敌人身上的单段伤害（比槽位版更醒目、停更久） */
  enemyHitMain: {
    startScale: 0.58,
    peakScale: 1.48,
    settleScale: 1.08,
    popFrames: 5,
    settleFrames: 16,
    startYOffset: 8,
    riseFrames: 13,
    riseDist: 48,
    returnFrames: 11,
    returnTo: -6,
    reboundFrames: 9,
    reboundTo: 3,
    holdFrames: 48,
    driftFrames: 16,
    driftDist: 4,
    lifeFrames: 125,
    fadeStart: 102,
  },
  enemyHitCrit: {
    startScale: 0.62,
    peakScale: 1.72,
    settleScale: 1.14,
    popFrames: 5,
    settleFrames: 18,
    startYOffset: 10,
    riseFrames: 14,
    riseDist: 58,
    returnFrames: 11,
    returnTo: -8,
    reboundFrames: 10,
    reboundTo: 4,
    holdFrames: 56,
    driftFrames: 17,
    driftDist: 5,
    lifeFrames: 138,
    fadeStart: 112,
    shakeDur: 14,
    shakeAmp: 5.2,
    jitterFrames: 18,
    jitterAmp: 3.6,
  },
};

/** xiao_chu FLOAT_CFG 宠物伤害缩放 / 延迟 */
export const PET_FLOAT_CFG = {
  normalAtk: { slotYRatio: 0.6, scale: 1.06, delayStep: 3 },
  skill: { slotYRatio: 0.6, scale: 1.04 },
  multiHit: { upperYRatio: 0.5, lowerYRatio: 0.78, xStep: 8, scale: 1.03 },
} as const;

export type PetDmgStyleKey = 'slotDamageMain' | 'slotDamageCrit' | 'slotDamageMinor' | 'slotDamageRecap';

export type EnemyDmgStyleKey = 'enemyHitMain' | 'enemyHitCrit';

export function resolveEnemyDmgStyleKey(isCrit: boolean, minor: boolean): EnemyDmgStyleKey | 'slotDamageMinor' {
  if (minor) return 'slotDamageMinor';
  return isCrit ? 'enemyHitCrit' : 'enemyHitMain';
}

export type TurnTotalTier = 'normal' | 'mid' | 'high' | 'mega';

export function resolveTurnTotalTier(
  total: number,
  combo: number,
  hitCount: number,
  enemyMaxHp: number,
): TurnTotalTier {
  if (total >= enemyMaxHp * 0.35 || combo >= 10) return 'mega';
  if (total >= enemyMaxHp * 0.18 || combo >= 7 || hitCount >= 4) return 'high';
  if (hitCount >= 2 || combo >= 4 || total >= enemyMaxHp * 0.08) return 'mid';
  return 'normal';
}

/** 多段命中时在敌人立绘上的错位，避免数字重叠 */
export function enemyDamageAnchor(
  centerX: number,
  centerY: number,
  orderIdx: number,
  hitCount: number,
): { x: number; y: number } {
  const S = dmgFloatScale();
  const cols = Math.min(3, Math.max(1, hitCount));
  const col = orderIdx % cols;
  const row = Math.floor(orderIdx / cols);
  const spreadX = 56 * S;
  const spreadY = 40 * S;
  const xOff = (col - (cols - 1) / 2) * spreadX;
  const yOff = -24 * S - row * spreadY;
  return { x: centerX + xOff, y: centerY + yOff };
}

export function resolvePetDmgStyleKey(isCrit: boolean, minor: boolean): PetDmgStyleKey {
  if (minor) return 'slotDamageMinor';
  if (isCrit) return 'slotDamageCrit';
  return 'slotDamageMain';
}

export function formatDmgNumber(n: number): string {
  return Math.max(0, Math.round(n || 0)).toLocaleString('en-US');
}

export function buildPetDmgLabel(_element: Element, damage: number): string {
  return formatDmgNumber(damage);
}

/** 槽位锚点：对齐 xiao_chu _petSlotAnchor main lane */
export function petSlotDamageAnchor(slotX: number, slotY: number, lane: 'main' | 'minorUpper' | 'minorLower' = 'main'): { x: number; y: number } {
  const petSize = computePetBarPetSize(Game.logicWidth, 5);
  const { petFrameScale } = UI.battle;
  const frameH = petSize * petFrameScale;
  const frameTop = slotY - frameH / 2;
  const ratio = lane === 'minorUpper'
    ? PET_FLOAT_CFG.multiHit.upperYRatio
    : lane === 'minorLower'
      ? PET_FLOAT_CFG.multiHit.lowerYRatio
      : PET_FLOAT_CFG.normalAtk.slotYRatio;
  return { x: slotX, y: frameTop + frameH * ratio };
}

export function resolveDamageFloatColor(
  styleKey: PetDmgStyleKey | EnemyDmgStyleKey,
  colorKind?: DamageFloatColorKind,
): DamageFloatColorKind {
  if (colorKind) return colorKind;
  if (styleKey === 'slotDamageCrit' || styleKey === 'enemyHitCrit') return 'crit';
  return 'normal';
}

export function applyDmgRenderStyle(
  text: PIXI.Text,
  styleKey: PetDmgStyleKey | EnemyDmgStyleKey,
  colorKind?: DamageFloatColorKind,
  opts?: { counter?: boolean },
): void {
  const renderKey: PetDmgStyleKey = styleKey === 'enemyHitMain'
    ? 'slotDamageMain'
    : styleKey === 'enemyHitCrit'
      ? 'slotDamageCrit'
      : styleKey;
  const semantic = resolveDamageFloatColor(styleKey, colorKind);
  const colors = UI.damageFloat[semantic];
  const S = dmgFloatScale();
  const RS = DMG_RENDER_STYLES[renderKey];
  text.style.fontFamily = RS.fontFamily;
  text.style.fontSize = RS.fontSize * S;
  text.style.fontWeight = '900' as PIXI.TextStyleFontWeight;
  // 微信真机 Canvas Text 渐变 fill 会崩，用纯色；dropShadow 在真机会出现块状底色
  text.style.fill = colors.fill;
  text.style.stroke = colors.stroke;
  text.style.strokeThickness = RS.stroke * S * (opts?.counter ? UI.damageFloat.counterStrokeMul : 1);
  text.style.dropShadow = false;
  text.style.align = 'center';
}

function lerp(a: number, b: number, p: number): number {
  return a + (b - a) * p;
}

function easeOutCubic(p: number): number {
  const x = Math.max(0, Math.min(1, p));
  return 1 - (1 - x) ** 3;
}

export interface PetDamageFloatRuntime {
  text: PIXI.Text;
  update(dt: number): boolean;
}

/** 帧驱动飘字（逻辑同 xiao_chu animations.js _updateDmgFloatList） */
export function createPetDamageFloatRuntime(opts: {
  text: PIXI.Text;
  baseX: number;
  baseY: number;
  baseScale: number;
  styleKey: PetDmgStyleKey | EnemyDmgStyleKey;
  motion: DmgMotionPreset;
  delayFrames?: number;
}): PetDamageFloatRuntime {
  const { text, baseX, baseY, baseScale, styleKey, motion } = opts;
  const S = dmgFloatScale();
  let delay = opts.delayFrames ?? 0;
  let t = 0;
  let dead = false;
  const targetAlpha = 1;
  const startScale = motion.startScale ?? 0.78;

  text.position.set(baseX, baseY);
  if (!setScaleSafe(text, baseScale * startScale)) {
    return { text, update: () => true };
  }
  text.alpha = delay > 0 ? 0 : 1;

  return {
    text,
    update(dt: number): boolean {
      if (dead || !displayAlive(text)) {
        dead = true;
        return true;
      }
      const fps = UI.fps.battle;
      if (delay > 0) {
        delay -= dt * fps;
        if (delay > 0) return false;
        text.alpha = targetAlpha;
      }

      t += dt * fps;
      const popFrames = Math.max(1, motion.popFrames);
      const settleFrames = Math.max(popFrames + 1, motion.settleFrames);
      const riseFrames = Math.max(1, motion.riseFrames);
      const driftFrames = Math.max(0, motion.driftFrames ?? 0);
      const returnFrames = Math.max(0, motion.returnFrames ?? 0);
      const reboundFrames = Math.max(0, motion.reboundFrames ?? 0);
      const holdFrames = Math.max(0, motion.holdFrames ?? 0);
      const lifeFrames = Math.max(settleFrames + 1, motion.lifeFrames);
      const fadeStart = Math.min(lifeFrames - 1, Math.max(settleFrames, motion.fadeStart));
      const peakScale = motion.peakScale ?? 1.18;
      const settleScale = motion.settleScale ?? 1;

      let motionScale: number;
      if (t <= popFrames) {
        motionScale = lerp(startScale, peakScale, easeOutCubic(t / popFrames));
      } else if (t <= settleFrames) {
        motionScale = lerp(peakScale, settleScale, easeOutCubic((t - popFrames) / (settleFrames - popFrames)));
      } else {
        motionScale = settleScale;
      }
      if (!setScaleSafe(text, baseScale * motionScale)) {
        dead = true;
        return true;
      }

      const startYOffset = (motion.startYOffset ?? 0) * S;
      const riseDist = (motion.riseDist ?? 0) * S;
      const returnTo = (motion.returnTo ?? 0) * S;
      const reboundTo = (motion.reboundTo ?? motion.returnTo ?? 0) * S;
      const settleTo = reboundFrames > 0 ? reboundTo : returnTo;

      const riseP = Math.min(1, t / riseFrames);
      let yOffset = startYOffset - easeOutCubic(riseP) * riseDist;

      if (returnFrames > 0 && t > riseFrames) {
        if (reboundFrames > 0 && t > riseFrames + returnFrames) {
          const reboundP = Math.min(1, (t - riseFrames - returnFrames) / reboundFrames);
          yOffset = lerp(-returnTo, -reboundTo, easeOutCubic(reboundP));
        } else {
          const returnP = Math.min(1, (t - riseFrames) / returnFrames);
          yOffset = lerp(-riseDist, -returnTo, easeOutCubic(returnP));
        }
      } else if (t > riseFrames && driftFrames > 0) {
        const driftP = Math.min(1, (t - riseFrames) / driftFrames);
        yOffset -= easeOutCubic(driftP) * (motion.driftDist ?? 0) * S;
      }

      if (returnFrames > 0 && t > riseFrames + returnFrames + reboundFrames + holdFrames && driftFrames > 0) {
        const driftP = Math.min(1, (t - riseFrames - returnFrames - reboundFrames - holdFrames) / driftFrames);
        yOffset = -settleTo - easeOutCubic(driftP) * (motion.driftDist ?? 0) * S;
      }

      let shakeOffset = 0;
      if (
        (styleKey === 'slotDamageCrit' || styleKey === 'enemyHitCrit')
        && (motion.shakeDur ?? 0) > 0
        && t <= (motion.shakeDur ?? 0)
      ) {
        shakeOffset += Math.sin(t * 3.5) * (motion.shakeAmp ?? 0) * S * (1 - t / (motion.shakeDur ?? 1));
      }
      if ((motion.jitterFrames ?? 0) > 0 && t <= (motion.jitterFrames ?? 0)) {
        shakeOffset += Math.sin(t * 5.2) * (motion.jitterAmp ?? 0) * S * (1 - t / (motion.jitterFrames ?? 1));
      }

      text.position.set(baseX + shakeOffset, baseY + yOffset);

      if (t < fadeStart) {
        text.alpha = targetAlpha;
      } else {
        const fadeDur = Math.max(1, lifeFrames - fadeStart);
        text.alpha = Math.max(0, targetAlpha * (1 - (t - fadeStart) / fadeDur));
      }

      if (t >= lifeFrames || text.alpha <= 0) {
        dead = true;
        return true;
      }
      return false;
    },
  };
}
