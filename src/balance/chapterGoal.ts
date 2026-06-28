/**
 * 章节目标灵宠展示（选关页 / 策划面板共用）
 */
import type { Element } from './combat';
import {
  CHAPTER_CAPTURE_RARITY,
  CHAPTER_REWARD_PET,
  chapterBossStage,
} from './stages';
import { PET_MAP } from './pets';
import { getSkill } from './skills';
import { PET_ROLE_NAME, type PetRole } from './petRoles';
import { getRarity, type Rarity } from './rarity';
import { ELEMENT_NAME } from './ui';
import { resolvePetPassiveBundle } from './passiveEffects';
import { bossChallengeLabel, CHAPTER_BOSS_CHALLENGE } from './bossChallenge';

export interface ChapterGoalInfo {
  chapter: number;
  petId: string;
  name: string;
  element: string;
  elementKey: Element;
  role: string;
  roleKey: PetRole;
  rarity: string;
  rarityTier: Rarity;
  rarityCode: string;
  skillName: string;
  skillCd: number;
  skillDesc: string;
  skillLine: string;
  passiveLine: string;
  bossChallenge: string;
  /** 章末 Boss 关编号，如「1-5 灵羊试炼」 */
  bossStageLabel: string;
  summary: string;
}

export function getChapterGoal(chapter: number): ChapterGoalInfo | undefined {
  const petId = CHAPTER_REWARD_PET[chapter];
  if (!petId) return undefined;
  const pet = PET_MAP.get(petId);
  if (!pet) return undefined;
  const sk = getSkill(pet.skillId);
  const skillName = sk?.name ?? pet.skillId;
  const skillCd = sk?.cd ?? 0;
  const skillDesc = sk?.desc ?? '';
  const skillLine = sk ? `${sk.name} CD${sk.cd}` : pet.skillId;
  const passive = resolvePetPassiveBundle(pet.role, pet.rarity, 1);
  const passiveLine = passive.displayLines.find((l) => l.unlocked !== false)?.text ?? '—';
  const rarityDef = getRarity(pet.rarity);
  const challengeKind = CHAPTER_BOSS_CHALLENGE[chapter];
  const bossChallenge = challengeKind ? bossChallengeLabel(challengeKind) : '';
  const boss = chapterBossStage(chapter);
  const bossStageLabel = boss ? `${boss.chapter}-${boss.index} ${boss.name}` : '';
  return {
    chapter,
    petId,
    name: pet.name,
    element: ELEMENT_NAME[pet.element],
    elementKey: pet.element,
    role: PET_ROLE_NAME[pet.role],
    roleKey: pet.role,
    rarity: rarityDef.name,
    rarityTier: pet.rarity,
    rarityCode: rarityDef.code,
    skillName,
    skillCd,
    skillDesc,
    skillLine,
    passiveLine,
    bossChallenge,
    bossStageLabel,
    summary: `收录 ${pet.name} · ${ELEMENT_NAME[pet.element]}${PET_ROLE_NAME[pet.role]} · ${skillLine}`,
  };
}

export function formatChapterGoalCard(chapter: number): string {
  const g = getChapterGoal(chapter);
  if (!g) return '本章暂无收录目标';
  return `${g.summary}\n被动：${g.passiveLine}`;
}

/** 校验收录宠稀有度是否符合章节递进表 */
export function chapterCaptureRarityMatches(chapter: number): boolean {
  const petId = CHAPTER_REWARD_PET[chapter];
  const expected = CHAPTER_CAPTURE_RARITY[chapter];
  if (!petId || !expected) return true;
  const pet = PET_MAP.get(petId);
  return pet?.rarity === expected;
}
