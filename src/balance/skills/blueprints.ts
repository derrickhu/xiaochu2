import type { Element, OrbType } from '../combat';
import { ELEMENT_NAME } from '../ui';
import type {
  ConvertShape,
  DamageSource,
  SkillDef,
  SkillEffectDef,
  SkillVfxId,
} from './types';

const pct = (m: number): string => `${Math.round(m * 100)}%`;
const withFlavor = (flavor: string | undefined, body: string): string =>
  flavor ? `${flavor}，${body}` : body;

/** 单体直伤：自身攻击 × multiplier */
export function makeNuke(p: {
  id: string; name: string; element: Element; multiplier: number; cd: number;
  flavor?: string; vfx?: SkillVfxId;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'nuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy', vfx: p.vfx,
    tags: ['输出', '直伤'],
    desc: withFlavor(p.flavor, `对敌人造成自身攻击 ${pct(p.multiplier)} 的${ELEMENT_NAME[p.element]}属性伤害`),
    effects: [{
      kind: 'damage', source: 'casterAtk', multiplier: p.multiplier,
      applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true,
    }],
    basePower: p.multiplier,
  };
}

/** 全队齐射：队伍总攻 × multiplier */
export function makeTeamNuke(p: {
  id: string; name: string; multiplier: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'teamNuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '全队'],
    desc: withFlavor(p.flavor, `造成队伍总攻击 ${pct(p.multiplier)} 的伤害`),
    effects: [{
      kind: 'damage', source: 'teamAtk', multiplier: p.multiplier,
      applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true,
    }],
    basePower: p.multiplier,
  };
}

/** 队伍回复：队伍最大生命 × pct */
export function makeHeal(p: {
  id: string; name: string; healPct: number; cd: number; flavor?: string;
  extraConvert?: { to: OrbType; count: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'heal', source: 'teamMaxHp', pct: p.healPct }];
  let desc = `回复队伍最大生命的 ${pct(p.healPct)}`;
  if (p.extraConvert) {
    effects.push({ kind: 'convertOrbs', to: p.extraConvert.to, count: p.extraConvert.count });
    desc += `，并生成 ${p.extraConvert.count} 颗心珠`;
  }
  return {
    id: p.id, name: p.name, category: 'heal', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['治疗'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.healPct * 10,
  };
}

/** 护盾：队伍最大生命 × pct 的吸收盾 */
export function makeShield(p: {
  id: string; name: string; shieldPct: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'shield', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['护盾'],
    desc: withFlavor(p.flavor, `获得队伍最大生命 ${pct(p.shieldPct)} 的护盾`),
    effects: [{ kind: 'shield', source: 'teamMaxHp', pct: p.shieldPct, stack: 'max' }],
    basePower: p.shieldPct * 10,
  };
}

/** 全队增伤：turns 回合内伤害 × mult */
export function makeDamageBuff(p: {
  id: string; name: string; mult: number; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'buff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['增伤'],
    desc: withFlavor(p.flavor, `${p.turns} 回合内全队伤害 ×${p.mult}`),
    effects: [{
      kind: 'status', status: 'teamDamageBuff', mult: p.mult,
      turns: p.turns, stack: 'replace',
    }],
    basePower: (p.mult - 1) * p.turns * 10,
  };
}

/** 转珠：随机 count 颗 / 整行 / 整列 转为目标珠 */
export function makeConvert(p: {
  id: string; name: string; to: OrbType; count: number; cd: number;
  shape?: ConvertShape; flavor?: string;
}): SkillDef {
  const toName = p.to === 'heart' ? '心珠' : `${ELEMENT_NAME[p.to as Element]}珠`;
  const shape = p.shape ?? 'random';
  const where = shape === 'row' ? '一整行' : shape === 'col' ? '一整列' : `随机 ${p.count} 颗`;
  return {
    id: p.id, name: p.name, category: 'convert', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'board',
    tags: ['转珠', toName],
    desc: withFlavor(p.flavor, `将盘面${where}珠子转为${toName}`),
    effects: [{ kind: 'convertOrbs', to: p.to, count: p.count, shape }],
    basePower: shape === 'random' ? p.count : 6,
  };
}

/** 多段直伤：自身/队伍攻击 × multiplier，命中 hits 段 */
export function makeMultiHit(p: {
  id: string; name: string; element: Element; multiplier: number; hits: number; cd: number;
  source?: DamageSource; flavor?: string;
}): SkillDef {
  const source = p.source ?? 'casterAtk';
  return {
    id: p.id, name: p.name, category: 'multiNuke', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '多段'],
    desc: withFlavor(p.flavor, `对敌人造成 ${p.hits} 段、每段 ${pct(p.multiplier)} 的${ELEMENT_NAME[p.element]}属性伤害`),
    effects: [{
      kind: 'multiHit', source, multiplier: p.multiplier, hits: p.hits,
      element: p.element, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true,
    }],
    basePower: p.multiplier * p.hits,
  };
}

