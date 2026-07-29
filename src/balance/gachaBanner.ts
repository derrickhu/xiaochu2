/**
 * 当期 UP 池（纯数据 + 纯函数，运营轮换只改这张表）
 *
 * 要解决的问题：100 宠深池下，UR 档 4% 摊到 10 只 = 单只 0.4%，
 * 「想要的那只」实际上抽不到，稀有度再高也没有目标感。
 *
 * 做法不是给 UP 宠乘一个魔法倍率，而是**直接声明它在本档内应占的概率份额**
 * （featuredTierShare），再由 upWeightOf 反解出权重。这样公示口径与实际出货天然一致：
 * UP UR 占 UR 档 50% → 单抽出该 UR = 4% × 50% = 2%，与计划书口径吻合。
 */
import { PET_MAP } from './pets';
import type { Rarity } from './rarity';

export interface GachaBanner {
  id: string;
  name: string;
  /** 当期 UP 的 UR（1 只） */
  featuredUr: string;
  /** 当期 UP 的 SSR（2 只） */
  featuredSsr: readonly string[];
  /**
   * UP 宠在其所属档位内合计占的概率份额（0~1）。
   * UR 档只有 1 只 UP，故该值即为它自己的份额；SSR 档 2 只 UP 平分该份额。
   */
  featuredTierShare: number;
}

/**
 * 当期卡池。UP 宠取自量产名录里未被章节 Boss 掉落占用的高稀有宠
 * （被 Boss 掉落的宠打关就能拿，放 UP 位没有吸引力）。
 */
export const CURRENT_BANNER: GachaBanner = {
  id: 'banner_worldtree',
  name: '建木神鸾 · 华彩登临',
  featuredUr: 'pet_058',
  featuredSsr: ['pet_043', 'pet_057'],
  featuredTierShare: 0.5,
};

/** UP 宠 id 集合（UI 加角标、公示列表用） */
export function bannerFeaturedIds(banner: GachaBanner = CURRENT_BANNER): readonly string[] {
  return [banner.featuredUr, ...banner.featuredSsr];
}

export function isFeatured(petId: string, banner: GachaBanner = CURRENT_BANNER): boolean {
  return petId === banner.featuredUr || banner.featuredSsr.includes(petId);
}

/** 当期 UP 宠在标准池下的单抽绝对概率（公示用；不在池内则为 0） */
export function featuredPetRate(
  petId: string,
  tierRate: number,
  tierPetCount: number,
  banner: GachaBanner = CURRENT_BANNER,
): number {
  if (!isFeatured(petId, banner) || tierPetCount <= 0) return 0;
  const upCount = petId === banner.featuredUr ? 1 : banner.featuredSsr.length;
  return tierRate * (banner.featuredTierShare / upCount);
}

/**
 * 档内选宠权重：把「UP 宠合计占 featuredTierShare」翻译成相对权重。
 *
 * 推导：设档内共 n 只、其中 k 只是 UP，非 UP 权重记 1，UP 权重记 w，
 * 要求 k·w / (k·w + (n-k)) = share  ⇒  w = share·(n-k) / (k·(1-share))。
 * 档内没有 UP 宠（或全是 UP）时退化为等权，避免除零与「全场 UP」的空转。
 */
export function upWeightOf(
  petId: string,
  tierPetIds: readonly string[],
  banner: GachaBanner = CURRENT_BANNER,
): number {
  const n = tierPetIds.length;
  const k = tierPetIds.filter((id) => isFeatured(id, banner)).length;
  if (k === 0 || k === n) return 1;
  const share = Math.min(0.95, Math.max(0, banner.featuredTierShare));
  if (share <= 0) return 1;
  const w = (share * (n - k)) / (k * (1 - share));
  return isFeatured(petId, banner) ? w : 1;
}

/** 校验当期池配置指向真实灵宠且档位正确（测试与启动自检用） */
export function validateBanner(banner: GachaBanner = CURRENT_BANNER): string[] {
  const errs: string[] = [];
  const check = (id: string, want: Rarity): void => {
    const pet = PET_MAP.get(id);
    if (!pet) {
      errs.push(`UP 宠不存在: ${id}`);
      return;
    }
    if (pet.rarity !== want) errs.push(`UP 宠 ${id} 稀有度应为 ${want}，实际 ${pet.rarity}`);
  };
  check(banner.featuredUr, 4);
  for (const id of banner.featuredSsr) check(id, 3);
  if (banner.featuredTierShare <= 0 || banner.featuredTierShare >= 1) {
    errs.push(`featuredTierShare 必须在 (0,1) 内，实际 ${banner.featuredTierShare}`);
  }
  return errs;
}
