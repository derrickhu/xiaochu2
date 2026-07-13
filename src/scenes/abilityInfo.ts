/**
 * 能力描述（展示层 presenter）：被动文案的统一入口。
 *
 * 玩家视角的「被动」= resolvePetAbilities().passiveLines（signature + ladder + 星级成长），
 * 战斗与展示读同一快照管线（game/petAbilities.ts）。
 */
import type { PetDef } from '@/balance/pets';
import type { PassiveDisplayLine } from '@/balance/passiveEffects';
import { resolvePetAbilities } from '@/game/petAbilities';

export type { PassiveDisplayLine };

/**
 * 被动展示统一入口（详情 / 图鉴 / 抽卡共用）。
 * @param star 当前星级（★3/★5 成长行未解锁灰显）
 * @param level 当前等级（L0/Ladder 按里程碑解锁）；缺省为预览口径（等级门槛全开）
 */
export function passiveDisplayLines(
  pet: PetDef,
  star = 1,
  level = Number.MAX_SAFE_INTEGER,
): PassiveDisplayLine[] {
  return [...resolvePetAbilities(pet, { level, star }).passiveLines];
}
