// @size-exempt: 纯数据表，按五行 / 稀有度分段维护
/**
 * 量产生物名录（pet_031 ~ pet_100，共 70 只）—— 生产版 100 宠金字塔的扩容部分
 *
 * ## 目标金字塔
 * 五行各 20 只，档位对称：R6 / SR8 / SSR4 / UR2。合计 R30 / SR40 / SSR20 / UR10。
 * 手写核心 30 只见 `creatures.ts`；本表只补差额（R+21 / SR+36 / SSR+11 / UR+2）。
 *
 * ## 技能分层（为什么 R/SR 走矩阵而不是逐只手写）
 * - R / SR（57 只）：`blueprint × element` 矩阵。技能 id 由 matrixSkillId() 派生，
 *   数值取 `MATRIX_TUNING` 里按稀有度定的一档，`skills/petMatrix.ts` 批量生成 SkillDef。
 *   同一 element × rarity 内 blueprint 不重复（含 creatures.ts 已占用的档位），保证不撞车。
 * - SSR / UR（13 只）：招牌技逐只手写，见 `skills/signatures.ts`，走段式复合技（双效 / 三效）。
 *
 * ## 依赖约束
 * 本文件**禁止** import `./skills`（桶文件）或 `./creatures`，否则会形成
 * creatures → creatureRoster → skills → petMatrix → creatureRoster 循环。
 * 敌人技能常量只从叶子模块 `./skills/ids` 取。
 */
import type { Element } from './combat';
import type { PetRole } from './petRoles';
import { monsterPair, signatureSkillTraits, type CreatureDef } from './creatureTypes';
// 仅类型导入：enemies.ts 反向依赖 creatures.ts，引入运行时值会成环（同 creatureTypes.ts）
import type { EnemyPhaseDef } from './enemies';
import { ENEMY_SKILL_IDS } from './skills/ids';

/** 矩阵可用的蓝图档（对应 skills/blueprints.ts 的工厂） */
export type MatrixBlueprint =
  | 'nuke'
  | 'multiHit'
  | 'dot'
  | 'teamNuke'
  | 'heal'
  | 'shield'
  | 'convert'
  | 'defenseBreak'
  | 'stun'
  | 'delayAttack'
  | 'gravity'
  | 'damageBuff'
  | 'elementBuff'
  | 'extraTime';

/** 矩阵行：R(1) / SR(2) 量产宠，一行同时定义宠物与其独占技 */
export interface MatrixRosterRow {
  id: string;
  name: string;
  element: Element;
  rarity: 1 | 2;
  role: PetRole;
  /** monsterPair rank：怪物面基值档（R7 / SR12 为基线，章节 Boss 另行上调） */
  rank: number;
  blueprint: MatrixBlueprint;
  /** 技能中文名 */
  skillName: string;
  /** 技能文案前缀 */
  flavor: string;
}

/** 招牌行：SSR(3) / UR(4) 量产宠，技能在 skills/signatures.ts 手写 */
export interface SignatureRosterRow {
  id: string;
  name: string;
  element: Element;
  rarity: 3 | 4;
  role: PetRole;
  rank: number;
  skillId: string;
  /**
   * 章节 Boss 专用怪物面覆写：第 9~16 章的首教机制靠 Boss 本体的技能承载，
   * 通用 monsterSkills() 只会派通用三件套（减伤/蓄力/自疗），
   * 不覆写的话「本章首教属性吸收」就只是提示文案，实战里根本不会出现。
   */
  bossMonster?: {
    rank?: number;
    t1Skills?: readonly string[];
    t2Skills?: readonly string[];
    t2Phases?: readonly EnemyPhaseDef[];
  };
}

const E = ENEMY_SKILL_IDS;

/** 矩阵技能 id：`pet_{element}_{blueprint}_{r|sr}`，与手写技 id 天然不撞 */
export function matrixSkillId(row: Pick<MatrixRosterRow, 'element' | 'blueprint' | 'rarity'>): string {
  const snake = row.blueprint.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  return `pet_${row.element}_${snake}_${row.rarity === 1 ? 'r' : 'sr'}`;
}

