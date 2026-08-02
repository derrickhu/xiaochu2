/**
 * 通天塔与主线的两处耦合：产出不能压过主线，难度曲线不能跟着玩家跑。
 *
 * 这两条都不是塔的局部数值，单看 tower.ts 看不出问题 —— 产出要跟 DAILY_TARGET 比，
 * 曲线要确认它对玩家进度「无感」，所以放在一起守。
 */
import { describe, it, expect } from 'vitest';
import { DAILY_TARGET } from '../powerBudget';
import {
  TOWER, buildTowerStage, isMilestoneFloor, towerEntryFloor, towerEquivalentChapter,
} from '../tower';
import { stageCoinReward, stageDrops } from '@/formulas/economyOutput';
import { contextDropScale } from '@/scenes/battle/battleContextSettle';

/** 塔内单层实发（口径与 BattleResultOverlay 的 context 分支一致） */
function floorDrop(floor: number): { coins: number; exp: number } {
  const chapter = buildTowerStage(floor).chapter;
  const type = isMilestoneFloor(floor) ? 'boss' : 'elite';
  const stars = 2;
  return {
    coins: Math.floor(stageCoinReward(chapter, stars, type) * TOWER.battleDropPct),
    exp: Math.floor(
      stageDrops(TOWER.dropTableId, chapter, stars, type).exp * TOWER.battleDropPct,
    ),
  };
}

describe('通天塔产出折算', () => {
  it('塔的战斗掉落打折且不产通用碎片，秘境不受影响', () => {
    const tower = contextDropScale({ kind: 'tower', floor: 5 });
    expect(tower.coins).toBeLessThan(1);
    expect(tower.exp).toBeLessThan(1);
    expect(tower.universal).toBe(0);

    const realm = contextDropScale({ kind: 'realm', realmId: 'realm_coin', tier: 0 });
    expect(realm).toEqual({ coins: 1, exp: 1, universal: 1 });
  });

  it('从直登点起连爬 20 层、一天两轮，币与经验都不压过当期主线日产目标', () => {
    // 直登点是该进度玩家能站到的最高起点，所以这就是产出的现实上界
    for (const cc of [4, 8, 12, 16] as const) {
      const start = towerEntryFloor(cc);
      let coins = 0;
      let exp = 0;
      for (let f = start; f < start + 20; f++) {
        const d = floorDrop(f);
        coins += d.coins * 2;
        exp += d.exp * 2;
      }
      expect(coins, `通 ${cc} 章从第 ${start} 层起的币产`).toBeLessThan(DAILY_TARGET[cc].coins);
      expect(exp, `通 ${cc} 章从第 ${start} 层起的经验`).toBeLessThan(DAILY_TARGET[cc].exp);
    }
  });
});

describe('通天塔难度曲线是绝对刻度', () => {
  it('关卡强度只由层数决定，玩家变强不会让同一层变难', () => {
    // 隐性 level scaling（Oblivion 式）会把变强的成就感直接抵消掉，这里守死这条线
    for (const f of [1, 20, 50, 100]) {
      expect(buildTowerStage(f).chapter).toBeCloseTo(
        1 + (f - 1) / TOWER.floorsPerChapter, 6,
      );
    }
  });

  it('等效强度对层数严格递增，回头看低层永远是弱的', () => {
    let prev = 0;
    for (let f = 1; f <= 120; f++) {
      const ch = towerEquivalentChapter(f);
      expect(ch, `floor=${f}`).toBeGreaterThan(prev);
      prev = ch;
    }
  });

  it('等效强度算上了难度系数，不等于裸的层数映射', () => {
    // 第 50 层难度系数 1.5+，只看 towerChapter 会低估一章半
    expect(towerEquivalentChapter(50)).toBeGreaterThan(1 + 49 / TOWER.floorsPerChapter);
  });
});

describe('直登层随主线进度', () => {
  it('主线越靠后能直登得越高', () => {
    let prev = 0;
    for (let cc = 1; cc <= 16; cc++) {
      const f = towerEntryFloor(cc);
      expect(f, `cc=${cc}`).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(towerEntryFloor(16)).toBeGreaterThan(towerEntryFloor(4));
  });

  it('直登点稳过：其强度不超过玩家已通关的章节', () => {
    for (let cc = 2; cc <= 16; cc++) {
      expect(towerEquivalentChapter(towerEntryFloor(cc)), `cc=${cc}`)
        .toBeLessThanOrEqual(cc - 1);
    }
  });

  it('直登点是满足条件的最高层，不会保守到还剩一堆空气层', () => {
    for (let cc = 2; cc <= 16; cc++) {
      expect(towerEquivalentChapter(towerEntryFloor(cc) + 1), `cc=${cc}`)
        .toBeGreaterThan(cc - 1);
    }
  });

  it('新号（未通任何章）没得跳，老老实实从第 1 层开始', () => {
    expect(towerEntryFloor(0)).toBe(1);
    expect(towerEntryFloor(1)).toBe(1);
  });
});
