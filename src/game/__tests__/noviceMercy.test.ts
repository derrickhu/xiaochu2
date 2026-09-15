/**
 * 新手保护的行为层规则（灵宠护体 / 空拖不惩罚 / 副玩法入口门 / 解锁通告）
 *
 * 这三条都是抖音首发日的直接产物，共同点是「只对还没学会的人生效，对会玩的人完全无感」。
 * 所以每条都要同时钉住两侧：**保护关生效**、**保护关之外一定不生效**。
 * 少了后半边，日后很容易一路放宽到全局，把整个游戏的容错悄悄拉平。
 */
import { describe, expect, it } from 'vitest';
import { BattleController } from '@/game/battle/BattleController';
import { NOVICE_MERCY, hasNoviceMercy } from '@/balance/powerBudget';
import {
  FEATURE_GATES,
  isFeatureUnlocked,
  markFeatureNoticeSeen,
  pendingFeatureNotices,
} from '@/game/featureGate';
import { isTutorialFlag } from '@/game/tutorialFlags';
import { STAGE_MAP } from '@/balance/stages';
import { PlayerData } from '@/game/PlayerData';

const PROTECTED = NOVICE_MERCY.stageIds[0];
const UNPROTECTED = 'stage_2_1';

describe('灵宠护体', () => {
  it('保护关每场挡一次致死，并把血量抬回预定比例', () => {
    const ctrl = new BattleController(PROTECTED);
    expect(ctrl.noviceMercy).toBe(true);
    expect(ctrl.guardianSavesLeft).toBe(NOVICE_MERCY.guardianSavesPerBattle);

    ctrl.heroHp = 0;
    expect(ctrl.consumeGuardianSave()).toBe(true);
    expect(ctrl.heroHp).toBe(
      Math.floor(ctrl.heroMaxHp * NOVICE_MERCY.guardianRestorePct),
    );
  });

  it('一场只给一次，用完就该正常判失败', () => {
    const ctrl = new BattleController(PROTECTED);
    ctrl.heroHp = 0;
    expect(ctrl.consumeGuardianSave()).toBe(true);
    ctrl.heroHp = 0;
    expect(ctrl.consumeGuardianSave()).toBe(false);
    expect(ctrl.heroHp).toBe(0);
  });

  it('保护关之外一次都不给', () => {
    const ctrl = new BattleController(UNPROTECTED);
    expect(ctrl.noviceMercy).toBe(false);
    expect(ctrl.guardianSavesLeft).toBe(0);
    ctrl.heroHp = 0;
    expect(ctrl.consumeGuardianSave()).toBe(false);
  });
});

describe('空拖不惩罚', () => {
  it('退还刚记上的回合并回到玩家回合', () => {
    const ctrl = new BattleController(PROTECTED);
    ctrl.beginResolve();
    expect(ctrl.turnsUsed).toBe(1);

    ctrl.refundFruitlessTurn();
    expect(ctrl.turnsUsed).toBe(0);
    expect(ctrl.state).toBe('playerTurn');
  });

  it('回合数不会被退成负数', () => {
    const ctrl = new BattleController(PROTECTED);
    ctrl.refundFruitlessTurn();
    ctrl.refundFruitlessTurn();
    expect(ctrl.turnsUsed).toBe(0);
  });

  it('只在保护关名单内生效', () => {
    expect(hasNoviceMercy(PROTECTED)).toBe(true);
    expect(hasNoviceMercy(UNPROTECTED)).toBe(false);
  });
});

describe('副玩法入口门', () => {
  it('解锁条件指向真实存在的关卡', () => {
    for (const gate of Object.values(FEATURE_GATES)) {
      expect(STAGE_MAP.get(gate.requiresStageId), `${gate.name} 的前置关卡不存在`).toBeTruthy();
    }
  });

  it('开放与否严格等于前置关卡是否通关', () => {
    for (const gate of Object.values(FEATURE_GATES)) {
      expect(isFeatureUnlocked(gate.id)).toBe(PlayerData.isCleared(gate.requiresStageId));
    }
  });

  it('未通过前置关的档案看不到入口', () => {
    for (const gate of Object.values(FEATURE_GATES)) {
      if (PlayerData.isCleared(gate.requiresStageId)) continue;
      expect(isFeatureUnlocked(gate.id), `${gate.name} 在前置未通关时仍开放`).toBe(false);
    }
  });

  it('通天塔的门不早于秘境（塔是更深的长线内容）', () => {
    const realmStage = STAGE_MAP.get(FEATURE_GATES.realm.requiresStageId)!;
    const towerStage = STAGE_MAP.get(FEATURE_GATES.tower.requiresStageId)!;
    const rank = (s: { chapter: number; index: number }): number => s.chapter * 100 + s.index;
    expect(rank(towerStage)).toBeGreaterThan(rank(realmStage));
  });
});

describe('解锁通告', () => {
  it('每个门都有已登记的 flag 和成句的文案', () => {
    for (const gate of Object.values(FEATURE_GATES)) {
      expect(isTutorialFlag(gate.noticeFlag), `${gate.name} 的通告 flag 未登记`).toBe(true);
      /*
       * 只写「XX 已解锁！」等于没说：玩家点进一个不知道干什么的模式，还是白跑一趟。
       * 用长度和模式名兜底，卡住「文案被改回一句空话」这种回归。
       */
      expect(gate.notice.length, `${gate.name} 的通告太短，没交代清楚是什么`)
        .toBeGreaterThan(20);
      expect(gate.notice).toContain(gate.name);
    }
  });

  it('两条通告用的不是同一个 flag（否则弹了一个另一个永远不弹）', () => {
    const flags = Object.values(FEATURE_GATES).map((g) => g.noticeFlag);
    expect(new Set(flags).size).toBe(flags.length);
  });

  it('待通告清单只含已解锁且未看过的模式', () => {
    for (const gate of pendingFeatureNotices()) {
      expect(isFeatureUnlocked(gate.id), `${gate.name} 还没解锁却进了待通告清单`).toBe(true);
      expect(PlayerData.isTutorialDone(gate.noticeFlag), `${gate.name} 已看过却仍在清单里`)
        .toBe(false);
    }
  });

  it('标记看过之后不再出现在待通告清单里', () => {
    const gate = FEATURE_GATES.realm;
    markFeatureNoticeSeen(gate.id);
    expect(PlayerData.isTutorialDone(gate.noticeFlag)).toBe(true);
    expect(pendingFeatureNotices().map((g) => g.id)).not.toContain(gate.id);
  });
});