export const MATRIX_ROSTER: readonly MatrixRosterRow[] = [
  // ══════════════════════ 金 ══════════════════════
  // R 5 只（creatures.ts 已占 defenseBreak）
  { id: 'pet_031', name: '白刃苍狼', element: 'metal', rarity: 1, role: 'attacker', rank: 7, blueprint: 'nuke', skillName: '白刃斩', flavor: '扑身撕出一道白刃' },
  { id: 'pet_032', name: '铜铃药童', element: 'metal', rarity: 1, role: 'healer', rank: 7, blueprint: 'heal', skillName: '铜铃清音', flavor: '摇响铜铃安抚伤势' },
  { id: 'pet_033', name: '铁鳞穿山甲', element: 'metal', rarity: 1, role: 'tank', rank: 7, blueprint: 'shield', skillName: '铁鳞铠', flavor: '鳞甲层层立起' },
  { id: 'pet_034', name: '砂金灵鼠', element: 'metal', rarity: 1, role: 'support', rank: 7, blueprint: 'convert', skillName: '砂金流转', flavor: '砂金自爪间倾泻' },
  { id: 'pet_035', name: '针羽金雀', element: 'metal', rarity: 1, role: 'attacker', rank: 7, blueprint: 'multiHit', skillName: '针羽连射', flavor: '振翅激出针羽' },
  // SR 7 只（creatures.ts 已占 convert）
  { id: 'pet_036', name: '鸣金战鹤', element: 'metal', rarity: 2, role: 'attacker', rank: 12, blueprint: 'teamNuke', skillName: '鸣金合击', flavor: '长鸣一声号令全队' },
  { id: 'pet_037', name: '锈蚀甲虫', element: 'metal', rarity: 2, role: 'attacker', rank: 12, blueprint: 'dot', skillName: '锈蚀侵骨', flavor: '喷出锈雾附骨' },
  { id: 'pet_038', name: '玄铁武僧', element: 'metal', rarity: 2, role: 'tank', rank: 12, blueprint: 'shield', skillName: '玄铁法印', flavor: '结印聚玄铁之壁' },
  { id: 'pet_039', name: '镇魔金刚', element: 'metal', rarity: 2, role: 'tank', rank: 12, blueprint: 'delayAttack', skillName: '镇魔慑影', flavor: '怒目一喝震慑来敌' },
  { id: 'pet_040', name: '白玉灵猫', element: 'metal', rarity: 2, role: 'healer', rank: 12, blueprint: 'heal', skillName: '白玉抚息', flavor: '玉光流转抚平伤口' },
  { id: 'pet_041', name: '沙漏铜鹤', element: 'metal', rarity: 2, role: 'healer', rank: 12, blueprint: 'extraTime', skillName: '沙漏凝时', flavor: '倒转沙漏拖住流光' },
  { id: 'pet_042', name: '锁魂铃蛇', element: 'metal', rarity: 2, role: 'support', rank: 12, blueprint: 'stun', skillName: '锁魂鸣铃', flavor: '铃音直摄神魂' },

  // ══════════════════════ 木 ══════════════════════
  // R 4 只（creatures.ts 已占 multiHit / heal）
  { id: 'pet_045', name: '藤鞭灵猿', element: 'wood', rarity: 1, role: 'attacker', rank: 7, blueprint: 'nuke', skillName: '藤鞭裂空', flavor: '甩出长藤破空' },
  { id: 'pet_046', name: '毒蕊木蜂', element: 'wood', rarity: 1, role: 'attacker', rank: 7, blueprint: 'dot', skillName: '毒蕊散', flavor: '洒开毒蕊花粉' },
  { id: 'pet_047', name: '苔甲陆龟', element: 'wood', rarity: 1, role: 'tank', rank: 7, blueprint: 'shield', skillName: '苔甲结界', flavor: '苔甲吸饱灵气' },
  { id: 'pet_048', name: '春信画眉', element: 'wood', rarity: 1, role: 'support', rank: 7, blueprint: 'convert', skillName: '春信化叶', flavor: '啼声唤来新叶' },
  // SR 6 只（creatures.ts 已占 heal / convert）
  { id: 'pet_049', name: '万木战象', element: 'wood', rarity: 2, role: 'attacker', rank: 12, blueprint: 'teamNuke', skillName: '万木齐征', flavor: '踏地引万木同鸣' },
  { id: 'pet_050', name: '千年古槐', element: 'wood', rarity: 2, role: 'attacker', rank: 12, blueprint: 'gravity', skillName: '千年重压', flavor: '垂下千年枝影' },
  { id: 'pet_051', name: '铁木蟾将', element: 'wood', rarity: 2, role: 'tank', rank: 12, blueprint: 'shield', skillName: '铁木护壁', flavor: '鼓腹撑起铁木' },
  { id: 'pet_052', name: '荆棘魔藤', element: 'wood', rarity: 2, role: 'tank', rank: 12, blueprint: 'delayAttack', skillName: '荆棘缠缚', flavor: '荆棘自地底缠上' },
  { id: 'pet_053', name: '春雷灵猴', element: 'wood', rarity: 2, role: 'support', rank: 12, blueprint: 'damageBuff', skillName: '春雷激鸣', flavor: '击响春雷催动战意' },
  { id: 'pet_054', name: '碧霄凤蝶', element: 'wood', rarity: 2, role: 'support', rank: 12, blueprint: 'elementBuff', skillName: '碧霄共振', flavor: '鳞粉与木灵共振' },

  // ══════════════════════ 水 ══════════════════════
  // R 4 只（creatures.ts 已占 stun / shield）
  { id: 'pet_059', name: '逐浪旗鱼', element: 'water', rarity: 1, role: 'attacker', rank: 7, blueprint: 'nuke', skillName: '逐浪穿波', flavor: '破浪直取' },
  { id: 'pet_060', name: '碎冰白鲨', element: 'water', rarity: 1, role: 'attacker', rank: 7, blueprint: 'multiHit', skillName: '碎冰连咬', flavor: '碎冰间连咬不休' },
  { id: 'pet_061', name: '温泉水獭', element: 'water', rarity: 1, role: 'healer', rank: 7, blueprint: 'heal', skillName: '温泉抚愈', flavor: '引温泉浸润伤处' },
  { id: 'pet_062', name: '涟漪灵螺', element: 'water', rarity: 1, role: 'support', rank: 7, blueprint: 'convert', skillName: '涟漪化澜', flavor: '螺声荡开涟漪' },
  // SR 7 只（creatures.ts 已占 shield）
  { id: 'pet_063', name: '潮涌鲸卫', element: 'water', rarity: 2, role: 'attacker', rank: 12, blueprint: 'teamNuke', skillName: '潮涌合鸣', flavor: '低鸣唤起潮涌' },
  { id: 'pet_064', name: '幽蓝水蛭', element: 'water', rarity: 2, role: 'attacker', rank: 12, blueprint: 'dot', skillName: '幽蓝蚀血', flavor: '幽蓝黏液渗入伤口' },
  { id: 'pet_065', name: '深海铁蟹', element: 'water', rarity: 2, role: 'tank', rank: 12, blueprint: 'delayAttack', skillName: '深海慑潮', flavor: '巨钳一开压住水流' },
  { id: 'pet_066', name: '冰棱海马', element: 'water', rarity: 2, role: 'tank', rank: 12, blueprint: 'stun', skillName: '冰棱锁潮', flavor: '冰棱自水面刺出' },
  { id: 'pet_067', name: '静渊灵龟', element: 'water', rarity: 2, role: 'healer', rank: 12, blueprint: 'extraTime', skillName: '静渊凝流', flavor: '深渊静水凝住时流' },
  { id: 'pet_068', name: '珊瑚仙姬', element: 'water', rarity: 2, role: 'healer', rank: 12, blueprint: 'heal', skillName: '珊瑚生息', flavor: '珊瑚吐出生息' },
  { id: 'pet_069', name: '沧澜灵鲤', element: 'water', rarity: 2, role: 'support', rank: 12, blueprint: 'elementBuff', skillName: '沧澜共鸣', flavor: '跃身引沧澜共鸣' },

  // ══════════════════════ 火 ══════════════════════
  // R 4 只（creatures.ts 已占 dot / nuke）
  { id: 'pet_072', name: '星火灵猿', element: 'fire', rarity: 1, role: 'attacker', rank: 7, blueprint: 'multiHit', skillName: '星火连爪', flavor: '爪尖迸出星火' },
  { id: 'pet_073', name: '暖阳灵兔', element: 'fire', rarity: 1, role: 'healer', rank: 7, blueprint: 'heal', skillName: '暖阳抚息', flavor: '揽来一缕暖阳' },
  { id: 'pet_074', name: '熔壳犀甲', element: 'fire', rarity: 1, role: 'tank', rank: 7, blueprint: 'shield', skillName: '熔壳护罩', flavor: '熔壳凝成护罩' },
  { id: 'pet_075', name: '灯焰灵狸', element: 'fire', rarity: 1, role: 'support', rank: 7, blueprint: 'convert', skillName: '灯焰引燃', flavor: '尾灯一摆引燃盘面' },
  // SR 8 只（fire SR 此前为空档）
  { id: 'pet_076', name: '烈焰狮鹫', element: 'fire', rarity: 2, role: 'attacker', rank: 12, blueprint: 'teamNuke', skillName: '烈焰齐袭', flavor: '振翅带起烈焰' },
  { id: 'pet_077', name: '陨火巨蜥', element: 'fire', rarity: 2, role: 'attacker', rank: 12, blueprint: 'gravity', skillName: '陨火压顶', flavor: '引陨火当头压下' },
  { id: 'pet_078', name: '硫磺火蝎', element: 'fire', rarity: 2, role: 'attacker', rank: 12, blueprint: 'dot', skillName: '硫磺焚肌', flavor: '尾针注入硫磺' },
  { id: 'pet_079', name: '赤铜战牛', element: 'fire', rarity: 2, role: 'tank', rank: 12, blueprint: 'shield', skillName: '赤铜火壁', flavor: '赤铜角犁出火壁' },
  { id: 'pet_080', name: '焰纹镇兽', element: 'fire', rarity: 2, role: 'tank', rank: 12, blueprint: 'delayAttack', skillName: '焰纹威慑', flavor: '焰纹亮起逼退来敌' },
  { id: 'pet_081', name: '朱雀火雏', element: 'fire', rarity: 2, role: 'healer', rank: 12, blueprint: 'heal', skillName: '朱雀涅火', flavor: '涅火重燃生机' },
  { id: 'pet_082', name: '长明烛蛾', element: 'fire', rarity: 2, role: 'healer', rank: 12, blueprint: 'extraTime', skillName: '长明续时', flavor: '长明不熄拖住时光' },
  { id: 'pet_083', name: '战鼓火猿', element: 'fire', rarity: 2, role: 'support', rank: 12, blueprint: 'damageBuff', skillName: '战鼓催征', flavor: '擂动战鼓催征' },

  // ══════════════════════ 土 ══════════════════════
  // R 4 只（creatures.ts 已占 convert / shield）
  { id: 'pet_087', name: '崩岩巨貘', element: 'earth', rarity: 1, role: 'attacker', rank: 7, blueprint: 'nuke', skillName: '崩岩撞', flavor: '低头撞开山岩' },
  { id: 'pet_088', name: '碎石鼠群', element: 'earth', rarity: 1, role: 'attacker', rank: 7, blueprint: 'multiHit', skillName: '碎石连击', flavor: '群鼠踏碎石阵' },
  { id: 'pet_089', name: '沃土灵鼹', element: 'earth', rarity: 1, role: 'healer', rank: 7, blueprint: 'heal', skillName: '沃土滋养', flavor: '掘出沃土滋养同伴' },
  { id: 'pet_090', name: '钻地穿甲虫', element: 'earth', rarity: 1, role: 'support', rank: 7, blueprint: 'defenseBreak', skillName: '穿甲钻击', flavor: '钻头旋开硬甲' },
  // SR 8 只（earth SR 此前为空档）
  { id: 'pet_091', name: '岩枪巨犀', element: 'earth', rarity: 2, role: 'attacker', rank: 12, blueprint: 'nuke', skillName: '岩枪贯地', flavor: '独角化枪贯地而出' },
  { id: 'pet_092', name: '砾刃螳螂', element: 'earth', rarity: 2, role: 'attacker', rank: 12, blueprint: 'multiHit', skillName: '砾刃乱舞', flavor: '砾石镰刃乱舞' },
  { id: 'pet_093', name: '沙毒土蝮', element: 'earth', rarity: 2, role: 'attacker', rank: 12, blueprint: 'dot', skillName: '沙毒蚀身', flavor: '毒沙钻进甲缝' },
  { id: 'pet_094', name: '战地土狼王', element: 'earth', rarity: 2, role: 'attacker', rank: 12, blueprint: 'teamNuke', skillName: '群狼共袭', flavor: '长嗥召来群狼' },
  { id: 'pet_095', name: '镇岳石像', element: 'earth', rarity: 2, role: 'attacker', rank: 12, blueprint: 'gravity', skillName: '镇岳压世', flavor: '抬手压下岳影' },
  { id: 'pet_096', name: '图腾土灵', element: 'earth', rarity: 2, role: 'support', rank: 12, blueprint: 'damageBuff', skillName: '图腾激昂', flavor: '图腾亮起激昂战意' },
  { id: 'pet_097', name: '黄泉玉蟾', element: 'earth', rarity: 2, role: 'support', rank: 12, blueprint: 'elementBuff', skillName: '黄泉共鸣', flavor: '蟾鸣引黄泉共振' },
  { id: 'pet_098', name: '息壤灵狐', element: 'earth', rarity: 2, role: 'healer', rank: 12, blueprint: 'heal', skillName: '息壤回春', flavor: '息壤生生不息' },
];

