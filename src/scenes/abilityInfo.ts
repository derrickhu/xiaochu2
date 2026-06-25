/**
 * 能力描述（展示层共享）：把宠物的统一被动 passiveForPet() 翻译成中文文案。
 * 抽卡 / 商店 / 图鉴的「能力卡」复用，保证「看能力再抽/买」口径一致。
 *
 * 阶段十起：被动唯一真源是 balance/passives.ts（签名被动 ×稀有度 + 专属修饰），
 * 本文件只做转发，不再各算一份。describeTrait 也迁到 balance 层，这里仅再导出兼容旧引用。
 */
import type { PetDef } from '@/balance/pets';
import { passiveForPet } from '@/balance/pets';
import { describeTrait } from '@/balance/passives';

export { describeTrait };

/** 一只宠的全部被动描述（含基础签名被动 + 专属修饰，按触发时机标注） */
export function traitLines(pet: PetDef): string[] {
  return [...passiveForPet(pet).lines];
}
