/**
 * 段式复合技组装器 —— SSR/UR 招牌技的唯一构造入口
 *
 * 为什么不用 blueprints.ts 的单蓝图：
 * 单蓝图最多带一个「附带效果」（如 makeShield 的 extraConvert），撑不住 SSR 双效、UR 三效。
 * 手写 SkillDef 又会让 desc / basePower 脱离参数，与「文案由参数生成，不与数值漂移」的约定冲突。
 *
 * 这里把每个效果抽象成一个 SkillSegment，effects / desc / basePower 三者全部由段列表推导：
 * - effects：段 → SkillEffectDef
 * - desc：段短语按顺序拼接（flavor 在最前）
 * - basePower：段权重求和，权重口径与 blueprints.ts 各工厂保持一致
 *
 * 注意 category 的选择：nuke / multiNuke / dot / teamNuke 四个「纯输出类目」会被
 * monotonic.test.ts 的跨稀有倒挂审计覆盖（同类目内高稀有 basePower×稀有度倍率必须不低于低稀有）。
 * 复合技数值结构与纯输出技不可比，因此一律归入 control / debuff / buff / shield / heal /
 * gravity / haste / purify / utility 等类目，不参与该审计。
 */
import type { Element, OrbType } from '../combat';
import { hasteChargePctLabel } from '../skillCharge';
import { ELEMENT_NAME } from '../ui';
import type {
  ConvertShape,
  SkillCategory,
  SkillDef,
  SkillEffectDef,
  SkillTarget,
  SkillVfxId,
} from './types';

export type SkillSegment =
  | { kind: 'damage'; element: Element; multiplier: number }
  | { kind: 'gravity'; pct: number }
  | { kind: 'heal'; pct: number }
  | { kind: 'shield'; pct: number }
  | { kind: 'convert'; to: OrbType; count: number; shape?: ConvertShape }
  | { kind: 'damageBuff'; mult: number; turns: number }
  | { kind: 'elementBuff'; element: Element; mult: number; turns: number }
  | { kind: 'defenseBreak'; pct: number; turns: number }
  | { kind: 'stun'; turns: number }
  | { kind: 'delayAttack'; turns: number }
  | { kind: 'haste'; amount: number }
  | { kind: 'purify' }
  | { kind: 'extraTime'; seconds: number; turns: number }
  | { kind: 'guaranteedCrit'; turns: number };

const pct = (m: number): string => `${Math.round(m * 100)}%`;

const orbName = (o: OrbType): string =>
  (o === 'heart' ? '心珠' : `${ELEMENT_NAME[o as Element]}珠`);

const shapeName = (shape: ConvertShape, count: number, to: OrbType): string => {
  const target = orbName(to);
  if (shape === 'row') return `将一整行珠子转为${target}`;
  if (shape === 'col') return `将一整列珠子转为${target}`;
  if (shape === 'cross') return `将十字范围内珠子转为${target}`;
  return `生成 ${count} 颗${target}`;
};

function segmentEffect(seg: SkillSegment): SkillEffectDef {
  switch (seg.kind) {
    case 'damage':
      return {
        kind: 'damage', source: 'casterAtk', multiplier: seg.multiplier, element: seg.element,
        applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true,
      };
    case 'gravity':
      return { kind: 'gravity', pct: seg.pct };
    case 'heal':
      return { kind: 'heal', source: 'teamMaxHp', pct: seg.pct };
    case 'shield':
      return { kind: 'shield', source: 'teamMaxHp', pct: seg.pct, stack: 'max' };
    case 'convert':
      return { kind: 'convertOrbs', to: seg.to, count: seg.count, shape: seg.shape ?? 'random' };
    case 'damageBuff':
      return { kind: 'status', status: 'teamDamageBuff', mult: seg.mult, turns: seg.turns, stack: 'replace' };
    case 'elementBuff':
      return { kind: 'elementDamageBuff', element: seg.element, mult: seg.mult, turns: seg.turns };
    case 'defenseBreak':
      return { kind: 'defenseBreak', pct: seg.pct, turns: seg.turns };
    case 'stun':
      return { kind: 'stun', turns: seg.turns };
    case 'delayAttack':
      return { kind: 'delayEnemyAttack', turns: seg.turns };
    case 'haste':
      return { kind: 'haste', amount: seg.amount };
    case 'purify':
      return { kind: 'purify', unsealBoard: true, cleanseTeam: true };
    case 'extraTime':
      return { kind: 'extraDragTime', seconds: seg.seconds, turns: seg.turns };
    case 'guaranteedCrit':
      return { kind: 'guaranteedCrit', turns: seg.turns };
  }
}