export const SIGNATURE_ROSTER: readonly SignatureRosterRow[] = [
  // ── 金 SSR 2 ──
  { id: 'pet_043', name: '破军金狮', element: 'metal', rarity: 3, role: 'attacker', rank: 17, skillId: 'pet_sig_metal_ruin' },
  {
    id: 'pet_044', name: '山岳金像', element: 'metal', rarity: 3, role: 'tank', rank: 17,
    skillId: 'pet_sig_metal_bastion',
    // 第 9 章 highAttack：压力来自铺垫怪的高攻快攻，Boss 本体保持坚壁 + 蓄力的经典手感
    bossMonster: { rank: 12, t1Skills: [E.golemGuard], t2Skills: [E.golemGuardHeavy, E.bladeCharge, E.pandaHeal] },
  },
  // ── 木 SSR 3 + UR 1 ──
  {
    id: 'pet_055', name: '苍虬木龙', element: 'wood', rarity: 3, role: 'attacker', rank: 17,
    skillId: 'pet_sig_wood_lance',
    /*
     * 第 16 章 finalTrial：终章复合，两段血线各解锁一种前面章节学过的机制
     * （属性吸收 → 免控），而不是靠 atkMult 堆爆发。
     * 攻击倍率刻意留白：一击秒杀在第 7/8 章调参时已被证明是「抛硬币」体验，
     * 终章的难度应当来自「你会不会换色、会不会放弃控制链」。
     */
    bossMonster: {
      rank: 16,
      t1Skills: [E.lionCharge],
      t2Skills: [E.skillSeal, E.timeSqueezeHeavy],
      t2Phases: [
        { hpThreshold: 0.65, label: '吞灵', addSkillIds: [E.elementAbsorb] },
        { hpThreshold: 0.3, label: '不动', addSkillIds: [E.resolve], atkMult: 1.25 },
      ],
    },
  },
  {
    id: 'pet_056', name: '九叶灵芝仙', element: 'wood', rarity: 3, role: 'support', rank: 17,
    skillId: 'pet_sig_wood_bloom',
    // 第 10 章 phaseShift：首教「转形态」——半血换招、三成血提速，血条分段即预警
    bossMonster: {
      rank: 9,
      t1Skills: [E.pandaGuard],
      t2Skills: [E.pandaGuard, E.serpentHeal],
      t2Phases: [
        { hpThreshold: 0.55, label: '灵华绽放', addSkillIds: [E.poisonTeam] },
        { hpThreshold: 0.25, label: '九叶归元', attackInterval: 1 },
      ],
    },
  },
  { id: 'pet_057', name: '万岁神榕', element: 'wood', rarity: 3, role: 'tank', rank: 17, skillId: 'pet_sig_wood_aegis' },
  { id: 'pet_058', name: '建木神鸾', element: 'wood', rarity: 4, role: 'support', rank: 21, skillId: 'pet_sig_wood_worldtree' },
  // ── 水 SSR 2 ──
  {
    id: 'pet_070', name: '沧溟蛟王', element: 'water', rarity: 3, role: 'attacker', rank: 17,
    skillId: 'pet_sig_water_maelstrom',
    // 第 11 章 elementAbsorb：吸克制色，逼玩家备第二输出色（自疗加长拉锯，放大换色代价）
    bossMonster: { rank: 11, t1Skills: [E.bladeCharge], t2Skills: [E.elementAbsorb, E.serpentHealHeavy, E.bladeCharge] },
  },
  {
    id: 'pet_071', name: '玄冥龟甲兽', element: 'water', rarity: 3, role: 'tank', rank: 17,
    skillId: 'pet_sig_water_bulwark',
    // 第 15 章 lockedColumn：开局锁列（关卡机制）+ 战中重封珠，盘面空间是全程稀缺资源
    bossMonster: { rank: 15, t1Skills: [E.golemGuard], t2Skills: [E.sealOrbsHeavy, E.golemGuardHeavy, E.pandaHeal] },
  },
  // ── 火 SSR 3 ──
  {
    id: 'pet_084', name: '赤霄凤将', element: 'fire', rarity: 3, role: 'support', rank: 17,
    skillId: 'pet_sig_fire_warhymn',
    // 第 14 章 resolveTank：凝意期间免控，控制链失效，只能靠破防与爆发硬拆
    /*
     * 减伤取常规档而非 Heavy：这一关的 archetype 是 fortress（免控 + 硬壳），
     * 设计上的解法是破防与重力。而 golemGuardHeavy 的减伤是乘区，破防对它完全无效，
     * 于是「研究对位」换来的收益被压到 26%——护栏判定为「换队没有意义」。
     * 把墙的主体交还给 DEF，破防才真的是这一关的钥匙。
     */
    bossMonster: { rank: 12, t1Skills: [E.pandaGuard], t2Skills: [E.resolve, E.golemGuard, E.lionCharge] },
  },
  { id: 'pet_085', name: '流火天狐', element: 'fire', rarity: 3, role: 'support', rank: 17, skillId: 'pet_sig_fire_emberflow' },
  {
    id: 'pet_086', name: '熔岩巨魔', element: 'fire', rarity: 3, role: 'tank', rank: 17,
    skillId: 'pet_sig_fire_magmaward',
    // 第 12 章 counterStrike：出手越多反伤越重，逼「少而重」的精准输出
    bossMonster: { rank: 11, t1Skills: [E.golemGuard], t2Skills: [E.counterStrike, E.golemGuard, E.poisonTeamHeavy] },
  },
  // ── 土 SSR 1 + UR 1 ──
  {
    id: 'pet_099', name: '破岳金刚象', element: 'earth', rarity: 3, role: 'attacker', rank: 17,
    skillId: 'pet_sig_earth_quake',
    /*
     * 第 13 章 attackDown：削攻 + 禁疗双压，净化位第一次成为硬需求。
     * 禁疗取常规档而非 Heavy——本关的闸门怪（克属封印蟾）自带一层禁疗，
     * 两层重档叠在一起就成了「进场即不可回血」，达标队会直接被耗死，
     * 那不是「需要净化位」，是没有解法。
     */
    bossMonster: { rank: 14, t1Skills: [E.lionCharge], t2Skills: [E.atkDebuffHeavy, E.healBlock, E.lionCharge] },
  },
  { id: 'pet_100', name: '后土神麒', element: 'earth', rarity: 4, role: 'support', rank: 21, skillId: 'pet_sig_earth_genesis' },
];

