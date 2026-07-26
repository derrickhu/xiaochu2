/**
 * 副系统通用奖励包（纯数据，零逻辑）
 *
 * 签到 / 日常任务 / 秘境 / 通天塔里程碑共用一种结构，
 * 发放与展示分别由 game/rewardGrant.ts 与 UI 统一处理，避免每个系统各写一遍发奖。
 */
export interface RewardBundle {
  lingyu?: number;
  coins?: number;
  exp?: number;
  /** 招募券（十连券） */
  tickets?: number;
  /** 随机已拥有灵宠的碎片数 */
  shards?: number;
  /** 碎片限定属性（秘境按当日属性出货） */
  shardElement?: 'metal' | 'wood' | 'water' | 'fire' | 'earth';
}

/** 一句话奖励描述（面板列表与 Toast 共用） */
export function formatReward(r: RewardBundle): string {
  const parts: string[] = [];
  if (r.lingyu) parts.push(`灵玉 ×${r.lingyu}`);
  if (r.coins) parts.push(`灵宠币 ×${r.coins}`);
  if (r.exp) parts.push(`经验 ×${r.exp}`);
  if (r.tickets) parts.push(`十连券 ×${r.tickets}`);
  if (r.shards) {
    // 碎片落账：优先指定属性已拥有宠，否则随机一只已拥有宠（见 rewardGrant.pickShardTarget）
    const el = r.shardElement
      ? ({ metal: '金', wood: '木', water: '水', fire: '火', earth: '土' } as const)[r.shardElement]
      : null;
    parts.push(el ? `${el}系碎片 ×${r.shards}` : `随机灵宠碎片 ×${r.shards}`);
  }
  return parts.join('  ');
}
