/**
 * 能力描述（展示层共享）：被动文案的统一入口。
 *
 * 玩家视角的「被动」= resolvePetPassiveBundle.displayLines（signature + ladder + 星级成长）。
 * 战斗与展示读同一 bundle 解析管线。
 */
import type { PetDef } from '@/balance/pets';
import { resolvePetPassiveBundle, type PassiveDisplayLine } from '@/balance/passiveEffects';
import { describeTrait } from '@/balance/passives';

export { describeTrait };
export type { PassiveDisplayLine };

/**
 * 被动展示统一入口（详情 / 图鉴 / 抽卡共用）。
 * @param star 当前星级（含 ★3/★5 成长行，未解锁灰显）
 */
export function passiveDisplayLines(pet: PetDef, star = 1): PassiveDisplayLine[] {
  return [...resolvePetPassiveBundle(pet.role, pet.rarity, star, { includeStarInDisplay: true }).displayLines];
}

/** @deprecated 由 passiveDisplayLines 统一；保留供旧调用 */
export function traitLines(pet: PetDef, star = 1): string[] {
  return passiveDisplayLines(pet, star).map((l) => l.text);
}