/**
 * 怪物面技能：按 archetype 取专属技能组。
 *
 * v0.7 重做。旧版按 role 机械映射到 golemGuard / serpentHeal / pandaGuard，结果是
 * 「防高型」「回复型」「血厚型」在机制上全是同两个技能换皮——golemGuard 一招就占了
 * 128 关中的 64 关。玩家用同一套打法能通吃，自然不需要换阵容。
 *
 * 新版四组技能对应 difficultyBudget.ARCHETYPES，每组要求玩家做一件**其他组不需要**的事：
 * - 防高型 fortress（坦克面）：减伤 + 凝意免控 → 必须破防/克制，控制流直接失效
 * - 回复型 regen（治疗面）：自愈 + 吸主色 + 禁疗 → 必须备第二输出色并攒爆发窗口
 * - 血厚型 bulwark（辅助面）：锋锐无效 + 不灭 + 毒 → 堆单发高伤反被无效，只能多段与补刀
 * - 伤害型 burst（输出面）：蓄力 + 狂暴 → 必须在预警回合内减伤/护盾/打断
 *
 * 金/水系蓄力用「蓄势斩」、其余用「烈焰蓄势」，保留原有的属性风味。
 */
function monsterSkills(element: Element, role: PetRole, rarity: number): {
  t1?: readonly string[];
  t2: readonly string[];
} {
  const charge = element === 'metal' || element === 'water' ? E.bladeCharge : E.lionCharge;

  /** [主技, 次技, 终技] —— 三档稀有度依次解锁 */
  const group: readonly [string, string, string] = role === 'tank'
    ? [E.golemGuard, E.resolve, E.atkDebuff]
    : role === 'healer'
      ? [E.serpentHeal, E.elementAbsorb, E.healBlock]
      : role === 'support'
        ? [E.damageVoid, E.undying, E.poisonTeam]
        : [charge, E.enrage, E.skillSeal];

  const [primary, secondary, tertiary] = group;

  /*
   * 初级形态一律带上主技（v0.7）。
   *
   * 旧版只有 SSR/UR 的初级形态有技能，而前八章的铺垫关几乎全用 R/SR 初级形态，
   * 于是 128 关里有 22 关是「纯数值关」——敌人只会平A，玩家只要总攻够高就能秒推，
   * 关卡之间没有任何可辨识的差别。让每只杂兵都至少会一招，机制密度就不必再去挤
   * 每章只有 2 个名额的闸门预算，而闸门可以专心承担「必须换阵容」的重活。
   */
  if (rarity === 1) return { t1: [primary], t2: [primary] };
  if (rarity === 2) return { t1: [primary], t2: [primary, secondary] };
  return {
    t1: [primary],
    t2: [primary, secondary, tertiary],
  };
}

