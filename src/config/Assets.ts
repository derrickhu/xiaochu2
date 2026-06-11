/**
 * 资源路径映射表
 *
 * 主包资源放 minigame/images/，分包/CDN 资源后续在此扩展。
 */
import type { OrbType } from '@/balance/combat';

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

/** 启动时需要预加载的资源 */
export const PRELOAD_IMAGES: readonly string[] = Object.values(ORB_IMAGES);
