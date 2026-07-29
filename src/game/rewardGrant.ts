/**
 * 奖励包发放（签到 / 日常任务 / 秘境 / 通天塔共用）
 *
 * 所有副系统只声明 RewardBundle，落账口径统一在这里，避免各系统各写一遍
 * 「碎片给谁、属性不匹配怎么兜底」。
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
