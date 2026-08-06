/**
 * 章末 Boss「可玩挑战」 archetype — 遭遇配方 + 盘面/规则机制（非空标签）。
 *
 * 扩展约定：每章 Boss 只首教 1 种 kind；禁止主线章末叠加多机制（见 highAttack 留作第 9 章+）。
 */
import type { Element } from './combat';
import { type EncounterRef, resolveEncounter } from './enemies';
import { SKILL_MAP } from './skills';
import type { StageType } from './stageTypes';
import { defenseReduction } from '@/formulas/damage';
import { ELEMENT_NAME } from './ui';

export type BossChallengeKind =
  | 'multiWave'
  | 'boardSeal'
  | 'boardRock'
  | 'highDefense'
  | 'highAttack'
  | 'selfHeal'
  | 'chargeHit'
  | 'noHeart'
  | 'banElement'
  // ── 第 9~16 章：每章仍只首教 1 种 ──
  | 'phaseShift'
  | 'elementAbsorb'
  | 'counterStrike'
  | 'attackDown'
  | 'lockedColumn'
  | 'resolveTank'
  | 'finalTrial';

export const BOSS_CHALLENGE_LABEL: Readonly<Record<BossChallengeKind, string>> = {
  multiWave: '多波耐力',
  boardSeal: '封印珠',
  boardRock: '顽石封印',
  highDefense: '高防减伤',
  highAttack: '高攻快攻',
  selfHeal: '自疗拖战',
  chargeHit: '蓄力重击',
  noHeart: '禁心',
  banElement: '封属性',
  phaseShift: '形态转换',
  elementAbsorb: '属性吸收',
  counterStrike: '反击态',
  attackDown: '削攻',
  lockedColumn: '锁列',
  resolveTank: '免控坚壁',
  finalTrial: '终局试炼',
};

export function bossChallengeLabel(kind: BossChallengeKind): string {
  return BOSS_CHALLENGE_LABEL[kind];
}

export interface BossChallengeContext {
  /** banElement 时封禁的属性（生成 rule_ban_${element}） */
  ruleBanElement?: Element;
}

function banMechanics(element: Element): readonly string[] {
  return [`rule_ban_${element}`];
}

function banHint(element: Element): { tags: readonly string[]; text: string } {
  const name = ELEMENT_NAME[element];
  return {
    tags: [`封${name}`],
    text: `本关${name}珠失效：换属性输出`,
  };
}

const mob = (id: string): EncounterRef => ({ kind: 'mob', id });

export interface ChallengeRecipe {
  encounters: readonly EncounterRef[];
  mechanics?: readonly string[];
  hintTags?: readonly string[];
  hintText?: string;
}

/**
 * 同一种挑战的怪物组合变体。
 *
 * 一种挑战只对应一组固定怪，是「关卡重复」的直接来源：第 2 章 7 个铺垫关全部只能用
 * multiWave（boardSeal 要等本章 Boss 才首教），于是玩家连打 7 关看到的是同两只怪、
 * 只有血量在涨。变体让「已学挑战」这条约束不再等同于「同一份遭遇」。
 *
 * 各变体的重量必须彼此接近（见 challengeWeight）：TTK 难度带是按挑战种类给的，
 * 变体之间差太多就等于同一条护栏在量两件不同的东西。
 */
