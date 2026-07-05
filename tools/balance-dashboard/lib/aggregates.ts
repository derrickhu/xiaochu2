import { STAGES, CHAPTERS, CHAPTER_NAME, stagesOfChapter, CHAPTER_REWARD_PET, chapterBossStage } from '@/balance/stages';
import { bossChallengeLabel, CHAPTER_BOSS_CHALLENGE } from '@/balance/bossChallenge';
import { PETS, PET_MAP } from '@/balance/pets';
import { MOBS } from '@/balance/enemies';
import { RARITIES, getRarity } from '@/balance/rarity';
import { ECONOMY } from '@/balance/economy';
import { CHAPTER_BUDGET } from '@/balance/growth';
import type { Element } from '@/balance/combat';
import { ELEMENT_NAME } from '@/balance/ui';

export interface CaptureMapEntry {
  petId: string;
  stageId: string;
}

export function buildCaptureMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of STAGES) {
    for (const e of s.encounters) {
      if (e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop) {
        map.set(e.id, s.id);
      }
    }
  }
  return map;
}

export interface ChapterSummary {
  chapter: number;
  name: string;
  stageCount: number;
  captureIds: string[];
  bossId: string;
  bossChallenge: string;
  rewardPetName: string;
}

export function chapterSummaries(): ChapterSummary[] {
  const captureMap = buildCaptureMap();
  return CHAPTERS.map((ch) => {
    const list = stagesOfChapter(ch);
    const captureIds = [...captureMap.entries()]
      .filter(([, sid]) => STAGES.find((x) => x.id === sid)?.chapter === ch)
      .map(([pid]) => pid);
    const boss = list.find((s) => s.isBoss);
    const rewardId = CHAPTER_REWARD_PET[ch];
    const kind = CHAPTER_BOSS_CHALLENGE[ch];
    return {
      chapter: ch,
      name: CHAPTER_NAME[ch] ?? `第${ch}章`,
      stageCount: list.length,
      captureIds,
      bossId: boss?.id ?? '—',
      bossChallenge: kind ? bossChallengeLabel(kind) : '—',
      rewardPetName: PET_MAP.get(rewardId)?.name ?? rewardId ?? '—',
    };
  });
}

export function overviewStats() {
  const captureCount = buildCaptureMap().size;
  return {
    pets: PETS.length,
    stages: STAGES.length,
    mobs: MOBS.length,
    chapters: CHAPTERS.length,
    captures: captureCount,
    starters: 5,
  };
}

export function gachaSummary() {
  return RARITIES.map((r) => {
    const d = getRarity(r);
    return { code: d.code, name: d.name, rate: d.gachaRate, statMult: d.statMult };
  });
}

export function economySummary() {
  const g = ECONOMY.gacha;
  return {
    singleCost: g.singleCost,
    tenCost: g.tenCost,
    pitySSR: g.pitySSR,
    starterLingyu: g.starterLingyu,
    coinStageBase: ECONOMY.coin.stageBase,
    coinChapterGrowth: ECONOMY.coin.chapterGrowth,
  };
}

export { CHAPTER_BUDGET, ELEMENT_NAME, chapterBossStage };
export type { Element };
