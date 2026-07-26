/**
 * 七日循环签到（纯数据，零逻辑）
 *
 * 成本最低的回访钩子：断签重置到第 1 天，第 7 天给十连券 + 碎片包做周锚点。
 */
import type { RewardBundle } from './rewards';

export const CHECKIN_CYCLE_DAYS = 7;

export interface CheckinDayDef {
  /** 循环内第几天（1~7） */
  day: number;
  reward: RewardBundle;
  /** 大奖日：UI 加宽高亮 */
  highlight?: boolean;
}

/** 签到只发「能花的东西」：灵玉 / 灵宠币 / 碎片 / 十连券；经验主线与秘境已经很多，不占签到坑位 */
export const CHECKIN_DAYS: readonly CheckinDayDef[] = [
  { day: 1, reward: { lingyu: 30 } },
  { day: 2, reward: { coins: 300 } },
  { day: 3, reward: { shards: 5 } },
  { day: 4, reward: { lingyu: 50 } },
  { day: 5, reward: { coins: 800 } },
  { day: 6, reward: { shards: 12 } },
  { day: 7, reward: { tickets: 1, shards: 20 }, highlight: true },
];

export function checkinDay(day: number): CheckinDayDef {
  return CHECKIN_DAYS.find((d) => d.day === day) ?? CHECKIN_DAYS[0];
}
