/**
 * 资源路径映射表
 *
 * 主包资源放 minigame/images/，分包/CDN 资源后续在此扩展。
 */
import type { OrbType } from '@/balance/combat';
import { PETS } from '@/balance/pets';
import { ENEMIES } from '@/balance/enemies';

const IMG_ROOT = 'images';

/** 珠子贴图（复用 xiao_chu 资源） */
export const ORB_IMAGES: Readonly<Record<OrbType, string>> = {
  metal: `${IMG_ROOT}/orbs/orb_metal.png`,
  wood: `${IMG_ROOT}/orbs/orb_wood.png`,
  water: `${IMG_ROOT}/orbs/orb_water.png`,
  fire: `${IMG_ROOT}/orbs/orb_fire.png`,
  earth: `${IMG_ROOT}/orbs/orb_earth.png`,
  heart: `${IMG_ROOT}/orbs/orb_heart.png`,
};

/** 敌人立绘（文件名 = enemies 表 id） */
export function enemyImage(enemyId: string): string {
  return `${IMG_ROOT}/enemies/${enemyId}.png`;
}

/** 宠物头像（文件名 = pets 表 id） */
export function petImage(petId: string): string {
  return `${IMG_ROOT}/pets/${petId}.png`;
}

/** 启动时需要预加载的资源 */
export const PRELOAD_IMAGES: readonly string[] = [
  ...Object.values(ORB_IMAGES),
  ...ENEMIES.map((e) => enemyImage(e.id)),
  ...PETS.map((p) => petImage(p.id)),
];
