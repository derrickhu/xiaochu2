import type { Element, OrbType } from '@/balance/combat';
import type { GateUnmet } from '@/balance/damageGates';
import type { EnemyDef } from '@/balance/enemies';
import type { PetDef } from '@/balance/pets';
import type { SkillDef, SkillVfxId } from '@/balance/skills';
import type { SkillResult } from './SkillEngine';

export type BattleState =
  | 'playerTurn'
  | 'resolving'
  | 'petAttack'
  | 'enemyTurn'
  | 'victory'
  | 'defeat';

export interface TeamPet {
  def: PetDef;
  level: number;
  star: number;
  skill: SkillDef;
  atk: number;
  /** 个体暴击率（仅作用于该宠自身的消珠出手与主动技） */
  critRate: number;
  /** 个体额外暴击伤害（叠加在 COMBAT.critBase 上） */
  critDamage: number;
  /** 主动技剩余冷却（0 = 就绪） */
  skillCdLeft: number;
}

/** 技能释放结果（场景据此播放演出） */
export type SkillCastResult = SkillResult & {
  type: SkillResult['action'];
  element?: Element;
  damage?: number;
  healed?: number;
  mult?: number;
  turns?: number;
  value?: number;
  to?: OrbType;
  count?: number;
  shape?: 'random' | 'row' | 'col' | 'cross';
  enemyDead?: boolean;
};

export interface EnemyUnit {
  def: EnemyDef;
  maxHp: number;
  hp: number;
  atk: number;
  def_: number;
  /** 出场攻击：Boss 阶段 atkMult 的基准，不随阶段改变 */
  baseAtk: number;
  /** 距离下次攻击的剩余回合 */
  attackCountdown: number;
  /** 当前攻击间隔（Boss 阶段可覆写 def.attackInterval） */
  attackInterval: number;
  /** 当前技能表（Boss 阶段可追加，故不直接读 def.skillIds） */
  skillIds: string[];
  /** 各技能剩余冷却（与 skillIds 一一对应） */
  skillCds: number[];
  /** 出招轮转指针：下次从这个下标起找就绪技能，保证整套技能轮得到 */
  skillRotation: number;
  /** 已进入的 Boss 阶段数：0 = 原始形态 */
  phaseIndex: number;
  /** 蓄力中（下个敌人回合打出 atk × mult 重击） */
  charging: { mult: number; skillId: string; releaseVfx: SkillVfxId } | null;
  /** 减伤状态：受到伤害 ×(1-reduction) */
  dmgReduction: { reduction: number; turnsLeft: number } | null;
}

/** 敌人回合行动结果（场景据此播放演出） */
export interface EnemyActResult {
  action:
    | 'idle'
    | 'attack'
    | 'charge'
    | 'chargedAttack'
    | 'heal'
    | 'shield'
    // ── 目标十三新增敌人技能行动 ──
    | 'sealOrbs'
    | 'poison'
    | 'timeSqueeze'
    | 'healBlock'
    | 'enrage'
    | 'skillSeal'
    | 'atkDebuff'
    | 'resolve'
    | 'elementAbsorb'
    | 'counterStrike'
    // ── 硬闸门（不满足条件伤害降为 1；克属封印是按颜色的整片封珠） ──
    | 'elementGate'
    | 'comboGate'
    | 'damageVoid'
    | 'undying'
    | 'counterSeal'
    /** Boss 跨血线转阶段（本回合只做变身，可携带切入技） */
    | 'phaseShift';
  damage: number;
  absorbed: number;
  heroDead: boolean;
  /** healSelf 的回复量 */
  healed: number;
  /** 技能名（新敌人技能演出用） */
  skillName?: string;
  /** sealOrbs：请求封印的珠数（场景落地到 BoardModel） */
  boardSealCount?: number;
  /** counterSeal：请求整片封印的珠色（场景落地到 BoardModel.sealByOrb） */
  sealedOrb?: Element;
  /** skillSeal：被封印主动技的宠物 index */
  sealedPetIndex?: number;
  /** poison=每回合伤害；timeSqueeze=秒数；healBlock=回复乘区；enrage=攻击乘区 */
  value?: number;
  /** 状态持续回合 */
  turns?: number;
  /** 敌人因眩晕跳过了本回合（表现层播「眩晕中」） */
  stunnedSkip?: boolean;
  /** phaseShift：新阶段标签（表现层播转阶段横幅） */
  phaseLabel?: string;
  /** elementAbsorb：被吸收属性的中文名（表现层提示玩家换色） */
  absorbElementName?: string;
  /** 回合结束 DoT 结算明细（owner = 承伤方，表现层播 tick 反馈） */
  dotTicks?: { owner: 'team' | 'enemy'; amount: number }[];
}

/** 一次宠物出手（已含本回合 Combo/克制/暴击） */
export interface PetAttack {
  petIndex: number;
  element: Element;
  damage: number;
  isCrit: boolean;
  /** 克制关系：1 克制 / -1 被克 / 0 无 */
  counter: 1 | 0 | -1;
  /** 锋锐无效：这一击超过阈值被归零（表现层播「无效」） */
  voided?: boolean;
  /** 锋锐无效：达到 5 连穿透并拿到额外增伤（表现层播「贯通」） */
  pierced?: boolean;
}

/** 一回合消除的结算结果 */
export interface TurnResolution {
  combo: number;
  comboMul: number;
  attacks: PetAttack[];
  heal: number;
  /** 本回合未满足的硬闸门（非空即整回合伤害被压到 1，表现层提示还差多少） */
  gateUnmet: readonly GateUnmet[];
}

export interface BattleResult {
  win: boolean;
  stars: number;
  coins: number;
  /** 掉落经验（升级燃料） */
  exp: number;
  /** 掉落碎片（升星材料） */
  shards: { petId: string; count: number }[];
  /** 掉落通用碎片（精英档起产出） */
  universal: number;
  turnsUsed: number;
  noDamage: boolean;
  /** 本场击败的章 Boss 高级怪直掉灵宠 id（胜利时解锁拥有） */
  bossDropPets: string[];
}
