/**
 * 能力描述（展示层共享）：被动文案的统一入口。
 *
 * 玩家视角的「被动」= 两类能力合并展示（战斗逻辑仍分表，仅 UI 统一）：
 * 1. 签名战斗属性（role.attribBase × 稀有度）：暴击 / 减伤 / 治疗强化 / 全队增伤
 * 2. passives.ts 被动（光环 / 开局护盾 / 每回合回血等）
 *
 * ★3 / ★5 星级成长暂不展示（待统一星级成长线后再接入 UI）。
 * 战斗层仍由 talents.ts + petCombatAttribs 生效，升星数值不变。
 *
 * 详情页 / 图鉴能力卡 / 抽卡预览均调用 passiveDisplayLines()，保证口径一致。
 */
import type { PetDef } from '@/balance/pets';
import { passiveForPet } from '@/balance/pets';
import { describeTrait } from '@/balance/passives';
import {
  ATTRIB_UI, ATTRIB_SCOPE, PET_ROLE_PROFILES, type AttribKey,
} from '@/balance/petRoles';
import { getRarityAttribPower } from '@/balance/rarity';

export { describeTrait };

const ATTRIB_ORDER: AttribKey[] = [
  'critRate', 'critDamage', 'damageReduction', 'healBonus', 'teamDamageBonus',
];
const BONUS_KEYS = new Set<AttribKey>(['critDamage', 'healBonus', 'teamDamageBonus']);

/** 被动区单行展示（支持未解锁灰显 / 强调色） */
export interface PassiveDisplayLine {
  text: string;
  /** 是否已生效；缺省 true */
  unlocked?: boolean;
  /** 强调色；缺省由场景用 textSub */
  color?: number;
}

function formatPct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`;
}

/** passives.ts 被动描述（光环 / 触发型等） */
export function traitLines(pet: PetDef): string[] {
  return [...passiveForPet(pet).lines];
}

/** 定位招牌战斗属性（★1 基线 × 稀有度，不含星级叠加） */
function signatureCombatLines(pet: PetDef): PassiveDisplayLine[] {
  const profile = PET_ROLE_PROFILES[pet.role] ?? PET_ROLE_PROFILES.attacker;
  const power = getRarityAttribPower(pet.rarity);
  const lines: PassiveDisplayLine[] = [];
  for (const key of ATTRIB_ORDER) {
    const raw = profile.attribBase[key] * power;
    if (raw <= 0) continue;
    const ui = ATTRIB_UI[key];
    const prefix = BONUS_KEYS.has(key) ? '+' : '';
    const scope = ATTRIB_SCOPE[key] === 'self' ? '（自身）' : '';
    lines.push({
      text: `${ui.longLabel} ${prefix}${formatPct(raw)}${scope}`,
      unlocked: true,
      color: ui.color,
    });
  }
  return lines;
}

/**
 * 被动展示统一入口（详情 / 图鉴 / 抽卡共用）。
 * 顺序：签名战斗属性 → passives 被动。
 * @param star 保留参数，供后续统一星级成长线展示接入
 */
export function passiveDisplayLines(pet: PetDef, _star = 1): PassiveDisplayLine[] {
  const signature = signatureCombatLines(pet);
  const passives: PassiveDisplayLine[] = traitLines(pet).map((text) => ({ text, unlocked: true }));
  return [...signature, ...passives];
}
