/**
 * 资源路径映射表
 *
 * 主包资源放 minigame/images/，分包/CDN 资源后续在此扩展。
 */
import type { Element, OrbType } from '@/balance/combat';
import { PETS } from '@/balance/pets';
import { ENEMIES } from '@/balance/enemies';

const IMG_ROOT = 'images';

/** 宠物五行相框（复用 xiao_chu frame_pet_*.png） */
export const PET_FRAME_IMAGES: Readonly<Record<Element, string>> = {
  metal: `${IMG_ROOT}/ui/frame_pet_metal.png`,
  wood: `${IMG_ROOT}/ui/frame_pet_wood.png`,
  water: `${IMG_ROOT}/ui/frame_pet_water.png`,
  fire: `${IMG_ROOT}/ui/frame_pet_fire.png`,
  earth: `${IMG_ROOT}/ui/frame_pet_earth.png`,
};

export function petFrameImage(element: Element): string {
  return PET_FRAME_IMAGES[element];
}

/** 棋盘格贴图（复用 xiao_chu 资源，深浅交替铺格） */
export const BOARD_IMAGES = {
  dark: `${IMG_ROOT}/board/board_bg_dark1.jpg`,
  light: `${IMG_ROOT}/board/board_bg_light1.jpg`,
} as const;

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
  BOARD_IMAGES.dark,
  BOARD_IMAGES.light,
  ...Object.values(ORB_IMAGES),
  ...Object.values(PET_FRAME_IMAGES),
  ...ENEMIES.map((e) => enemyImage(e.id)),
  ...PETS.map((p) => petImage(p.id)),
];
