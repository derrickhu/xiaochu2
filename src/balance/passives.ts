/**
 * 统一被动技能表（纯数据 + 蓝图工厂，零战斗逻辑）—— 与 skills.ts 同构
 *
 * 阶段十一：被动改为「按稀有度逐层解锁」的 role 统一阶梯（去除散落 legacy traits）：
 * - 每个 role 固定 3 层（L1 签名 / L2 SSR 解锁 / L3 UR 解锁），见 ROLE_PASSIVE_LADDER。
 * - 槽位阶梯 R1 / SR1 / SSR2 / UR3（passiveSlotsForRarity）：取前 N 层，新能力随稀有度解锁。
 * - 每层数值 = 蓝图基线 × RARITY_PASSIVE_POWER[rarity]：SR 仅数值变强，SSR/UR 再解锁新层。
 * - 由此「同 role 高稀有 = 低稀有层数超集 + 每层数值更大」天然成立，单调绝不倒挂，
 *   且玩家替换收益一望即知（清晰的成长 / 解锁 / 替换机制）。
 *
 * 只用「双模型都镜像」的效果（teamDamagePct / regenPct / startShieldPct / statBonus / teamAura），
 * 刻意不用 elementDamageBonus（仅 BattleController 生效、simulation 不镜像，会破坏双模型一致性）。
 *
 * 效果分两类落地：
 *   1) 常驻 stat 类（statBonus self|team / teamAura）：复用 PetTraitDef 与既有运行时钩子
 *      （growth.ts / team.ts / BattleController / SkillEngine），无需新逻辑。
 *   2) 触发/常驻数值类（开局护盾 / 每回合回血 / 全队增伤）：由 BattleController 与
 *      formulas/simulation.ts 的钩子消费（双模型镜像）。
 *
 * 策划调参：改 ROLE_PASSIVE_LADDER 的基线常数 + rarity.ts 的 RARITY_PASSIVE_POWER 两张表即可。
 *
 * 单一出口：宠物的最终被动一律经 pets.ts 的 petView → resolvePassiveForCreature() 计算，
 * 并通过 passiveForPet(pet) 读取，展示与战斗都不另算。
 */
import type { Element } from './combat';
import { PET_ROLE_NAME, STAT_UI, type PetRole, type PetTraitDef, type StatKey } from './petRoles';
import type { Rarity } from './rarity';
import { getRarityPassivePower } from './rarity';
import { ELEMENT_NAME } from './ui';

/** 被动触发时机（onLowHp 预留：先定义不启用） */
export type PassiveTrigger = 'always' | 'battleStart' | 'turnStart' | 'onLowHp';

/**
 * 解析后的被动（已按稀有度缩放、已聚合所有解锁层），作为展示与战斗的唯一来源。
 * - traits：常驻 stat 类（走既有钩子）
 * - 三个 *Pct：触发/常驻数值类（走新钩子），缺省 0
 * - lines：中文展示文案（含触发时机前缀），行数 = 已解锁槽位数
 */
export interface ResolvedPassive {
  id: string;
  name: string;
  /** 开局护盾（占队伍最大生命比例） */
  startShieldPct: number;
  /** 每回合回复（占队伍最大生命比例） */
  regenPct: number;
  /** 常驻全队增伤（所有出伤 ×(1+pct)） */
  teamDamagePct: number;
  /** 常驻 stat 类被动（复用既有 traits 钩子） */
  traits: readonly PetTraitDef[];
  /** 展示文案行（已解锁层各一行） */
  lines: readonly string[];
}

/**
 * 单层被动效果（只用双模型镜像的类型）：
 * - teamDamage / regen / startShield：触发/常驻数值类（走 *Pct 钩子）
 * - statSelf / statTeam：常驻 stat 类（statBonus 钩子）
 * - aura：阵容协同光环（teamAura 钩子）。requireRole/requireElement 指定有意义的阵容门槛，
 *   不填则退化为「队伍满 count 只」（在 5 人队下恒成立，应避免）。
 */
export type PassiveLayerEffect =
  | { kind: 'teamDamage'; base: number }
  | { kind: 'regen'; base: number }
  | { kind: 'startShield'; base: number }
  | { kind: 'statSelf'; stat: StatKey; base: number }
  | { kind: 'statTeam'; stat: StatKey; base: number }
  | {
      kind: 'aura';
      stat: StatKey;
      count: number;
      base: number;
      requireRole?: PetRole;
      requireElement?: Element;
    };

/** 阶梯单层：name 展示用，effect 为蓝图基线（实际值 × RARITY_PASSIVE_POWER[rarity]） */
export interface PassiveLayer {
  name: string;
  effect: PassiveLayerEffect;
}

/**
 * role 被动阶梯：每 role 固定 3 层（基线常数，策划首选调参位）。
 * - L1：R 起即有的签名被动
 * - L2：SSR 解锁的新能力
 * - L3：UR 解锁的新能力（原 LR 级，改由 UR 解锁，数值刻意保守）
 *
 * 全部使用双模型镜像效果；高层只追加新效果，不削弱低层，保证超集单调。
 */
