/**
 * 副玩法战斗结算（秘境 / 通天塔）
 *
 * 主线的结算口径（星数存档、首通灵玉、Boss 直掉）不适用于副玩法，
 * 这里给出各自的发奖与进度推进，返回给结算浮层展示的提示行。
 */
import { REALM_MAP, resolveRealmTier } from '@/balance/secretRealm';
import { isMilestoneFloor, TOWER, TOWER_MILESTONE_REWARD } from '@/balance/tower';
import { TOWER_FLOOR_KINDS } from '@/balance/towerPath';
import { formatReward } from '@/balance/rewards';
import type { BattleContext } from '@/game/battleContext';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { reportQuest } from '@/game/dailyQuestTracker';
import { analytics } from '@/analytics';

/** 副玩法战斗掉落的折算乘区（1 = 原样发放） */
export interface ContextDropScale {
  coins: number;
  exp: number;
  universal: number;
}

/**
 * 副玩法的战斗掉落折算。
 *
 * 秘境有体力与每日次数双重门控，按原样发；通天塔零体力、又不吃主线的重复通关衰减，
 * 全额发放等于开一条无限刷通道（实测约为同期主线日产目标的 2~3 倍），
 * 故单独收口到 TOWER.battleDropPct。塔的产出主体是登塔印记与里程碑，不是通用货币。
 */
export function contextDropScale(context: BattleContext): ContextDropScale {
  if (context.kind !== 'tower') return { coins: 1, exp: 1, universal: 1 };
  return {
    coins: TOWER.battleDropPct,
    exp: TOWER.battleDropPct,
    universal: TOWER.battleUniversalPct,
  };
}

export interface ContextSettleInput {
  /** 战斗结束时英雄剩余血量比例（通天塔跨层继承用） */
  hpPctLeft: number;
  /** 战斗结束时各宠剩余技能 CD（通天塔跨层继承用） */
  skillCds?: Record<string, number>;
  rng?: () => number;
}

/** 副玩法胜利结算；返回展示用提示行 */
export function settleContextVictory(
  context: BattleContext,
  input: ContextSettleInput,
): string[] {
  const rng = input.rng ?? Math.random;
  if (context.kind === 'realm') {
    return settleRealmVictory(context.realmId, context.tier, rng);
  }
  return settleTowerVictory(context.floor, input.hpPctLeft, input.skillCds ?? {});
}

function settleRealmVictory(realmId: string, tier: number, _rng: () => number): string[] {
  const realm = REALM_MAP.get(realmId);
  if (!realm) return [];
  const t = resolveRealmTier(tier, PlayerData.clearedChapters);
  const reward = { lingyu: t.lingyu, coins: t.coins };
  grantReward(reward);

  reportQuest('realmClear');
  analytics.track('secret_realm_clear', {
    realm_id: realmId,
    element: realm.element,
    tier,
    lingyu: t.lingyu,
    coins: t.coins,
  });
  return [`${formatReward(reward)}`];
}

function settleTowerVictory(
  floor: number,
  hpPctLeft: number,
  skillCds: Record<string, number>,
): string[] {
  const lines: string[] = [];
  // 塔币要在 towerAdvance 刷新 bestFloor 之前结算，否则突破奖励恒为 0
  const guardFirstClear = isMilestoneFloor(floor) && !PlayerData.isTowerMilestoneClaimed(floor);
  const path = TOWER_FLOOR_KINDS[PlayerData.towerPathKind];
  const coins = PlayerData.towerSettleCoins(floor, {
    guardFirstClear,
    bonus: path.coinBonus,
  });

  // 战斗层只回一小口血，守关层多给一些：HP 是塔里最稀缺的资源
  const carry = Math.min(1, hpPctLeft + PlayerData.towerHealPct(floor));
  if (PlayerData.towerAdvance(floor, carry, skillCds)) {
    lines.push(`历史最高层刷新 · 第 ${floor} 层`);
  }

  if (isMilestoneFloor(floor) && PlayerData.claimTowerMilestone(floor)) {
    grantReward(TOWER_MILESTONE_REWARD);
    lines.push(`第 ${floor} 层里程碑 · ${formatReward(TOWER_MILESTONE_REWARD)}`);
  }

  if (coins.total > 0) {
    const detail = coins.breakthrough > 0 || coins.guard > 0
      ? `（含突破 ${coins.breakthrough + coins.guard}）`
      : '';
    lines.push(`登塔印记 +${coins.total}${detail}`);
  }

  reportQuest('towerFloor');
  analytics.track('tower_floor_clear', {
    floor,
    best_floor: PlayerData.tower.bestFloor,
    tower_coins: coins.total,
  });
  return lines;
}
