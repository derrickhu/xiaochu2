/**
 * 解锁通告的存档迁移（回归测试）
 *
 * ── 这里护住的是一个真实踩过的 bug ──
 *
 * 解锁通告 flag 一开始是直接塞进 tutorial 存档、跟着老档豁免走的。
 * 而老档豁免的判据是 `veteran = 有任何通关记录`，于是：
 * 一个通到 1-6 的玩家被算作老玩家 → 全部 flag 标完成 → 通天塔的通告在他
 * **还没有**通天塔的时候就被标成看过 → 他真通了第 1 章，底栏凭空多一格，一句话都没有。
 *
 * 正确判据是「这个存档里该功能当时是否已经开着」。下面每条用例都对着这个判据。
 */
import { describe, expect, it } from 'vitest';
import { sanitizeTutorial, TUTORIAL_FLAGS } from '@/game/tutorialFlags';
import { FEATURE_GATES, featureNoticeSeed } from '@/balance/featureGates';

const REALM_FLAG = FEATURE_GATES.realm.noticeFlag;
const TOWER_FLAG = FEATURE_GATES.tower.noticeFlag;

/** 造一份「通到 stage_1_N」的星数表 */
function starsUpTo(index: number): Record<string, number> {
  const stars: Record<string, number> = {};
  for (let i = 1; i <= index; i++) stars[`stage_1_${i}`] = 3;
  return stars;
}

function migrate(stars: Record<string, number>, rawTutorial: unknown = {}): Record<string, boolean> {
  const veteran = Object.keys(stars).length > 0;
  return sanitizeTutorial(
    rawTutorial,
    veteran,
    featureNoticeSeed((stageId) => (stars[stageId] ?? 0) > 0),
  );
}

describe('解锁通告的老档迁移', () => {
  it('通到 1-6 的老档：秘境已开过 → 不再通告；通天塔还没开 → 通告留着', () => {
    const flags = migrate(starsUpTo(6));
    expect(flags[REALM_FLAG], '秘境在旧版本里一直摆在他底栏，不该再弹').toBe(true);
    expect(flags[TOWER_FLAG], '他还没有通天塔，通告不能提前被吞掉').toBeUndefined();
  });

  it('通到 1-3 的老档：两个入口都还没开过 → 两条通告都留着', () => {
    const flags = migrate(starsUpTo(3));
    expect(flags[REALM_FLAG]).toBeUndefined();
    expect(flags[TOWER_FLAG]).toBeUndefined();
  });

  it('已通关第 1 章的老档：两个入口都用过 → 两条都不弹', () => {
    const flags = migrate(starsUpTo(8));
    expect(flags[REALM_FLAG]).toBe(true);
    expect(flags[TOWER_FLAG]).toBe(true);
  });

  it('全新档：没有任何通关记录 → 两条通告都留着', () => {
    const flags = migrate({});
    expect(flags[REALM_FLAG]).toBeUndefined();
    expect(flags[TOWER_FLAG]).toBeUndefined();
  });

  it('老档豁免仍然覆盖教学 flag（别把这个一起改坏了）', () => {
    const flags = migrate(starsUpTo(6));
    expect(flags[TUTORIAL_FLAGS.dragHint], '推到第 6 关的人不该重吃拖珠示意').toBe(true);
    expect(flags[TUTORIAL_FLAGS.homeStart]).toBe(true);
  });

  it('新档不吃教学豁免', () => {
    const flags = migrate({});
    expect(flags[TUTORIAL_FLAGS.dragHint]).toBeUndefined();
  });

  it('玩家真看过的通告不因迁移逻辑变动而重弹', () => {
    // 通到 1-3（通天塔未开），但存档里已记着看过 —— 保留，别覆盖成未看过
    const flags = migrate(starsUpTo(3), { [TOWER_FLAG]: true });
    expect(flags[TOWER_FLAG]).toBe(true);
  });

  it('未登记的野 key 一律丢弃', () => {
    const flags = migrate({}, { someRemovedFlag: true });
    expect(flags.someRemovedFlag).toBeUndefined();
  });
});