const ENCOUNTER_VARIANTS: Partial<Record<BossChallengeKind, readonly (readonly EncounterRef[])[]>> = {
  multiWave: [
    [mob('enemy_slime_wood'), mob('enemy_bat_fire')],
    [mob('enemy_moss_sprite_wood'), mob('enemy_cinder_imp_fire')],
    [mob('enemy_vine_slime_wood'), mob('enemy_bat_fire')],
    [mob('enemy_pebble_earth'), mob('enemy_bind_slime_wood')],
    [mob('enemy_pebble_earth'), mob('enemy_vine_slime_wood')],
  ],
  boardSeal: [
    [mob('enemy_scorpion_metal'), mob('enemy_moss_sprite_wood')],
    [mob('enemy_thorn_scorpion_metal'), mob('enemy_cinder_imp_fire')],
    [mob('enemy_sealward_toad_water'), mob('enemy_wither_bat_fire')],
  ],
  boardRock: [
    // 原配方（湿苔毒蟾 + 苔纹木灵）两只都是低防软怪，血量总量够精英档，实战却被 3 回合清掉。
    // 各变体一律配一只有防的怪，让「顽石挡路」这个机制有时间生效。
    [mob('enemy_toad_water'), mob('enemy_wither_bat_fire')],
    [mob('enemy_serpent_water'), mob('enemy_sealward_toad_water')],
    [mob('enemy_scorpion_metal'), mob('enemy_bind_slime_wood')],
  ],
  attackDown: [
    // 同理：枯翼魔蝠 ×2 只是两坨低防血量，补一只高防怪才配得上精英档
    [mob('enemy_wither_bat_fire'), mob('enemy_thorn_scorpion_metal')],
    [mob('enemy_wither_bat_fire'), mob('enemy_toad_water')],
  ],
  selfHeal: [
    [mob('enemy_moss_sprite_wood'), mob('enemy_serpent_water')],
    [mob('enemy_serpent_water'), mob('enemy_bind_slime_wood')],
  ],
  chargeHit: [
    [mob('enemy_cinder_imp_fire'), mob('enemy_scorpion_metal')],
    [mob('enemy_moss_sprite_wood'), mob('enemy_toad_water')],
  ],
  highDefense: [
    // 减伤怪只放一只：两只带 golemGuard 的怪同场，有效血量直接翻到 4800，
    // 中手要磨 21 回合——顶穿精英上限的从来不是血条，是叠起来的减伤
    [mob('enemy_pebble_earth'), mob('enemy_golem_earth')],
    [mob('enemy_golem_earth'), mob('enemy_moss_sprite_wood')],
  ],
  noHeart: [
    [mob('enemy_toad_water'), mob('enemy_cinder_imp_fire')],
    [mob('enemy_wither_bat_fire'), mob('enemy_bind_slime_wood')],
  ],
};

/**
 * 铺垫关 / 历练关：按已学挑战生成遭遇（无 bossDrop）。
 *
 * @param variant 怪物组合变体序号，按关卡下标传入即可（内部取模）。
 */
export function recipeForChallenge(kind: BossChallengeKind, variant = 0): ChallengeRecipe {
  const base = baseRecipeForChallenge(kind);
  const variants = ENCOUNTER_VARIANTS[kind];
  if (!variants || variants.length === 0) return base;
  return { ...base, encounters: variants[((variant % variants.length) + variants.length) % variants.length] };
}

