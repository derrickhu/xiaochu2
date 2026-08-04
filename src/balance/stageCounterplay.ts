/**
 * 关前「必带对策清单」（纯数据 + 纯函数）
 *
 * 硬闸门要成为**谜题**而不是**惩罚**，唯一的分界线是玩家在进关前能不能看见条件。
 * 看不见就只是「莫名其妙打不动，再去刷十级」；看得见才会去翻背包换宠。
 *
 * 这里把关卡机制的 counterTags 与当前编队对照，得出三种状态：
 * - `met`      当前编队已经具备
 * - `missing`  编队里没有，进关前该换人
 * - `manual`   靠操作而非编队（铺连、5 连），编队页帮不上忙，只作提醒
 *
 * 之所以要区分第三种：把「铺连能力」标成红叉会让玩家去背包里找一只根本不存在的
 * 「铺连宠」。说清楚它考的是操作，玩家才知道该去练什么。
 */
import type { PetDef } from './pets';
import { getSkill } from './skills';
import { resolveMechanics } from './stageMechanics';
import type { StageDef } from './stages';

export type CounterStatus = 'met' | 'missing' | 'manual';

export interface CounterCheck {
  /** 短标签，来自机制表的 counterTags */
  tag: string;
  status: CounterStatus;
  /** 一行说明：已满足时说明凭什么满足，未满足时说明缺什么 */
  detail: string;
}

/** 甜点区：同源相斥要求属性种类不多不少，正好 3 种 */
const COMP_SWEET_SPOT = 3;

type Evaluator = (team: readonly PetDef[]) => Omit<CounterCheck, 'tag'>;

const manual = (detail: string): Evaluator => () => ({ status: 'manual', detail });

const EVALUATORS: Readonly<Record<string, Evaluator>> = {
  多属性覆盖: (team) => {
    const n = elementCount(team);
    return n >= 3
      ? { status: 'met', detail: `编队覆盖 ${n} 种属性，够开阵盾` }
      : { status: 'missing', detail: `编队只有 ${n} 种属性，至少要 3 种` };
  },
  第二输出色: (team) => {
    const n = elementCount(team);
    return n >= 2
      ? { status: 'met', detail: `主色被封时还有 ${n - 1} 种备用输出` }
      : { status: 'missing', detail: '全队同色，主色被封就没伤害了' };
  },
  精简属性: (team) => {
    const n = elementCount(team);
    if (n === COMP_SWEET_SPOT) return { status: 'met', detail: '正好 3 种属性，落在甜点区' };
    return n > COMP_SWEET_SPOT
      ? { status: 'missing', detail: `${n} 种属性过杂，敌人攻击会提升` }
      : { status: 'missing', detail: `只有 ${n} 种属性，敌人会减伤` };
  },
  持续伤害: (team) => {
    const carriers = team.filter(hasDamageOverTime);
    return carriers.length > 0
      ? { status: 'met', detail: `${carriers[0].name}带持续伤害，能抹掉不灭留的 1 血` }
      : { status: 'missing', detail: '全队没有持续伤害，不灭那 1 血补不掉' };
  },
  铺连能力: manual('看操作：首消要铺够连数，天降的连不算'),
  '5 连消除': manual('看操作：单组消出 5 颗及以上才能穿透'),
};

/** 关卡机制要求的对策 × 当前编队 */
export function buildCounterChecklist(
  stage: StageDef,
  team: readonly PetDef[],
): readonly CounterCheck[] {
  const tags = resolveMechanics(stage.mechanics).counterTags;
  return tags.map((tag) => {
    const evaluate = EVALUATORS[tag];
    const result = evaluate
      ? evaluate(team)
      : { status: 'manual' as const, detail: '进关后按提示应对' };
    return { tag, ...result };
  });
}

/** 清单里还缺几项（0 = 编队已就绪；manual 项不计，它们不是编队能解的） */
export function countMissing(checks: readonly CounterCheck[]): number {
  return checks.filter((c) => c.status === 'missing').length;
}

function elementCount(team: readonly PetDef[]): number {
  return new Set(team.map((p) => p.element)).size;
}

function hasDamageOverTime(pet: PetDef): boolean {
  try {
    return getSkill(pet.skillId).effects.some((e) => e.kind === 'dot');
  } catch {
    return false;
  }
}
