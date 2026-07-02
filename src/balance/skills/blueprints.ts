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

/** 护盾：队伍最大生命 × pct 的吸收盾（可附带回复珠 / 威吓） */
export function makeShield(p: {
  id: string; name: string; shieldPct: number; cd: number; flavor?: string;
  /** 附带生成心珠（复合技） */
  extraConvert?: { to: OrbType; count: number };
  /** 附带威吓：敌人普攻推迟 N 回合（复合技） */
  delayAttack?: number;
}): SkillDef {
  const effects: SkillEffectDef[] = [
    { kind: 'shield', source: 'teamMaxHp', pct: p.shieldPct, stack: 'max' },
  ];
  let desc = `获得队伍最大生命 ${pct(p.shieldPct)} 的护盾`;
  if (p.extraConvert) {
    effects.push({ kind: 'convertOrbs', to: p.extraConvert.to, count: p.extraConvert.count });
    desc += `，并生成 ${p.extraConvert.count} 颗心珠`;
  }
  if (p.delayAttack) {
    effects.push({ kind: 'delayEnemyAttack', turns: p.delayAttack });
    desc += `，并威吓敌人推迟普攻 ${p.delayAttack} 回合`;
  }
  return {
    id: p.id, name: p.name, category: 'shield', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['护盾'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.shieldPct * 10 + (p.extraConvert?.count ?? 0) * 0.5 + (p.delayAttack ?? 0) * 3,
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

/** 转珠：随机 count 颗 / 整行 / 整列 / 十字 转为目标珠；from 指定时为定向转珠 */
export function makeConvert(p: {
  id: string; name: string; to: OrbType; count: number; cd: number;
  shape?: ConvertShape; from?: OrbType; flavor?: string;
}): SkillDef {
  const orbName = (o: OrbType): string => (o === 'heart' ? '心珠' : `${ELEMENT_NAME[o as Element]}珠`);
  const toName = orbName(p.to);
  const shape = p.shape ?? 'random';
  const where =
    shape === 'row' ? '一整行'
      : shape === 'col' ? '一整列'
        : shape === 'cross' ? '十字范围内'
          : p.from ? `随机 ${p.count} 颗${orbName(p.from)}` : `随机 ${p.count} 颗`;
  return {
    id: p.id, name: p.name, category: 'convert', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'board',
    tags: ['转珠', toName],
    desc: withFlavor(p.flavor, `将盘面${where}珠子转为${toName}`),
    effects: [{ kind: 'convertOrbs', to: p.to, count: p.count, shape, from: p.from }],
    basePower: shape === 'random' ? p.count : shape === 'cross' ? 10 : 6,
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

// ════════════ 目标十三新增蓝图（宠物侧机制型技能） ════════════

/** 重力：按敌人当前 HP 百分比造成伤害（打高血 Boss 神技，PAD「重力」；可附带直伤） */
export function makeGravity(p: {
  id: string; name: string; pct: number; cd: number; flavor?: string;
  damage?: { element: Element; multiplier: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'gravity', pct: p.pct }];
  let desc = `对敌人造成其当前生命 ${pct(p.pct)} 的伤害（无视防御）`;
  if (p.damage) {
    effects.push({
      kind: 'damage', source: 'casterAtk', multiplier: p.damage.multiplier,
      element: p.damage.element, applyDefense: true, applyDmgBuff: true,
      applyEnemyReduction: true,
    });
    desc += `，并追加自身攻击 ${pct(p.damage.multiplier)} 的${ELEMENT_NAME[p.damage.element]}伤害`;
  }
  return {
    id: p.id, name: p.name, category: 'gravity', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '重力'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.pct * 20 + (p.damage?.multiplier ?? 0),
  };
}

/** 连携：全队其他宠物技能 CD -amount（构筑核心，PAD「Haste」；可附带治疗） */
export function makeHaste(p: {
  id: string; name: string; amount: number; cd: number; flavor?: string;
  healPct?: number;
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'haste', amount: p.amount }];
  let desc = `全队其他宠物的技能冷却 -${p.amount} 回合`;
  if (p.healPct) {
    effects.push({ kind: 'heal', source: 'teamMaxHp', pct: p.healPct });
    desc += `，并回复最大生命 ${pct(p.healPct)}`;
  }
  return {
    id: p.id, name: p.name, category: 'haste', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['辅助', '连携'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.amount * 10 + (p.healPct ?? 0) * 10,
  };
}

/** 净化：解除棋盘封印珠 + 清除我方 debuff（对抗敌人扰盘/毒/禁疗） */
export function makePurify(p: {
  id: string; name: string; cd: number; flavor?: string;
  /** 附带治疗（可选） */
  healPct?: number;
}): SkillDef {
  const effects: SkillEffectDef[] = [
    { kind: 'purify', unsealBoard: true, cleanseTeam: true },
  ];
  let desc = '解除盘面全部封印珠，并清除我方中毒/时间压缩/禁疗/技能封印';
  if (p.healPct) {
    effects.push({ kind: 'heal', source: 'teamMaxHp', pct: p.healPct });
    desc += `，回复最大生命 ${pct(p.healPct)}`;
  }
  return {
    id: p.id, name: p.name, category: 'purify', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'board',
    tags: ['辅助', '净化'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: 15 + (p.healPct ?? 0) * 10,
  };
}

/** 加时：转珠时限 +seconds 秒，持续 turns 回合（对抗时间压缩；可附带治疗） */
export function makeExtraTime(p: {
  id: string; name: string; seconds: number; turns: number; cd: number; flavor?: string;
  healPct?: number;
}): SkillDef {
  const effects: SkillEffectDef[] = [
    { kind: 'extraDragTime', seconds: p.seconds, turns: p.turns },
  ];
  let desc = `${p.turns} 回合内转珠时间 +${p.seconds} 秒`;
  if (p.healPct) {
    effects.push({ kind: 'heal', source: 'teamMaxHp', pct: p.healPct });
    desc += `，并回复最大生命 ${pct(p.healPct)}`;
  }
  return {
    id: p.id, name: p.name, category: 'utility', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team',
    tags: ['辅助', '加时'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.seconds * p.turns + (p.healPct ?? 0) * 10,
  };
}

/** 净世斩：直伤 + 驱散我方 debuff（输出位的「解毒」答案，克制敌方剧毒/禁疗） */
export function makeCleanseNuke(p: {
  id: string; name: string; element: Element; multiplier: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'purify', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'enemy',
    tags: ['输出', '净化'],
    desc: withFlavor(
      p.flavor,
      `对敌人造成自身攻击 ${pct(p.multiplier)} 的${ELEMENT_NAME[p.element]}伤害，并清除我方中毒/禁疗等异常`,
    ),
    effects: [
      {
        kind: 'damage', source: 'casterAtk', multiplier: p.multiplier,
        element: p.element, applyDefense: true, applyDmgBuff: true, applyEnemyReduction: true,
      },
      { kind: 'purify', unsealBoard: false, cleanseTeam: true },
    ],
    basePower: p.multiplier + 8,
  };
}

/** 必暴击：turns 回合内全队消珠出手必定暴击 */
export function makeGuaranteedCrit(p: {
  id: string; name: string; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'buff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team', vfx: 'critBoost',
    tags: ['增伤', '暴击'],
    desc: withFlavor(p.flavor, `${p.turns} 回合内全队攻击必定暴击`),
    effects: [{ kind: 'guaranteedCrit', turns: p.turns }],
    basePower: p.turns * 8,
  };
}

/** 属性强化：turns 回合内指定属性伤害 ×mult */
export function makeElementBuff(p: {
  id: string; name: string; element: Element; mult: number; turns: number; cd: number; flavor?: string;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'buff', cd: p.cd,
    owner: 'pet', trigger: 'manual', target: 'team', vfx: 'elementBuff',
    tags: ['增伤', ELEMENT_NAME[p.element]],
    desc: withFlavor(p.flavor, `${p.turns} 回合内${ELEMENT_NAME[p.element]}属性伤害 ×${p.mult}`),
    effects: [{ kind: 'elementDamageBuff', element: p.element, mult: p.mult, turns: p.turns }],
    basePower: (p.mult - 1) * p.turns * 10,
  };
}

/** 威吓：敌人普攻倒计时 +turns（可附带直伤） */
export function makeDelayAttack(p: {
  id: string; name: string; turns: number; cd: number; flavor?: string;
  damage?: { element: Element; multiplier: number };
}): SkillDef {
  const effects: SkillEffectDef[] = [{ kind: 'delayEnemyAttack', turns: p.turns }];
  let desc = `威吓敌人，普攻推迟 ${p.turns} 回合`;
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
    owner: 'pet', trigger: 'manual', target: 'enemy', vfx: 'delayAttack',
    tags: ['控制', '威吓'],
    desc: withFlavor(p.flavor, desc),
    effects,
    basePower: p.turns * 8 + (p.damage?.multiplier ?? 0),
  };
}

// ════════════ 目标十三新增蓝图（敌人侧机制技能） ════════════

/** 敌人封珠：战斗中随机封印 count 颗珠 */
export function makeEnemySealOrbs(p: {
  id: string; name: string; count: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'board', vfx: 'enemySeal',
    tags: ['扰盘'],
    desc: `随机封印 ${p.count} 颗珠子（相邻消除可解封）`,
    effects: [{ kind: 'sealOrbs', count: p.count }],
    basePower: p.count,
  };
}

/** 敌人剧毒：对我方施加每回合 敌攻×multiplier 的持续伤害 */
export function makeEnemyPoison(p: {
  id: string; name: string; multiplier: number; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'team', vfx: 'enemyPoison',
    tags: ['剧毒'],
    desc: `使队伍中毒，${p.turns} 回合内每回合受到其攻击 ${pct(p.multiplier)} 的伤害`,
    effects: [{ kind: 'dot', source: 'enemyAtk', multiplier: p.multiplier, turns: p.turns }],
    basePower: p.multiplier * p.turns,
  };
}

/** 敌人时间压缩：转珠时限 -seconds 秒 */
export function makeEnemyTimeSqueeze(p: {
  id: string; name: string; seconds: number; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'team', vfx: 'enemySqueeze',
    tags: ['压缩'],
    desc: `${p.turns} 回合内转珠时间 -${p.seconds} 秒`,
    effects: [{ kind: 'timeSqueeze', seconds: p.seconds, turns: p.turns }],
    basePower: p.seconds * p.turns,
  };
}

/** 敌人禁疗：心珠回复 ×mult */
export function makeEnemyHealBlock(p: {
  id: string; name: string; mult: number; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'team', vfx: 'enemyHealBlock',
    tags: ['禁疗'],
    desc: `${p.turns} 回合内我方心珠回复降至 ${pct(p.mult)}`,
    effects: [{ kind: 'healBlock', mult: p.mult, turns: p.turns }],
    basePower: (1 - p.mult) * p.turns * 10,
  };
}

/** 敌人狂暴：HP 低于阈值时攻击永久提升（每场一次） */
export function makeEnemyEnrage(p: {
  id: string; name: string; atkMult: number; threshold: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'self', vfx: 'enemyEnrage',
    tags: ['狂暴'],
    desc: `生命低于 ${pct(p.threshold)} 时狂暴，攻击提升至 ${pct(p.atkMult)}`,
    effects: [{ kind: 'enrage', atkMult: p.atkMult, threshold: p.threshold }],
    basePower: (p.atkMult - 1) * 20,
  };
}

/** 敌人技能封印：随机封印一只宠物主动技 */
export function makeEnemySkillSeal(p: {
  id: string; name: string; turns: number; cd: number;
}): SkillDef {
  return {
    id: p.id, name: p.name, category: 'enemyDebuff', cd: p.cd,
    owner: 'enemy', trigger: 'enemyCooldown', target: 'team', vfx: 'enemySkillSeal',
    tags: ['封印'],
    desc: `随机封印我方一只宠物的主动技 ${p.turns} 回合`,
    effects: [{ kind: 'skillSeal', turns: p.turns }],
    basePower: p.turns * 6,
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
