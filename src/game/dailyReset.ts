/**
 * 跨日判定单一真源
 *
 * 小游戏随时会被宿主杀进程，定时器不可靠，所有日循环系统只能在「用到的那一刻」
 * 比对本地日期来重置。秘境次数、日常任务、首胜、通天塔重置券共用这一套判定，
 * 避免各系统各写一份日期比较导致重置时机不一致。
 */
import { localDateKey } from '@/core/SidebarService';
import { emptyDailyState, type SaveData } from './playerSave';

/**
 * 把存档里所有「按日重置」的字段对齐到今天。
 * @returns 是否发生了重置（调用方据此决定是否落盘）
 */
export function ensureDailyFresh(data: SaveData, today = localDateKey()): boolean {
  let changed = false;

  if (data.daily.date !== today) {
    data.daily = emptyDailyState(today);
    changed = true;
  }

  if (data.tower.resetDate !== today) {
    data.tower.resetDate = today;
    data.tower.resetsUsed = 0;
    changed = true;
  }

  if (data.tower.coinDate !== today) {
    data.tower.coinDate = today;
    data.tower.coinBaseToday = 0;
    data.tower.exchangeUsed = {};
    changed = true;
  }

  return changed;
}

/** 两个 YYYY-MM-DD 是否相差恰好一天（签到连签判定） */
export function isConsecutiveDay(prev: string, today: string): boolean {
  if (!prev) return false;
  const prevTs = Date.parse(`${prev}T00:00:00`);
  const todayTs = Date.parse(`${today}T00:00:00`);
  if (Number.isNaN(prevTs) || Number.isNaN(todayTs)) return false;
  return Math.round((todayTs - prevTs) / 86_400_000) === 1;
}
