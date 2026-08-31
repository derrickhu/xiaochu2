/**
 * 奖励包发放（签到 / 日常任务 / 秘境 / 通天塔 / 结算广告翻倍共用）
 *
 * 所有副系统只声明 RewardBundle，落账口径统一在这里，避免各系统各写一遍
 * 「碎片给谁、属性不匹配怎么兜底」。
 *
 * 战斗结算另有「已落账具体数额」包（ConcreteReward）：碎片已指向 petId，
 * 展示 / 广告翻倍 / 再发一次都必须读同一份，禁止各自手写字段列表。
 */
import { PET_MAP } from '@/balance/pets';
import type { RewardBundle } from '@/balance/rewards';
import { PlayerData } from './PlayerData';

export interface GrantedReward {
  lingyu: number;
  coins: number;
  exp: number;
  tickets: number;
  shards: { petId: string; count: number }[];
  universal: number;
  stamina: number;
}

/**
 * 已确定落账目标的奖励包（战斗结算实发）。
 * 与 RewardBundle 的差别：shards 已是具体 petId，不再随机挑宠。
 */
export interface ConcreteReward {
  coins: number;
  exp: number;
  lingyu: number;
  universal: number;
  shards: { petId: string; count: number }[];
  /** 通天塔印记；主线 / 秘境为 0 */
  towerMarks?: number;
}

export function emptyConcreteReward(): ConcreteReward {
  return { coins: 0, exp: 0, lingyu: 0, universal: 0, shards: [], towerMarks: 0 };
}

export function concreteRewardHasValue(r: ConcreteReward): boolean {
  return r.coins > 0 || r.exp > 0 || r.lingyu > 0 || r.universal > 0
    || (r.towerMarks ?? 0) > 0 || r.shards.some((s) => s.count > 0);
}

/** 按倍率放大具体奖励包（结算广告翻倍用；mult=1 原样返回） */
export function scaleConcreteReward(r: ConcreteReward, mult: number): ConcreteReward {
  if (mult === 1) return { ...r, shards: r.shards.map((s) => ({ ...s })) };
  const scale = (v: number) => Math.floor(v * mult);
  return {
    coins: scale(r.coins),
    exp: scale(r.exp),
    lingyu: scale(r.lingyu),
    universal: scale(r.universal),
    towerMarks: scale(r.towerMarks ?? 0),
    shards: r.shards
      .map((s) => ({ petId: s.petId, count: scale(s.count) }))
      .filter((s) => s.count > 0),
  };
}

/** 发放 ConcreteReward（已知 petId，不再随机） */
export function grantConcreteReward(r: ConcreteReward): void {
  if (r.coins > 0) PlayerData.addCoins(r.coins);
  if (r.exp > 0) PlayerData.addExp(r.exp);
  if (r.lingyu > 0) PlayerData.addLingyu(r.lingyu);
  if (r.universal > 0) PlayerData.addUniversalShards(r.universal);
  if ((r.towerMarks ?? 0) > 0) PlayerData.addTowerCoins(r.towerMarks ?? 0);
  for (const s of r.shards) {
    if (s.count > 0) PlayerData.addShards(s.petId, s.count);
  }
}

/** 按钮副标题：前两项明细，其余「等」收口 */
export function formatConcreteRewardBrief(r: ConcreteReward, maxParts = 2): string {
  const parts: string[] = [];
  if ((r.towerMarks ?? 0) > 0) parts.push(`印记 +${r.towerMarks}`);
  if (r.coins > 0) parts.push(`灵宠币 +${r.coins}`);
  if (r.exp > 0) parts.push(`经验 +${r.exp}`);
  if (r.lingyu > 0) parts.push(`灵玉 +${r.lingyu}`);
  if (r.universal > 0) parts.push(`通用碎片 +${r.universal}`);
  if (r.shards.length > 0) {
    const shardSum = r.shards.reduce((n, s) => n + s.count, 0);
    if (shardSum > 0) parts.push(`碎片 +${shardSum}`);
  }
  if (parts.length === 0) return '';
  if (parts.length <= maxParts) return parts.join(' · ');
  return `${parts.slice(0, maxParts).join(' · ')} 等`;
}

/** 按倍率放大奖励包（每日首胜翻倍等） */
export function scaleReward(r: RewardBundle, mult: number): RewardBundle {
  if (mult === 1) return r;
  const scale = (v?: number) => (v ? Math.max(1, Math.floor(v * mult)) : v);
  return {
    ...r,
    lingyu: scale(r.lingyu),
    coins: scale(r.coins),
    exp: scale(r.exp),
    tickets: scale(r.tickets),
    shards: scale(r.shards),
    universal: scale(r.universal),
    stamina: scale(r.stamina),
  };
}

/**
 * 发放奖励包并落账。
 * @param rng 注入随机源，便于测试与回放
 */
export function grantReward(r: RewardBundle, rng: () => number = Math.random): GrantedReward {
  const out: GrantedReward = {
    lingyu: 0, coins: 0, exp: 0, tickets: 0, shards: [], universal: 0, stamina: 0,
  };

  if (r.lingyu) {
    PlayerData.addLingyu(r.lingyu);
    out.lingyu = r.lingyu;
  }
  if (r.coins) {
    PlayerData.addCoins(r.coins);
    out.coins = r.coins;
  }
  if (r.exp) {
    PlayerData.addExp(r.exp);
    out.exp = r.exp;
  }
  if (r.tickets) {
    PlayerData.addTickets(r.tickets);
    out.tickets = r.tickets;
  }
  if (r.shards) {
    const petId = pickShardTarget(r.shardElement, rng);
    if (petId) {
      PlayerData.addShards(petId, r.shards);
      out.shards.push({ petId, count: r.shards });
    }
  }
  if (r.universal) {
    PlayerData.addUniversalShards(r.universal);
    out.universal = r.universal;
  }
  if (r.stamina) {
    PlayerData.addStamina(r.stamina);
    out.stamina = r.stamina;
  }
  return out;
}

/**
 * 碎片落到哪只宠：优先指定属性的已拥有宠，属性无货时退回任意已拥有宠，
 * 保证碎片永远不会被静默丢弃。
 */
export function pickShardTarget(
  element: RewardBundle['shardElement'],
  rng: () => number = Math.random,
): string | null {
  const owned = PlayerData.ownedPets;
  if (owned.length === 0) return null;
  const scoped = element
    ? owned.filter((id) => PET_MAP.get(id)?.element === element)
    : owned;
  const pool = scoped.length > 0 ? scoped : owned;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}