function toCreature(row: {
  id: string; name: string; element: Element; rarity: 1 | 2 | 3 | 4;
  role: PetRole; rank: number; skillId: string;
  bossMonster?: SignatureRosterRow['bossMonster'];
}): CreatureDef {
  const skills = monsterSkills(row.element, row.role, row.rarity);
  const boss = row.bossMonster;
  return {
    id: row.id,
    name: row.name,
    element: row.element,
    rarity: row.rarity,
    role: row.role,
    skillId: row.skillId,
    skillTraits: signatureSkillTraits(row.element, row.rarity, row.skillId),
    monster: monsterPair(boss?.rank ?? row.rank, {
      t1Skills: boss?.t1Skills ?? skills.t1,
      t2Skills: boss?.t2Skills ?? skills.t2,
      t2Phases: boss?.t2Phases,
    }),
  };
}

/** 量产生物定义（供 creatures.ts 拼进 CREATURES，顺序按 id 升序） */
export const ROSTER_CREATURES: readonly CreatureDef[] = [
  ...MATRIX_ROSTER.map((row) => toCreature({ ...row, skillId: matrixSkillId(row) })),
  ...SIGNATURE_ROSTER.map((row) => toCreature(row)),
].sort((a, b) => a.id.localeCompare(b.id));

/**
 * 第 9~16 章 Boss 掉落宠（供 stages.ts 与契约测试共用一份真源）。
 *
 * 排布约束：
 * - 定位不连续重复，且续上第 1~8 章的 输出→治疗→坦克→辅助 轮替尾巴（第 8 章是输出）；
 * - 属性不连续重复，第 9~13 章五行各出一次；
 * - 只从量产名录取，不复用手写核心 30 只 —— 它们的名字散落在 bossChallenge.ts
 *   的旧提示文案里（例如「玄影天鹏（第4章收录）」），二次占用会让文案更难对齐。
 */
export const LATE_CHAPTER_BOSS_PETS: Readonly<Record<number, string>> = {
  9: 'pet_044',  // SSR 坦克 · 金
  10: 'pet_056', // SSR 辅助 · 木
  11: 'pet_070', // SSR 输出 · 水
  12: 'pet_086', // SSR 坦克 · 火
  13: 'pet_099', // SSR 输出 · 土
  14: 'pet_084', // SSR 辅助 · 火
  15: 'pet_071', // SSR 坦克 · 水
  16: 'pet_055', // SSR 输出 · 木（终章）
};
