/**
 * 消珠充能的关键规则回归
 *
 * 这套系统换掉回合 CD 的全部理由，是「玩家这一回合怎么消」要能改变
 * 「下一次技能什么时候到」。下面几条就是这个因果链上不能断的环：
 * 断了任何一条，充能就退化成一个换了皮的回合 CD。
 */
import { describe, expect, it } from 'vitest';
import type { Element } from '@/balance/combat';
import {
  CHARGE_PER_TURN_BASELINE, CHARGE_TURN_CAP_MULT, HASTE_CHARGE_PCT,
  chargeMaxForCd, hasteChargeGain, hasteChargePctLabel, turnChargeGain,
} from '@/balance/skillCharge';
import { BattleController } from '../BattleController';
import type { MatchGroup } from '@/game/board/BoardModel';

const STAGE = 'stage_1_1';

function group(orb: Element | 'heart', cells: number): MatchGroup {
  return {
    orb,
    cells: Array.from({ length: cells }, (_, i) => ({ r: 0, c: i })),
    waveIndex: 0,
  };
}

/** 队伍里某只宠的属性，以及一个「不是它」的属性（用于对照异色充能） */
function pickElements(ctrl: BattleController): { own: Element; other: Element } {
  const own = ctrl.team[0].def.element;
  const other = ctrl.team.find((p) => p.def.element !== own)!.def.element;
  return { own, other };
}

describe('消珠充能', () => {
  it('开局不是全员就绪，短关也不会整场放不出技能', () => {
    const ctrl = new BattleController(STAGE);
    expect(ctrl.team.length).toBeGreaterThan(0);
    for (let i = 0; i < ctrl.team.length; i++) {
      // 开局给了一截起始充能，但谁都不该直接就绪（否则开场五宠齐射秒推）
      expect(ctrl.canCastSkill(i), '开局就有技能可放').toBe(false);
      expect(ctrl.team[i].charge).toBeGreaterThan(0);
    }
  });

  it('消本色珠比消同样数量的异色珠充能明显更多', () => {
    const { own, other } = pickElements(new BattleController(STAGE));

    const sameRun = new BattleController(STAGE);
    const before = sameRun.team[0].charge;
    sameRun.resolveTurn([group(own, 5)]);
    const sameGain = sameRun.team[0].charge - before;

    const otherRun = new BattleController(STAGE);
    otherRun.resolveTurn([group(other, 5)]);
    const otherGain = otherRun.team[0].charge - before;

    /*
     * 这条差距就是玩家能看见的那个反馈：喂本色 → 那一条跳一大截。
     * 一旦本色与异色收益拉不开，「该喂哪只宠」这个决定就不存在了。
     */
    expect(sameGain).toBeGreaterThan(otherGain * 1.5);
  });

  it('单回合充能有上限，一次超大连锁不能直接充满', () => {
    const ctrl = new BattleController(STAGE);
    const { own } = pickElements(ctrl);
    const before = ctrl.team[0].charge;
    // 夸张到不可能出现的一盘：仍不得越过单回合上限
    ctrl.resolveTurn([group(own, 12), group(own, 12), group(own, 12)]);
    const gain = ctrl.team[0].charge - before;
    expect(gain).toBeLessThanOrEqual(
      Math.round(CHARGE_PER_TURN_BASELINE * CHARGE_TURN_CAP_MULT),
    );
  });

  it('充能满即可释放，释放后清零', () => {
    const ctrl = new BattleController(STAGE);
    const { own } = pickElements(ctrl);
    const index = 0;
    for (let turn = 0; turn < 20 && !ctrl.canCastSkill(index); turn++) {
      ctrl.resolveTurn([group(own, 4), group('heart', 3)]);
      ctrl.state = 'playerTurn';
    }
    expect(ctrl.canCastSkill(index), '20 回合内都没充满').toBe(true);
    ctrl.castSkill(index);
    expect(ctrl.team[index].charge).toBe(0);
    expect(ctrl.canCastSkill(index)).toBe(false);
  });

  it('充能不会溢出上限', () => {
    const ctrl = new BattleController(STAGE);
    const { own } = pickElements(ctrl);
    for (let turn = 0; turn < 30; turn++) {
      ctrl.resolveTurn([group(own, 5)]);
      ctrl.state = 'playerTurn';
    }
    for (const pet of ctrl.team) {
      expect(pet.charge).toBeLessThanOrEqual(pet.chargeMax);
    }
  });

  it('cd 换算与回合折算互为逆运算，灵机减 CD 才不会走偏', () => {
    for (const cd of [3, 5, 6, 8]) {
      expect(chargeMaxForCd(cd)).toBe(cd * CHARGE_PER_TURN_BASELINE);
    }
  });

  it('消不到任何有效珠时不给保底充能', () => {
    expect(turnChargeGain(0, 0)).toBe(0);
    expect(turnChargeGain(0, 1)).toBeGreaterThan(0);
  });

  it('连携按各宠充能条百分比灌能，不再按固定回合折算', () => {
    expect(HASTE_CHARGE_PCT).toBe(0.2);
    expect(hasteChargePctLabel(1)).toBe('20%');
    expect(hasteChargeGain(160, 1)).toBe(32);
    expect(hasteChargeGain(224, 1)).toBe(45);
    expect(hasteChargeGain(160, 0)).toBe(0);
  });
});
