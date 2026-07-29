/**
 * 副系统存档测试：日循环重置、七日签到、通天塔续战。
 * 与 PlayerData.test.ts 同样跑在无 wx/tt 的纯内存环境，断言取相对变化。
 */
import { describe, it, expect } from 'vitest';
import { emptyDailyState, emptyTowerState, initialData, parseSaveData } from '../playerSave';
import { ensureDailyFresh, isConsecutiveDay } from '../dailyReset';
import { checkpointFloorOf, isMilestoneFloor, TOWER } from '@/balance/tower';
import { openRealmsOn, REALMS } from '@/balance/secretRealm';
import { dailyQuestsOf, DAILY_QUEST_COUNT } from '@/balance/dailyQuest';
import { CHECKIN_CYCLE_DAYS, CHECKIN_DAYS } from '@/balance/checkin';

describe('每日重置', () => {
  it('跨日清空当日进度并重置塔的重置次数', () => {
    const data = initialData();
    data.daily = emptyDailyState('2026-07-25');
    data.daily.realmRuns = 3;
    data.daily.questClaimed.push('dq_clear3');
    data.daily.adUsage.stamina_refill = 3;
    data.tower.resetDate = '2026-07-25';
    data.tower.resetsUsed = TOWER.dailyResets;

    expect(ensureDailyFresh(data, '2026-07-26')).toBe(true);
    expect(data.daily.realmRuns).toBe(0);
    expect(data.daily.questClaimed).toEqual([]);
    expect(data.daily.adUsage).toEqual({});
    expect(data.tower.resetsUsed).toBe(0);
  });

  it('同一天重复调用不改动数据', () => {
    const data = initialData();
    ensureDailyFresh(data, '2026-07-26');
    data.daily.realmRuns = 2;
    expect(ensureDailyFresh(data, '2026-07-26')).toBe(false);
    expect(data.daily.realmRuns).toBe(2);
  });

  it('连续日判定只认相邻的自然日', () => {
    expect(isConsecutiveDay('2026-07-25', '2026-07-26')).toBe(true);
    expect(isConsecutiveDay('2026-07-24', '2026-07-26')).toBe(false);
    expect(isConsecutiveDay('', '2026-07-26')).toBe(false);
  });
});

describe('存档 v6 迁移', () => {
  it('老档缺 daily/checkin/tower 时回退到空态', () => {
    const data = parseSaveData({ version: 5, lingyu: 100 });
    expect(data.daily.realmRuns).toBe(0);
    expect(data.checkin.streak).toBe(0);
    expect(data.tower.runFloor).toBe(1);
    expect(data.tower.runHpPct).toBe(1);
  });

  it('脏数据被夹到合法区间', () => {
    const data = parseSaveData({
      version: 6,
      tower: { ...emptyTowerState(), runHpPct: 9, runFloor: -3, runCds: { a: -1, b: 2 } },
    });
    expect(data.tower.runHpPct).toBe(1);
    expect(data.tower.runFloor).toBe(1);
    expect(data.tower.runCds).toEqual({ b: 2 });
  });
});

describe('通天塔层规则', () => {
  it('每 5 层一个存档点，回退到本段起始层', () => {
    expect(checkpointFloorOf(1)).toBe(1);
    expect(checkpointFloorOf(5)).toBe(1);
    expect(checkpointFloorOf(6)).toBe(6);
    expect(checkpointFloorOf(12)).toBe(11);
  });

  it('里程碑层每 10 层一次', () => {
    expect(isMilestoneFloor(10)).toBe(true);
    expect(isMilestoneFloor(20)).toBe(true);
    expect(isMilestoneFloor(9)).toBe(false);
    expect(isMilestoneFloor(0)).toBe(false);
  });
});

describe('五行秘境轮换', () => {
  it('工作日只开一个副本，周末全开', () => {
    // 2026-07-27 是周一，2026-07-26 是周日
    expect(openRealmsOn(new Date(2026, 6, 27)).length).toBe(1);
    expect(openRealmsOn(new Date(2026, 6, 26)).length).toBe(REALMS.length);
  });

  it('周一到周五各对应一种属性且不重复', () => {
    const els = [27, 28, 29, 30, 31].map((d) => openRealmsOn(new Date(2026, 6, d))[0].element);
    expect(new Set(els).size).toBe(5);
  });
});

describe('每日任务与签到配置', () => {
  it('同一天选出同一组任务，且条数固定', () => {
    const a = dailyQuestsOf('2026-07-26');
    const b = dailyQuestsOf('2026-07-26');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(a.length).toBe(DAILY_QUEST_COUNT);
    expect(new Set(a.map((q) => q.id)).size).toBe(DAILY_QUEST_COUNT);
  });

  it('签到表覆盖完整七日循环', () => {
    expect(CHECKIN_DAYS.length).toBe(CHECKIN_CYCLE_DAYS);
    expect(CHECKIN_DAYS.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
