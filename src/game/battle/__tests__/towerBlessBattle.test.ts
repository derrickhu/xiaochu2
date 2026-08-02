/**
 * 灵机在战斗内的实际生效：以「同一场战斗、只换 modifiers」做对照。
 *
 * 这里防的是灵机被聚合出来却没接进战斗（面板显示有、打起来没有）——
 * 这类问题在数据层单测里是看不出来的。
 */
import { describe, it, expect } from 'vitest';
import { BattleController } from '../BattleController';
import { STAGES } from '@/balance/stages';
import { DEFAULT_TEAM } from '@/balance/pets';
import { COMBAT } from '@/balance/combat';
import {
  aggregateBlessModifiers, emptyRunModifiers,
  BIG_MATCH_COUNT, COMBO_MASTER_THRESHOLD, LAST_STAND_HP_PCT,
  type TowerRunModifiers,
} from '@/balance/towerBless';
import type { MatchGroup } from '@/game/board/BoardModel';

const STAGE_ID = STAGES[0].id;
const noCritRng = (): number => 0.99;

function makeCtrl(mods?: TowerRunModifiers): BattleController {
  return new BattleController(
    STAGE_ID, DEFAULT_TEAM, noCritRng, undefined, mods ?? emptyRunModifiers(),
  );
}

/** 用队伍首宠的属性造一组消除，保证一定有人出手 */
function makeGroups(ctrl: BattleController, count: number, groups = 1): MatchGroup[] {
  const element = ctrl.team[0].def.element;
  return Array.from({ length: groups }, () => ({
    orb: element,
    cells: Array.from({ length: count }, (_, i) => ({ r: 0, c: i })),
  }));
}

function turnDamage(ctrl: BattleController, groups: MatchGroup[]): number {
  return ctrl.resolveTurn(groups).attacks.reduce((sum, a) => sum + a.damage, 0);
}

describe('数值类灵机接线', () => {
  it('破军放大全队攻击', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_atk: 3 }));
    expect(buffed.team[0].atk).toBeGreaterThan(base.team[0].atk);
    expect(turnDamage(buffed, makeGroups(buffed, 3)))
      .toBeGreaterThan(turnDamage(base, makeGroups(base, 3)));
  });

  it('磐石抬高最大生命并按比例起手', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_hp: 2 }));
    expect(buffed.heroMaxHp).toBeGreaterThan(base.heroMaxHp);
    expect(buffed.heroHp).toBe(buffed.heroMaxHp);
  });

  it('疾风延长转珠时限，且仍受时限上限约束', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_drag_time: 1 }));
    expect(buffed.dragTimeLimit).toBeGreaterThan(base.dragTimeLimit);
    expect(buffed.dragTimeLimit).toBeLessThanOrEqual(COMBAT.dragTimeMax);
  });

  it('坚壁降低实际承伤', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_dr: 3 }));
    expect(buffed.applyEnemyDamage(1000).damage)
      .toBeLessThan(base.applyEnemyDamage(1000).damage);
  });

  it('速咏压缩技能进 CD 的长度，但至少留 1 回合', () => {
    const ctrl = makeCtrl(aggregateBlessModifiers({ bless_cd: 2 }));
    ctrl.team[0].skillCdLeft = 0;
    ctrl.castSkill(0);
    expect(ctrl.team[0].skillCdLeft).toBe(Math.max(1, ctrl.team[0].skill.cd - 2));
    expect(ctrl.team[0].skillCdLeft).toBeGreaterThanOrEqual(1);
  });

  it('五行真意只放大对应属性', () => {
    const element = makeCtrl().team[0].def.element;
    const base = makeCtrl();
    const matched = makeCtrl(aggregateBlessModifiers({ [`bless_element_${element}`]: 3 }));
    const other = makeCtrl(aggregateBlessModifiers({
      [`bless_element_${element === 'fire' ? 'water' : 'fire'}`]: 3,
    }));
    const baseDmg = turnDamage(base, makeGroups(base, 3));
    expect(turnDamage(matched, makeGroups(matched, 3))).toBeGreaterThan(baseDmg);
    expect(turnDamage(other, makeGroups(other, 3))).toBe(baseDmg);
  });
});

