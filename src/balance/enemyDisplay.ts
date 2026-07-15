/**
 * 敌人表现分级（纯数据 + 纯函数）
 *
 * 业界常见三层（Pad / 智龙 / 怪物彈珠）：
 * - 杂兵：小图、泛称、可大量复用，铺垫关「刷怪感」
 * - 精英/守关：具名 + 机制，Boss 战前置波
 * - Boss：全幅立绘 + 强标签，与可收录灵宠觉醒面同级
 *
 * 逻辑数值仍走 EnemyDef；此处只管战斗/选关 UI 的尺寸、标签与命名口径。
 */
import type { Element } from './combat';
import type { EnemyDef } from './enemies';
import { ELEMENT_NAME } from './ui';

/** 敌人表现档位（与关卡 type normal/elite/boss 不同，按「这一波的视觉身份」划分） */
export type EnemyDisplayTier = 'mob' | 'elite' | 'miniBoss' | 'boss';

export const ENEMY_TIER_LABEL: Readonly<Record<EnemyDisplayTier, string>> = {
  mob: '杂兵',
  elite: '精英',
  miniBoss: '守关',
  boss: 'BOSS',
};

export const ENEMY_TIER_COLOR: Readonly<Record<EnemyDisplayTier, number>> = {
  mob: 0x5a4632,
  elite: 0xb5701f,
  miniBoss: 0x7345ad,
  boss: 0xc0392b,
};

/**
 * 战斗立绘目标高度（设计坐标 px）。
 * 以 1-1 木域软泥的视觉体量为基准：所有怪按高度对齐，避免横图（如火蝠）
 * 被 `max(宽,高)` contain 压成「小一圈」。
 */
export function enemyDisplaySize(tier: EnemyDisplayTier): number {
  switch (tier) {
    case 'mob': return 420;
    case 'elite': return 440;
    case 'miniBoss': return 460;
    case 'boss': return 480;
  }
}

/** 立绘最大宽度：横图可略宽于竖图；叠层放大后允许接近屏宽 */
export function enemyDisplayMaxWidth(tier: EnemyDisplayTier): number {
  switch (tier) {
    case 'mob': return 720;
    case 'elite': return 730;
    case 'miniBoss': return 740;
    case 'boss': return 740;
  }
}

/**
 * 敌人立绘缩放：优先对齐目标高度（与 1-1 史莱姆同体量），
 * 过宽时再按 maxWidth 回压；可选 maxHeight 限制在立绘区内，避免顶穿名匾。
 */
export function enemySpriteScale(
  texWidth: number,
  texHeight: number,
  tier: EnemyDisplayTier,
  maxHeight?: number,
): number {
  const w = Math.max(1, texWidth);
  const h = Math.max(1, texHeight);
  const targetH = enemyDisplaySize(tier);
  const maxW = enemyDisplayMaxWidth(tier);
  const cappedH = maxHeight != null && maxHeight > 0
    ? Math.min(targetH, maxHeight)
    : targetH;
  let s = cappedH / h;
  if (w * s > maxW) s = maxW / w;
  if (maxHeight != null && maxHeight > 0 && h * s > maxHeight) {
    s = maxHeight / h;
  }
  return s;
}

/**
 * 立绘中心 Y：贴立绘区上沿（头顶靠近关卡匾，减少上方留白）。
 * 脚可自然伸入名/血条叠层区；spriteZoneBottom 仅作缩放上限参考，不强制贴底。
 */
export function enemySpriteCenterY(
  spriteZoneTop: number,
  _spriteZoneBottom: number,
  displayHeight: number,
  topPad = 6,
): number {
  const h = Math.max(1, displayHeight);
  return spriteZoneTop + Math.max(0, topPad) + h / 2;
}

/** Q 版亮色战斗：杂兵不再压灰，保持原色 */
export function enemySpriteTint(_tier: EnemyDisplayTier): number {
  return 0xffffff;
}

export function enemyDisplayTierOf(def: EnemyDef): EnemyDisplayTier {
  return def.displayTier ?? 'mob';
}

/** 战斗顶栏敌人名：档位标签 + 名字 +（非 Boss 杂兵才省略属性，Boss/守关保留属性） */
export function formatEnemyBattleName(def: EnemyDef): string {
  const tier = enemyDisplayTierOf(def);
  const tag = ENEMY_TIER_LABEL[tier];
  const el = ELEMENT_NAME[def.element];
  if (tier === 'mob') return `${tag} · ${def.name}`;
  if (tier === 'elite') return `${tag} · ${def.name} · ${el}`;
  return `${tag} · ${def.name} · ${el}`;
}

/** 编队预览等短名 */
export function formatEnemyShortName(def: EnemyDef): string {
  const tier = enemyDisplayTierOf(def);
  if (tier === 'mob') return def.name;
  return `${ENEMY_TIER_LABEL[tier]} ${def.name}`;
}

/** 是否在敌人脚下绘制档位环（守关 / Boss） */
export function enemyShowsTierRing(tier: EnemyDisplayTier): boolean {
  return tier === 'miniBoss' || tier === 'boss';
}

export function enemyTierRingRadius(displaySize: number): number {
  return displaySize * 0.34;
}

/** 杂兵血条略窄，强化「小怪」感 */
export function enemyHpBarWidthScale(tier: EnemyDisplayTier): number {
  switch (tier) {
    case 'mob': return 0.82;
    case 'elite': return 0.92;
    default: return 1;
  }
}

export function inferCreatureDisplayTier(tier: 'tier1' | 'tier2'): EnemyDisplayTier {
  return tier === 'tier2' ? 'boss' : 'elite';
}
