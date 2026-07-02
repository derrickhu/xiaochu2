import type { SkillDef, SkillEffectDef } from './types';
import { ELEMENT_NAME } from '../ui';
import { getRaritySkillPower } from '../rarity';

const pct = (v: number): string => `${Math.round(v * 100)}%`;

/** 格式化 basePower，消除浮点噪声 */
export function formatBasePower(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '');
}

function describeEffect(e: SkillEffectDef): string {
  switch (e.kind) {
    case 'damage':
      return `直伤 ${pct(e.multiplier)} (${e.source}${e.element ? `·${ELEMENT_NAME[e.element]}` : ''})`;
    case 'heal':
      return `治疗 ${pct(e.pct)} (${e.source})`;
    case 'shield':
      return `护盾 ${pct(e.pct)} (${e.stack})`;
    case 'status':
      if (e.status === 'teamDamageBuff') return `增伤 ×${e.mult} ${e.turns}回合`;
      return `减伤 ${pct(e.reduction ?? 0)} ${e.turns}回合`;
    case 'convertOrbs':
      return `转珠→${e.to === 'heart' ? '心' : ELEMENT_NAME[e.to as keyof typeof ELEMENT_NAME]} ${e.shape ?? 'random'}×${e.count}`;
    case 'charge':
      return `蓄力 ${pct(e.multiplier)}`;
    case 'multiHit':
      return `${e.hits}段×${pct(e.multiplier)} (${e.source})`;
    case 'dot':
      return `DOT ${e.turns}回合×${pct(e.multiplier)}/回合`;
    case 'stun':
      return `眩晕 ${e.turns}回合`;
    case 'defenseBreak':
      return `破防 ${pct(e.pct)} ${e.turns}回合`;
    case 'gravity':
      return `重力 敌当前HP×${pct(e.pct)}`;
    case 'haste':
      return `队友CD -${e.amount}`;
    case 'purify':
      return `净化${e.unsealBoard ? ' 解封' : ''}${e.cleanseTeam ? ' 驱散' : ''}`;
    case 'delayEnemyAttack':
      return `威吓 敌普攻+${e.turns}回合`;
    case 'extraDragTime':
      return `加时 +${e.seconds}s ${e.turns}回合`;
    case 'guaranteedCrit':
      return `必暴击 ${e.turns}回合`;
    case 'elementDamageBuff':
      return `${ELEMENT_NAME[e.element]}伤 ×${e.mult} ${e.turns}回合`;
    case 'sealOrbs':
      return `封珠 ×${e.count}`;
    case 'timeSqueeze':
      return `时间压缩 -${e.seconds}s ${e.turns}回合`;
    case 'healBlock':
      return `禁疗 回复×${e.mult} ${e.turns}回合`;
    case 'enrage':
      return `狂暴 HP<${pct(e.threshold)}时攻击×${e.atkMult}`;
    case 'skillSeal':
      return `技能封印 ${e.turns}回合`;
  }
}

/** 逐条 effect 技术摘要（策划展开详情） */
export function describeSkillEffects(skill: SkillDef): string {
  return skill.effects.map(describeEffect).join(' · ');
}

/** basePower 预算指数 tooltip（非战斗直读公式） */
export function describeSkillBudget(skill: SkillDef): string {
  const bp = formatBasePower(skill.basePower);
  const ur = formatBasePower(skill.basePower * getRaritySkillPower(4));
  return [
    `R 预算指数 ${bp}（${skill.category}，不同 category 推导口径不同）`,
    `同 skillId 跨稀有参考：UR≈${ur}（×${getRaritySkillPower(4)}）`,
    '战斗结算叠乘 effect 倍率/百分比，不直接读 basePower',
  ].join('\n');
}