function segmentPhrase(seg: SkillSegment): string {
  switch (seg.kind) {
    case 'damage':
      return `对敌人造成自身攻击 ${pct(seg.multiplier)} 的${ELEMENT_NAME[seg.element]}属性伤害`;
    case 'gravity':
      return `造成敌人当前生命 ${pct(seg.pct)} 的伤害（无视防御）`;
    case 'heal':
      return `回复队伍最大生命的 ${pct(seg.pct)}`;
    case 'shield':
      return `获得队伍最大生命 ${pct(seg.pct)} 的护盾`;
    case 'convert':
      return shapeName(seg.shape ?? 'random', seg.count, seg.to);
    case 'damageBuff':
      return `${seg.turns} 回合内全队伤害 ×${seg.mult}`;
    case 'elementBuff':
      return `${seg.turns} 回合内${ELEMENT_NAME[seg.element]}属性伤害 ×${seg.mult}`;
    case 'defenseBreak':
      return `${seg.turns} 回合内降低敌人 ${pct(seg.pct)} 防御`;
    case 'stun':
      return `眩晕敌人 ${seg.turns} 回合`;
    case 'delayAttack':
      return `威吓敌人，普攻推迟 ${seg.turns} 回合`;
    case 'haste':
      return `为其他队友立刻充能 ${hasteChargePctLabel(seg.amount)}`;
    case 'purify':
      return '解除盘面封印珠并清除我方异常';
    case 'extraTime':
      return `${seg.turns} 回合内转珠时间 +${seg.seconds} 秒`;
    case 'guaranteedCrit':
      return `${seg.turns} 回合内全队攻击必定暴击`;
  }
}

/** 段权重口径与 blueprints.ts 各工厂一致，保证复合技与单蓝图技的 basePower 可横向比较 */
function segmentPower(seg: SkillSegment): number {
  switch (seg.kind) {
    case 'damage': return seg.multiplier;
    case 'gravity': return seg.pct * 20;
    case 'heal': return seg.pct * 10;
    case 'shield': return seg.pct * 10;
    case 'convert': return (seg.shape ?? 'random') === 'random' ? seg.count * 0.5 : 6;
    case 'damageBuff': return (seg.mult - 1) * seg.turns * 10;
    case 'elementBuff': return (seg.mult - 1) * seg.turns * 10;
    case 'defenseBreak': return seg.pct * seg.turns * 10;
    case 'stun': return seg.turns * 10;
    case 'delayAttack': return seg.turns * 8;
    case 'haste': return seg.amount * 10;
    case 'purify': return 15;
    case 'extraTime': return seg.seconds * seg.turns;
    case 'guaranteedCrit': return seg.turns * 8;
  }
}

/**
 * 组装多效果宠物技能。
 *
 * category 禁止填 nuke / multiNuke / dot / teamNuke（见文件头说明）。
 */
export function makeComposite(p: {
  id: string;
  name: string;
  category: Exclude<SkillCategory, 'nuke' | 'multiNuke' | 'dot' | 'teamNuke' | 'charge' | 'enemyGuard' | 'enemyHeal' | 'enemyDebuff'>;
  cd: number;
  target: SkillTarget;
  tags: readonly string[];
  segments: readonly SkillSegment[];
  flavor?: string;
  vfx?: SkillVfxId;
}): SkillDef {
  const body = p.segments.map(segmentPhrase).join('，');
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    cd: p.cd,
    owner: 'pet',
    trigger: 'manual',
    target: p.target,
    vfx: p.vfx,
    tags: p.tags,
    desc: p.flavor ? `${p.flavor}，${body}` : body,
    effects: p.segments.map(segmentEffect),
    basePower: p.segments.reduce((sum, seg) => sum + segmentPower(seg), 0),
  };
}
