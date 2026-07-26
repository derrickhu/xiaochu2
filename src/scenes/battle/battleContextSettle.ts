/**
 * 副玩法战斗结算（秘境 / 通天塔）
 *
 * 主线的结算口径（星数存档、首通灵玉、Boss 直掉）不适用于副玩法，
 * 这里给出各自的发奖与进度推进，返回给结算浮层展示的提示行。
 */
import { REALM_MAP, realmTier } from '@/balance/secretRealm';
import { isMilestoneFloor, TOWER, TOWER_MILESTONE_REWARD } from '@/balance/tower';
import { formatReward } from '@/balance/rewards';
import type { BattleContext } from '@/game/battleContext';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { reportQuest } from '@/game/dailyQuestTracker';
import { analytics } from '@/analytics';

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
  const t = realmTier(tier);
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
  // 每层只回一小口血，残血带进下一层
  const carry = Math.min(1, hpPctLeft + TOWER.healPctPerFloor);
  if (PlayerData.towerAdvance(floor, carry, skillCds)) {
    lines.push(`历史最高层刷新 · 第 ${floor} 层`);
  }

  if (isMilestoneFloor(floor) && PlayerData.claimTowerMilestone(floor)) {
    grantReward(TOWER_MILESTONE_REWARD);
    lines.push(`第 ${floor} 层里程碑 · ${formatReward(TOWER_MILESTONE_REWARD)}`);
  }

  reportQuest('towerFloor');
  analytics.track('tower_floor_clear', { floor, best_floor: PlayerData.tower.bestFloor });
  return lines;
}