export const ROLE_PASSIVE_LADDER: Readonly<Record<PetRole, readonly [PassiveLayer, PassiveLayer, PassiveLayer]>> = {
  // 输出：独占「全队增伤」(teamDamage)，全队唯一的伤害放大来源；不再用攻击%作第二货币。
  attacker: [
    { name: '战意', effect: { kind: 'teamDamage', base: 0.05 } },
    { name: '锐意', effect: { kind: 'teamDamage', base: 0.04 } },
    { name: '决死', effect: { kind: 'teamDamage', base: 0.04 } },
  ],
  // 治疗：独占「回复」(逐回合 regen + 全队回复% 心珠放大)。
  healer: [
    { name: '生生不息', effect: { kind: 'regen', base: 0.035 } },
    { name: '甘霖', effect: { kind: 'statTeam', stat: 'rcv', base: 0.10 } },
    { name: '普济', effect: { kind: 'regen', base: 0.025 } },
  ],
  // 坦克：独占「防御」(开局护盾 + 全队生命%)。
  tank: [
    { name: '磐石', effect: { kind: 'startShield', base: 0.12 } },
    { name: '厚壁', effect: { kind: 'statTeam', stat: 'hp', base: 0.08 } },
    { name: '不动', effect: { kind: 'startShield', base: 0.04 } },
  ],
  // 辅助：独占「阵容协同」——唯一带条件光环的角色，奖励"队中输出≥2"的进攻阵，只增续航不碰伤害。
  support: [
    { name: '庇佑', effect: { kind: 'aura', stat: 'hp', requireRole: 'attacker', count: 2, base: 0.06 } },
    { name: '协律', effect: { kind: 'aura', stat: 'rcv', requireRole: 'attacker', count: 2, base: 0.08 } },
    { name: '万众一心', effect: { kind: 'aura', stat: 'hp', requireRole: 'attacker', count: 2, base: 0.10 } },
  ],
};

/**
 * 稀有度 → 被动槽位数（已解锁层数）：R1 / SR1 / SSR2 / UR3。
 * 新能力分别在 SSR（L2）与 UR（L3）各解锁一次；SR 仅 L1 数值变强。
 */
export function passiveSlotsForRarity(rarity: Rarity): number {
  if (rarity <= 2) return 1;
  if (rarity === 3) return 2;
  return 3;
}

const toPct = (v: number): string => `${Math.round(v * 100)}%`;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** 单条 stat 类 trait → 中文被动描述（balance 层单一真源，展示层复用） */
export function describeTrait(t: PetTraitDef): string {
  switch (t.type) {
    case 'statBonus': {
      const scope = t.scope === 'team' ? '全队' : '自身';
      return `${scope}${STAT_UI[t.stat].longLabel} +${toPct(t.pct)}`;
    }
    case 'elementDamageBonus':
      return `对${ELEMENT_NAME[t.vs]}属性伤害 +${toPct(t.pct)}`;
    case 'skillModifier': {
      const parts: string[] = [];
      if (t.cdDelta) parts.push(`CD ${t.cdDelta > 0 ? '+' : ''}${t.cdDelta}`);
      if (t.effectPctBonus) parts.push(`技能效果 +${toPct(t.effectPctBonus)}`);
      if (t.convertCountBonus) parts.push(`转珠 +${t.convertCountBonus} 颗`);
      return `专属强化：${parts.join('，') || '—'}`;
    }
    case 'teamAura': {
      const cond = t.requireElement
        ? `队中${ELEMENT_NAME[t.requireElement]}属性`
        : t.requireRole
          ? `队中${PET_ROLE_NAME[t.requireRole]}`
          : '队伍';
      return `光环：${cond}满 ${t.count} 只时，全队${STAT_UI[t.stat].longLabel} +${toPct(t.pct)}`;
    }
    default:
      return '';
  }
}

/**
 * 计算一只生物的最终被动：role 阶梯取前 `slots` 层，每层 ×稀有度被动倍率后聚合。
 * 纯函数，供 pets.ts 在 petView 阶段调用。仅依赖 role + rarity（无专属覆盖入口）。
 */
export function resolvePassiveForCreature(role: PetRole, rarity: Rarity): ResolvedPassive {
  const ladder = ROLE_PASSIVE_LADDER[role] ?? ROLE_PASSIVE_LADDER.attacker;
  const slots = passiveSlotsForRarity(rarity);
  const rp = getRarityPassivePower(rarity);

  const res: ResolvedPassive = {
    id: `passive_${role}`,
    name: ladder[0].name,
    startShieldPct: 0,
    regenPct: 0,
    teamDamagePct: 0,
    traits: [],
    lines: [],
  };
  const traits: PetTraitDef[] = [];
  const lines: string[] = [];

  for (const layer of ladder.slice(0, slots)) {
    const e = layer.effect;
    const v = round3(e.base * rp);
    switch (e.kind) {
      case 'teamDamage':
        res.teamDamagePct = round3(res.teamDamagePct + v);
        lines.push(`常驻：全队伤害 +${toPct(v)}`);
        break;
      case 'regen':
        res.regenPct = round3(res.regenPct + v);
        lines.push(`每回合：回复全队最大生命 ${toPct(v)}`);
        break;
      case 'startShield':
        res.startShieldPct = round3(res.startShieldPct + v);
        lines.push(`开局：获得最大生命 ${toPct(v)} 的护盾`);
        break;
      case 'statSelf': {
        const t: PetTraitDef = { type: 'statBonus', stat: e.stat, pct: v, scope: 'self' };
        traits.push(t);
        lines.push(`常驻：${describeTrait(t)}`);
        break;
      }
      case 'statTeam': {
        const t: PetTraitDef = { type: 'statBonus', stat: e.stat, pct: v, scope: 'team' };
        traits.push(t);
        lines.push(`常驻：${describeTrait(t)}`);
        break;
      }
      case 'aura': {
        const t: PetTraitDef = {
          type: 'teamAura',
          count: e.count,
          stat: e.stat,
          pct: v,
          ...(e.requireRole ? { requireRole: e.requireRole } : {}),
          ...(e.requireElement ? { requireElement: e.requireElement } : {}),
        };
        traits.push(t);
        lines.push(describeTrait(t));
        break;
      }
    }
  }

  res.traits = traits;
  res.lines = lines;
  return res;
}