function baseRecipeForChallenge(kind: BossChallengeKind): ChallengeRecipe {
  switch (kind) {
    case 'multiWave':
      return {
        encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')],
        hintTags: ['多波'],
        hintText: '多波敌人：注意保留血量与技能',
      };
    /*
     * 以下单怪档一律补一波轻兵（v0.7）。
     *
     * 单波铺垫关会被按锚点养成的中手 2~3 回合清掉，机制（封印珠、顽石、减伤）
     * 往往还没来得及生效战斗就结束了，玩家只看到「又一只血多点的怪」。
     * 补第二波同时对齐 powerBudget.BASE_WAVE_COUNT 的两波基准，
     * 让 TTK 带的口径和关卡的实际结构一致。
     */
    case 'boardSeal':
      return {
        encounters: [mob('enemy_scorpion_metal'), mob('enemy_scorpion_swarm_metal')],
        mechanics: ['orb_sealed'],
        hintTags: ['封印珠'],
        hintText: '消除相邻珠子来解封封印珠',
      };
    case 'boardRock':
      return {
        // 顽石封印考的是盘面处理，不必再叠一只减伤土怪：减伤专属于 highDefense 档，
        // 分开之后碎石傀儡的 golemGuard 也不会漫到全表四分之一以上的关卡
        encounters: [mob('enemy_toad_water'), mob('enemy_moss_sprite_wood')],
        mechanics: ['orb_rock'],
        hintTags: ['顽石封印'],
        hintText: '顽石封印更密：优先清理周边解封',
      };
    case 'highDefense':
      return {
        encounters: [mob('enemy_pebble_earth'), mob('enemy_golem_earth')],
        hintTags: ['高防减伤'],
        hintText: '傀儡高防且会减伤：克制 + 爆发破防',
      };
    case 'highAttack':
      return {
        encounters: [mob('enemy_bat_fire'), mob('enemy_cinder_imp_fire')],
        hintTags: ['高攻快攻'],
        hintText: '焰蝠攻击高：备好治疗或护盾',
      };
    case 'selfHeal':
      return {
        encounters: [mob('enemy_moss_sprite_wood'), mob('enemy_serpent_water')],
        hintTags: ['自疗'],
        hintText: '幼蛟会自愈：集中爆发抢血线',
      };
    case 'chargeHit':
      return {
        encounters: [mob('enemy_cinder_imp_fire'), mob('enemy_scorpion_metal')],
        hintTags: ['蓄力重击'],
        hintText: '铁壳毒蝎会蓄力重击：护盾/治疗扛住',
      };
    case 'noHeart':
      return {
        encounters: [mob('enemy_toad_water'), mob('enemy_cinder_imp_fire')],
        mechanics: ['rule_no_heal'],
        hintTags: ['禁心'],
        hintText: '本关禁心：心珠不回血，靠护盾与速杀',
      };
    case 'banElement': {
      const hint = banHint('metal');
      return {
        encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')],
        mechanics: banMechanics('metal'),
        hintTags: hint.tags,
        hintText: hint.text,
      };
    }
    case 'phaseShift':
      return {
        encounters: [mob('enemy_pebble_earth'), mob('enemy_crystal_warden_earth')],
        mechanics: ['enemy_phase'],
        hintTags: ['形态转换'],
        hintText: '幽晶魔像半血会转形态：留爆发应对新形态',
      };
    case 'elementAbsorb':
      return {
        encounters: [mob('enemy_moss_sprite_wood'), mob('enemy_devour_serpent_water')],
        mechanics: ['enemy_absorb'],
        hintTags: ['属性吸收'],
        hintText: '寒蛟会吸收克制它的属性：备好第二种输出色',
      };
    case 'counterStrike':
      return {
        encounters: [mob('enemy_scorpion_swarm_metal'), mob('enemy_thorn_scorpion_metal')],
        mechanics: ['enemy_counter'],
        hintTags: ['反击态'],
        hintText: '毒蝎反击态下出手越多反伤越重：少而重地打',
      };
    case 'attackDown':
      // 枯翼魔蝠单只太软（血量只有傀儡的一半），双波才够得上后期铺垫关的量级
      return {
        encounters: [mob('enemy_wither_bat_fire'), mob('enemy_wither_bat_fire')],
        mechanics: ['enemy_atk_down'],
        hintTags: ['削攻', '双波'],
        hintText: '魔蝠会削弱我方伤害：带净化技解除',
      };
    case 'lockedColumn':
      return {
        encounters: [mob('enemy_bind_slime_wood'), mob('enemy_bind_slime_wood')],
        mechanics: ['orb_locked_col'],
        hintTags: ['锁列', '双波'],
        hintText: '开局有一整列被锁：先从两侧消除拆封',
      };
    case 'resolveTank':
      return {
        encounters: [mob('enemy_pebble_earth'), mob('enemy_golem_bulwark_earth')],
        mechanics: ['enemy_resolve_guard'],
        hintTags: ['免控坚壁'],
        hintText: '磐岩傀儡凝意期间免疫控制：靠破防与爆发硬拆',
      };
    case 'finalTrial':
      return {
        encounters: [mob('enemy_crystal_warden_earth'), mob('enemy_devour_serpent_water')],
        mechanics: ['enemy_final_trial'],
        hintTags: ['终局试炼'],
        hintText: '终局试炼：转形态与属性吸收同场，克制/爆发/续航全要到位',
      };
  }
}

/**
 * 挑战配方的内容重量 = 各波敌人的**有效血量**之和（不含章节成长与关卡难度系数）。
 *
 * 只数 baseHp 会严重低估后期配方：高防怪按 def/(def+300) 吃掉一大截伤害，
 * 带 enemyGuard 的怪开减伤后输出直接腰斩。这两样都不改血条长度，却实打实
 * 决定要打多少回合——而 TTK 护栏量的正是回合数。
 */
export function challengeWeight(kind: BossChallengeKind): number {
  const variants = ENCOUNTER_VARIANTS[kind] ?? [baseRecipeForChallenge(kind).encounters];
  // 取各变体的均值：关卡类型是按挑战种类定的，不能因为某一变体偏轻偏重就摇摆
  const total = variants.reduce((acc, encounters) => acc + encounters.reduce((sum, ref) => {
    const { def } = resolveEncounter(ref);
    const afterDef = 1 - defenseReduction(def.baseDef);
    const reduction = (def.skillIds ?? [])
      .flatMap((id) => SKILL_MAP.get(id)?.effects ?? [])
      .reduce((max, e) => (
        e.kind === 'status' && e.status === 'enemyDamageReduction'
          ? Math.max(max, e.reduction ?? 0)
          : max
      ), 0);
    // 减伤只在技能开着的回合生效，按半程覆盖折算，避免把偶发减伤怪估成不可战胜
    const afterGuard = 1 - reduction / 2;
    return sum + def.baseHp / Math.max(0.1, afterDef * afterGuard);
  }, 0), 0);
  return total / variants.length;
}

