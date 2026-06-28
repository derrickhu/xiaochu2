/**
 * 章末 Boss「可玩挑战」 archetype — 遭遇配方 + 盘面/规则机制（非空标签）。
 *
 * 扩展约定：每章 Boss 只首教 1 种 kind；禁止主线章末叠加多机制（见 highAttack 留作第 9 章+）。
 */
import type { Element } from './combat';
import type { EncounterRef } from './enemies';
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
  | 'banElement';

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

/** 铺垫关 / 历练关：按已学挑战生成遭遇（无 captureUnlock） */
export function recipeForChallenge(kind: BossChallengeKind): ChallengeRecipe {
  switch (kind) {
    case 'multiWave':
      return {
        encounters: [mob('enemy_slime_wood'), mob('enemy_bat_fire')],
        hintTags: ['多波'],
        hintText: '多波敌人：注意保留血量与技能',
      };
    case 'boardSeal':
      return {
        encounters: [mob('enemy_scorpion_metal')],
        mechanics: ['orb_sealed'],
        hintTags: ['封印珠'],
        hintText: '消除相邻珠子来解封封印珠',
      };
    case 'boardRock':
      return {
        encounters: [mob('enemy_golem_earth')],
        mechanics: ['orb_rock'],
        hintTags: ['顽石封印'],
        hintText: '顽石封印更密：优先清理周边解封',
      };
    case 'highDefense':
      return {
        encounters: [mob('enemy_golem_earth')],
        hintTags: ['高防减伤'],
        hintText: '傀儡高防且会减伤：克制 + 爆发破防',
      };
    case 'highAttack':
      return {
        encounters: [mob('enemy_bat_fire'), mob('enemy_bat_fire')],
        hintTags: ['高攻快攻'],
        hintText: '焰蝠攻击高：备好治疗或护盾',
      };
    case 'selfHeal':
      return {
        encounters: [mob('enemy_serpent_water')],
        hintTags: ['自疗'],
        hintText: '幼蛟会自愈：集中爆发抢血线',
      };
    case 'chargeHit':
      return {
        encounters: [mob('enemy_scorpion_metal')],
        hintTags: ['蓄力重击'],
        hintText: '晶甲蝎会蓄力重击：护盾/治疗扛住',
      };
    case 'noHeart':
      return {
        encounters: [mob('enemy_toad_water'), mob('enemy_bat_fire')],
        mechanics: ['rule_no_heal'],
        hintTags: ['禁心'],
        hintText: '本关禁心：心珠不回血，靠护盾与速杀',
      };
    case 'banElement': {
      const hint = banHint('metal');
      return {
        encounters: [mob('enemy_bat_fire')],
        mechanics: banMechanics('metal'),
        hintTags: hint.tags,
        hintText: hint.text,
      };
    }
  }
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
        hintTags: ['BOSS', '多波', '收录'],
        hintText: '三波试炼：击败魔将后迎战星辉灵鹿高级形态即可收录',
      };
    case 'boardSeal':
      return {
        prepMob: 'enemy_crystal_boss_earth',
        mechanics: ['orb_sealed'],
        hintTags: ['BOSS', '封印珠', '收录'],
        hintText: '封印珠干扰盘面，击败灵鹿医者高级形态即可收录',
      };
    case 'highDefense':
      return {
        prepMob: 'enemy_crystal_boss_earth',
        hintTags: ['BOSS', '高防减伤', '收录'],
        hintText: '幽晶巨像高防减伤：克制 + 爆发，击败深渊水母高级形态收录',
      };
    case 'boardRock':
      return {
        prepMob: 'enemy_golem_earth',
        mechanics: ['orb_rock'],
        hintTags: ['BOSS', '顽石封印', '收录'],
        hintText: '顽石封印 + 炽土试炼：解封后击败焚天魔将高级形态收录',
      };
    case 'selfHeal':
      return {
        prepMob: 'enemy_serpent_water',
        hintTags: ['BOSS', '自疗', '收录'],
        hintText: '寒潭幼蛟自愈拖战：爆发抢血，击败归墟玄龟高级形态收录',
      };
    case 'chargeHit':
      return {
        prepMob: 'enemy_scorpion_metal',
        hintTags: ['BOSS', '蓄力重击', '收录'],
        hintText: '晶甲蝎蓄力重击：护盾扛击，击败星河烛龙高级形态收录',
      };
    case 'noHeart':
      return {
        prepMob: 'enemy_thunderlord_boss_wood',
        mechanics: ['rule_no_heal'],
        hintTags: ['BOSS', '禁心', '收录'],
        hintText: '禁心关：心珠不回血，击败裂隙甲虫高级形态收录',
      };
    case 'highAttack':
      return {
        prepMob: 'enemy_bat_fire',
        hintTags: ['BOSS', '高攻', '收录'],
        hintText: '高攻快攻 Boss：治疗护盾到位后收录',
      };
    case 'banElement': {
      const el = ctx?.ruleBanElement ?? 'metal';
      const hint = banHint(el);
      return {
        prepMob: 'enemy_bat_fire',
        mechanics: banMechanics(el),
        hintTags: ['BOSS', ...hint.tags, '收录'],
        hintText: `${hint.text}，击败 Boss 高级形态收录`,
      };
    }
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
};