/** 持续伤害（点燃/中毒/流血）：turns 回合内每回合造成 来源 × multiplier */
export function makeDot(p: {
  id: string; name: string; element: Element; multiplier: number; turns: number; cd: number;
  source?: DamageSource; flavor?: string;
}): SkillDef {
  const source = p.source ?? 'casterAtk';
  return {
    id: p.id, name: p.name, category: 'dot', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '持续'],
    desc: withFlavor(p.flavor, `灼烧敌人，${p.turns} 回合内每回合造成 ${pct(p.multiplier)} 攻击的${ELEMENT_NAME[p.element]}伤害`),
    effects: [{ kind: 'dot', source, multiplier: p.multiplier, turns: p.turns, element: p.element }],
    basePower: p.multiplier * p.turns,
  };
}

/** 眩晕：turns 回合内敌人跳过行动 */
export function makeStun(p: {
  id: string; name: string; turns: number; cd: number; flavor?: string;
  /** 附带直伤（可选） */
  damage?: { element: Element; multiplier: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'stun', turns: p.turns }];
  let desc = `眩晕敌人 ${p.turns} 回合，使其无法行动`;
  if (p.damage) {
    effects.unshift({
      kind: 'damage', source: 'casterAtk', multiplier: p.damage.multiplier,
      element: p.damage.element, applyDefense: true, applyDmgBuff: true,
      applyEnemyReduction: true,
    });
    desc = `对敌人造成自身攻击 ${pct(p.damage.multiplier)} 的${ELEMENT_NAME[p.damage.element]}伤害，并${desc}`;
  }
  return {
    id: p.id, name: p.name, category: 'control', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['控制', '眩晕'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.turns * 10 + (p.damage?.multiplier ?? 0),
  };
}

/** 破防：turns 回合内降低敌人防御 pct */
export function makeDefenseBreak(p: {
  id: string; name: string; pct: number; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'debuff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['减益', '破防'],
    desc: withFlavor(p.flavor, `${p.turns} 回合内降低敌人 ${pct(p.pct)} 防御`),
    effects: [{ kind: 'defenseBreak', pct: p.pct, turns: p.turns }],
    basePower: p.pct * p.turns * 10,
  };
}

/** 敌人减伤 */
export function makeEnemyGuard(p: {
  id: string; name: string; reduction: number; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyGuard', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['减伤'],
    desc: `获得 ${pct(p.reduction)} 减伤，持续 ${p.turns} 回合`,
    effects: [{
      kind: 'status', status: 'enemyDamageReduction',
      reduction: p.reduction, turns: p.turns, stack: 'ignoreIfPresent',
    }],
    basePower: p.reduction * p.turns * 10,
  };
}

/** 敌人自疗 */
export function makeEnemyHeal(p: {
  id: string; name: string; healPct: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyHeal', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['自疗'],
    desc: `回复自身最大生命的 ${pct(p.healPct)}`,
    effects: [{ kind: 'heal', source: 'enemyMaxHp', pct: p.healPct, onlyIfDamaged: true }],
    basePower: p.healPct * 10,
  };
}

/** 敌人蓄力重击 */
export function makeEnemyCharge(p: {
  id: string; name: string; multiplier: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'charge', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self',
    tags: ['蓄力'],
    desc: `蓄力一回合，下回合造成攻击力 ${pct(p.multiplier)} 的重击`,
    effects: [{ kind: 'charge', multiplier: p.multiplier, releaseVfx: 'enemyAttack' }],
    basePower: p.multiplier,
  };
}