/**
 * 精英档的重量门槛。按各配方有效血量的中位数附近取值，让「重配方 → 精英」大致对半分，
 * 避免某一章突然全是精英关（体力消耗与掉落档都会跟着跳）。
 */
const ELITE_WEIGHT_THRESHOLD = 2600;

/**
 * 铺垫关的类型由**配方的实际重量**决定，而不是关卡下标的奇偶。
 *
 * v0.8 修正。此前 `elite = index % 2 === 0`，于是同一份配方在 3 号位是普通关、
 * 在 4 号位就成了精英关——而 TTK 护栏是按关卡类型给难度带的（普通 3~8 回合、
 * 精英 4~10 回合）。两边对不上的直接后果是：重配方落进普通位会顶穿上限（中手要打
 * 10~12 回合），轻配方落进精英位又够不到下限（高手 3 回合就清）。护栏报的
 * 「磨人」与「秒推」其实是同一个错误的两面。
 */
export function challengeStageType(kind: BossChallengeKind): StageType {
  return challengeWeight(kind) >= ELITE_WEIGHT_THRESHOLD ? 'elite' : 'normal';
}

/** Boss 关：prepMob + 可选 mechanics（收录三波由 buildChapterCaptureBoss 负责） */
export interface BossChallengeConfig {
  prepMob: string;
  mechanics?: readonly string[];
  hintTags?: readonly string[];
  hintText?: string;
}

export function bossChallengeConfig(
  kind: BossChallengeKind,
  ctx?: BossChallengeContext,
): BossChallengeConfig {
  switch (kind) {
    case 'multiWave':
      return {
        prepMob: 'enemy_bamboo_tyrant_wood',
        hintTags: ['首领', '多波', '收录'],
        hintText: '三波试炼：击败魔将后迎战星辉灵鹿高级形态即可收录',
      };
    case 'boardSeal':
      return {
        prepMob: 'enemy_crystal_boss_earth',
        mechanics: ['orb_sealed'],
        hintTags: ['首领', '封印珠', '收录'],
        hintText: '封印珠干扰盘面，击败灵鹿医者高级形态即可收录',
      };
    case 'highDefense':
      return {
        prepMob: 'enemy_crystal_boss_earth',
        hintTags: ['首领', '高防减伤', '收录'],
        hintText: '幽晶巨像高防减伤：克制 + 爆发，击败深渊水母高级形态收录',
      };
    case 'boardRock':
      return {
        prepMob: 'enemy_golem_earth',
        mechanics: ['orb_rock', 'enemy_seal_cast'],
        hintTags: ['首领', '顽石封印', '战中封珠', '收录'],
        hintText: 'Boss 战中会封印珠子：推荐带归墟玄龟（第3章收录）护盾扛压，击败玄影天鹏高级形态收录其净化技',
      };
    case 'selfHeal':
      return {
        prepMob: 'enemy_serpent_water',
        mechanics: ['enemy_poison'],
        hintTags: ['首领', '剧毒', '收录'],
        hintText: 'Boss 会下毒持续掉血：推荐带玄影天鹏（第4章收录）净化解毒，击败金羽仙鹤高级形态收录',
      };
    case 'chargeHit':
      return {
        prepMob: 'enemy_scorpion_metal',
        mechanics: ['enemy_time_squeeze'],
        hintTags: ['首领', '时间压缩', '收录'],
        hintText: 'Boss 会压缩转珠时间：稳住节奏速战，击败厚土娘娘高级形态收录其加时技',
      };
    case 'noHeart':
      return {
        prepMob: 'enemy_thunderlord_boss_wood',
        mechanics: ['rule_no_heal', 'enemy_heal_block'],
        hintTags: ['首领', '禁心', '禁疗', '收录'],
        hintText: '禁心+禁疗双重压制：推荐带归墟玄龟/护盾宠减少掉血，击败裂隙甲虫高级形态收录',
      };
    case 'highAttack':
      return {
        prepMob: 'enemy_bat_fire',
        hintTags: ['首领', '高攻', '收录'],
        hintText: '高攻快攻 Boss：治疗护盾到位后收录',
      };
    case 'banElement': {
      const el = ctx?.ruleBanElement ?? 'metal';
      const hint = banHint(el);
      return {
        prepMob: 'enemy_bat_fire',
        mechanics: [...banMechanics(el), 'enemy_skill_seal_enrage'],
        hintTags: ['首领', ...hint.tags, '技能封印', '狂暴', '收录'],
        hintText: `${hint.text}；Boss 会封印技能且低血狂暴，推荐高爆发速杀，击败天外魔君高级形态收录其重力技`,
      };
    }
    case 'phaseShift':
      return {
        prepMob: 'enemy_crystal_warden_earth',
        mechanics: ['enemy_phase'],
        hintTags: ['首领', '形态转换', '收录'],
        hintText: 'Boss 跨血线会转形态并换招：血条分段处留一手爆发',
      };
    case 'elementAbsorb':
      return {
        prepMob: 'enemy_devour_serpent_water',
        mechanics: ['enemy_absorb'],
        hintTags: ['首领', '属性吸收', '收录'],
        hintText: 'Boss 会吸收克制它的属性：带第二种输出色轮换',
      };
    case 'counterStrike':
      return {
        prepMob: 'enemy_thorn_scorpion_metal',
        mechanics: ['enemy_counter'],
        hintTags: ['首领', '反击态', '收录'],
        hintText: 'Boss 反击态下出手越多反伤越重：少而重地打',
      };
    case 'attackDown':
      return {
        prepMob: 'enemy_wither_bat_fire',
        mechanics: ['enemy_atk_down'],
        hintTags: ['首领', '削攻', '收录'],
        hintText: 'Boss 会削弱我方伤害：带净化技解除后再爆发',
      };
    case 'lockedColumn':
      return {
        prepMob: 'enemy_bind_slime_wood',
        mechanics: ['orb_locked_col'],
        hintTags: ['首领', '锁列', '收录'],
        hintText: '开局锁一整列：先拆封再铺 Combo',
      };
    case 'resolveTank':
      return {
        prepMob: 'enemy_golem_bulwark_earth',
        mechanics: ['enemy_resolve_guard'],
        hintTags: ['首领', '免控坚壁', '收录'],
        hintText: 'Boss 凝意期间免疫控制：靠破防与爆发硬拆',
      };
    case 'finalTrial':
      return {
        prepMob: 'enemy_crystal_warden_earth',
        mechanics: ['enemy_final_trial', 'orb_locked_col'],
        hintTags: ['首领', '终局试炼', '锁列', '收录'],
        hintText: '终局试炼：转形态 + 锁列同场，克制/爆发/续航全要到位',
      };
  }
}

