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
  mob: 0x8a939e,
  elite: 0xffb74d,
  miniBoss: 0xb388ff,
  boss: 0xff5252,
};

/** 战斗立绘目标边长（设计坐标 px） */
export function enemyDisplaySize(tier: EnemyDisplayTier): number {
  switch (tier) {
    case 'mob': return 190;
    case 'elite': return 230;
    case 'miniBoss': return 270;
    case 'boss': return 300;
  }
}

/** 杂兵略压饱和，避免与灵宠立绘同款「收藏感」 */
export function enemySpriteTint(tier: EnemyDisplayTier): number {
  return tier === 'mob' ? 0xd8dde3 : 0xffffff;
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