describe('触发类灵机接线', () => {
  it('一击必杀让本回合首次出手必定暴击', () => {
    const ctrl = makeCtrl(aggregateBlessModifiers({ bless_first_crit: 1 }));
    const attacks = ctrl.resolveTurn(makeGroups(ctrl, 3, 2)).attacks;
    expect(attacks[0].isCrit).toBe(true);
    // rng 恒 0.99，后续出手不该被顺带点亮
    expect(attacks[1].isCrit).toBe(false);
  });

  it('连锁大师只在 Combo 达门槛后加伤', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_combo_master: 2 }));
    const low = COMBO_MASTER_THRESHOLD - 1;
    expect(turnDamage(buffed, makeGroups(buffed, 3, low)))
      .toBe(turnDamage(base, makeGroups(base, 3, low)));
    expect(turnDamage(makeCtrl(aggregateBlessModifiers({ bless_combo_master: 2 })),
      makeGroups(buffed, 3, COMBO_MASTER_THRESHOLD)))
      .toBeGreaterThan(turnDamage(makeCtrl(), makeGroups(base, 3, COMBO_MASTER_THRESHOLD)));
  });

  it('背水只在残血时生效', () => {
    const healthy = makeCtrl(aggregateBlessModifiers({ bless_last_stand: 2 }));
    const base = makeCtrl();
    expect(turnDamage(healthy, makeGroups(healthy, 3)))
      .toBe(turnDamage(base, makeGroups(base, 3)));

    const dying = makeCtrl(aggregateBlessModifiers({ bless_last_stand: 2 }));
    dying.heroHp = Math.floor(dying.heroMaxHp * LAST_STAND_HP_PCT * 0.5);
    expect(turnDamage(dying, makeGroups(dying, 3)))
      .toBeGreaterThan(turnDamage(makeCtrl(), makeGroups(base, 3)));
  });

  it('余烬在击败敌人时回血', () => {
    const ctrl = makeCtrl(aggregateBlessModifiers({ bless_ember: 3 }));
    ctrl.heroHp = Math.floor(ctrl.heroMaxHp * 0.4);
    const before = ctrl.heroHp;
    ctrl.applyPetAttack({
      petIndex: 0, element: ctrl.team[0].def.element,
      damage: ctrl.enemy.hp, isCrit: false, counter: 0,
    });
    expect(ctrl.heroHp).toBeGreaterThan(before);
  });

  it('势如破竹压低开局冷却，让首回合就能出手', () => {
    const base = makeCtrl();
    const rush = makeCtrl(aggregateBlessModifiers({ bless_rush: 2 }));
    expect(rush.team[0].skillCdLeft).toBeLessThan(base.team[0].skillCdLeft);
  });

  it('雷霆只为大消除追加真伤', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_thunder: 2 }));
    const small = BIG_MATCH_COUNT - 1;
    expect(turnDamage(buffed, makeGroups(buffed, small)))
      .toBe(turnDamage(base, makeGroups(base, small)));
    expect(turnDamage(makeCtrl(aggregateBlessModifiers({ bless_thunder: 2 })),
      makeGroups(buffed, BIG_MATCH_COUNT)))
      .toBeGreaterThan(turnDamage(makeCtrl(), makeGroups(base, BIG_MATCH_COUNT)));
  });

  it('心火按本回合心珠数加伤，没消心珠则无变化', () => {
    const base = makeCtrl();
    const buffed = makeCtrl(aggregateBlessModifiers({ bless_heart_fire: 3 }));
    const plain = makeGroups(buffed, 3);
    expect(turnDamage(buffed, plain)).toBe(turnDamage(base, makeGroups(base, 3)));

    const withHeart = makeCtrl(aggregateBlessModifiers({ bless_heart_fire: 3 }));
    const groups: MatchGroup[] = [
      ...makeGroups(withHeart, 3),
      { orb: 'heart', cells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 1, c: 2 }] },
    ];
    const heartBase = makeCtrl();
    expect(turnDamage(withHeart, groups)).toBeGreaterThan(turnDamage(heartBase, groups));
  });

  it('复仇受击攒栈、出手即清', () => {
    const ctrl = makeCtrl(aggregateBlessModifiers({ bless_revenge: 2 }));
    expect(ctrl.revengeStacks).toBe(0);
    ctrl.applyEnemyDamage(500);
    ctrl.applyEnemyDamage(500);
    expect(ctrl.revengeStacks).toBe(2);

    const plain = makeCtrl();
    const groups = makeGroups(ctrl, 3);
    expect(turnDamage(ctrl, groups)).toBeGreaterThan(turnDamage(plain, groups));
    expect(ctrl.revengeStacks).toBe(0);
  });

  it('收割只对残血敌人加伤', () => {
    const base = makeCtrl();
    const full = makeCtrl(aggregateBlessModifiers({ bless_reaper: 2 }));
    const groups = makeGroups(full, 3);
    expect(turnDamage(full, groups)).toBe(turnDamage(base, groups));

    const vsDying = makeCtrl(aggregateBlessModifiers({ bless_reaper: 2 }));
    vsDying.enemy.hp = Math.floor(vsDying.enemy.maxHp * 0.1);
    const plainVsDying = makeCtrl();
    plainVsDying.enemy.hp = Math.floor(plainVsDying.enemy.maxHp * 0.1);
    expect(turnDamage(vsDying, groups)).toBeGreaterThan(turnDamage(plainVsDying, groups));
  });
});

describe('无灵机时与旧行为一致', () => {
  it('空修正不改变任何战斗数值', () => {
    const withEmpty = makeCtrl(emptyRunModifiers());
    const legacy = new BattleController(STAGE_ID, DEFAULT_TEAM, noCritRng);
    expect(withEmpty.heroMaxHp).toBe(legacy.heroMaxHp);
    expect(withEmpty.team.map((p) => p.atk)).toEqual(legacy.team.map((p) => p.atk));
    expect(withEmpty.dragTimeLimit).toBe(legacy.dragTimeLimit);
    expect(turnDamage(withEmpty, makeGroups(withEmpty, 4)))
      .toBe(turnDamage(legacy, makeGroups(legacy, 4)));
  });
});