/** 校验关卡的挑战 archetype 与遭遇/机制一致（测试用） */
export function stageMatchesChallenge(
  kind: BossChallengeKind,
  encounters: readonly EncounterRef[],
  mechanics: readonly string[] | undefined,
): boolean {
  const mech = new Set(mechanics ?? []);
  const mobIds = encounters.filter((e) => e.kind === 'mob').map((e) => e.id);
  switch (kind) {
    case 'multiWave':
      return encounters.length >= 2;
    case 'boardSeal':
      return mech.has('orb_sealed');
    case 'boardRock':
      return mech.has('orb_rock');
    case 'highDefense':
      return mobIds.some((id) => id === 'enemy_golem_earth' || id === 'enemy_crystal_boss_earth');
    case 'highAttack':
      return mobIds.some((id) => id === 'enemy_bat_fire');
    case 'selfHeal':
      return mobIds.some((id) => id === 'enemy_serpent_water');
    case 'chargeHit':
      return mobIds.some((id) => id === 'enemy_scorpion_metal');
    case 'noHeart':
      return mech.has('rule_no_heal');
    case 'banElement':
      return [...mech].some((m) => m.startsWith('rule_ban_'));
    case 'phaseShift':
      return mobIds.some((id) => id === 'enemy_crystal_warden_earth');
    case 'elementAbsorb':
      return mobIds.some((id) => id === 'enemy_devour_serpent_water');
    case 'counterStrike':
      return mobIds.some((id) => id === 'enemy_thorn_scorpion_metal');
    case 'attackDown':
      return mobIds.some((id) => id === 'enemy_wither_bat_fire');
    case 'lockedColumn':
      return mech.has('orb_locked_col');
    case 'resolveTank':
      return mobIds.some((id) => id === 'enemy_golem_bulwark_earth');
    case 'finalTrial':
      return mech.has('enemy_final_trial');
    default:
      return false;
  }
}

export const CHAPTER_BOSS_CHALLENGE: Readonly<Record<number, BossChallengeKind>> = {
  1: 'multiWave',
  2: 'boardSeal',
  3: 'highDefense',
  4: 'boardRock',
  5: 'selfHeal',
  6: 'chargeHit',
  7: 'noHeart',
  8: 'banElement',
  9: 'highAttack',
  10: 'phaseShift',
  11: 'elementAbsorb',
  12: 'counterStrike',
  13: 'attackDown',
  14: 'resolveTank',
  15: 'lockedColumn',
  16: 'finalTrial',
};
