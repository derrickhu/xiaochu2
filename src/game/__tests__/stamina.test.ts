/**
 * 体力契约测试：惰性恢复口径、上限成长、单场单价（塔免 / 新手章免）、
 * 扣减与广告回体。时间戳全部显式注入，避免依赖真实时钟。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ECONOMY } from '@/balance/economy';
import { STAGE_MAP } from '@/balance/stages';
import { AD_PLACEMENTS } from '@/balance/monetization';
import {
  emptyStaminaState, formatCountdown, msToFull, msToNextPoint,
  settleStamina, staminaCap, stageStaminaCost, type StaminaState,
} from '../staminaService';
import { PlayerData } from '../PlayerData';

const STEP_MS = ECONOMY.stamina.regenSeconds * 1000;

describe('体力上限', () => {
  it('按已通关章数成长，第 1 章为基准、第 16 章为基准 +30', () => {
    expect(staminaCap(1)).toBe(ECONOMY.stamina.baseMax);
    expect(staminaCap(16)).toBe(ECONOMY.stamina.baseMax + ECONOMY.stamina.perChapterBonus * 15);
    // 越界不倒扣
    expect(staminaCap(0)).toBe(ECONOMY.stamina.baseMax);
  });
});

describe('体力惰性恢复', () => {
  const cap = 100;

  it('每 regenSeconds 恢复 1 点，余数留到下次不丢秒', () => {
    const st: StaminaState = { value: 10, lastRegenMs: 1_000_000 };
    const now = st.lastRegenMs + STEP_MS * 3 + STEP_MS / 2;
    expect(settleStamina(st, cap, now)).toBe(true);
    expect(st.value).toBe(13);
    // 再过半个周期就该到第 4 点
    expect(settleStamina(st, cap, now + STEP_MS / 2 + 1)).toBe(true);
    expect(st.value).toBe(14);
  });

  it('不足一个周期不加点', () => {
    const st: StaminaState = { value: 10, lastRegenMs: 1_000_000 };
    expect(settleStamina(st, cap, st.lastRegenMs + STEP_MS - 1)).toBe(false);
    expect(st.value).toBe(10);
  });

  it('恢复到上限即封顶，且不攒离线额度', () => {
    const st: StaminaState = { value: 98, lastRegenMs: 1_000_000 };
    const now = st.lastRegenMs + STEP_MS * 50;
    settleStamina(st, cap, now);
    expect(st.value).toBe(cap);
    expect(st.lastRegenMs).toBe(now);
    // 满瓶期间再挂 100 个周期，也不该在掉下来后一次性补满
    settleStamina(st, cap, now + STEP_MS * 100);
    expect(st.value).toBe(cap);
  });

  it('时钟回拨只对齐基准，不白送体力', () => {
    const st: StaminaState = { value: 10, lastRegenMs: 5_000_000 };
    expect(settleStamina(st, cap, 1_000_000)).toBe(true);
    expect(st.value).toBe(10);
    expect(st.lastRegenMs).toBe(1_000_000);
  });

  it('倒计时：下一点与满瓶的剩余时间自洽', () => {
    const st: StaminaState = { value: cap - 3, lastRegenMs: 1_000_000 };
    const now = st.lastRegenMs;
    expect(msToNextPoint(st, cap, now)).toBe(STEP_MS);
    expect(msToFull(st, cap, now)).toBe(STEP_MS * 3);
    const full: StaminaState = { value: cap, lastRegenMs: now };
    expect(msToNextPoint(full, cap, now)).toBe(0);
    expect(msToFull(full, cap, now)).toBe(0);
  });

  it('新号从满瓶起算', () => {
    expect(emptyStaminaState(1).value).toBe(staminaCap(1));
  });

  it('倒计时文案：不足 1 小时用 m:ss，超过用「N 小时 M 分」', () => {
    expect(formatCountdown(65_000)).toBe('1:05');
    expect(formatCountdown(3 * 3600_000 + 5 * 60_000)).toBe('3 小时 5 分');
  });
});

describe('单场体力单价', () => {
  it('主线普通/精英/Boss 按 stageTypes 取价', () => {
    expect(stageStaminaCost({ chapter: 5, type: 'normal' })).toBe(6);
    expect(stageStaminaCost({ chapter: 5, type: 'elite' })).toBe(9);
    expect(stageStaminaCost({ chapter: 5, type: 'boss' })).toBe(12);
  });

  it('第 1 章主线全免（新手不该第一天就卡体力）', () => {
    for (let i = 1; i <= 8; i++) {
      const stage = STAGE_MAP.get(`stage_1_${i}`)!;
      expect(stageStaminaCost(stage)).toBe(0);
    }
    // 第 2 章起开始收费
    expect(stageStaminaCost(STAGE_MAP.get('stage_2_1')!)).toBeGreaterThan(0);
  });

  it('通天塔不耗体力（已被每日重置次数门控，双重门控会劝退）', () => {
    expect(stageStaminaCost({ chapter: 9, type: 'boss' }, { kind: 'tower', floor: 65 })).toBe(0);
  });

  it('秘境按资源关档位收费（有 context，故不吃新手章减免）', () => {
    const cost = stageStaminaCost(
      { chapter: 1, type: 'dailyResource' },
      { kind: 'realm', realmId: 'realm_metal', tier: 1 },
    );
    expect(cost).toBe(8);
  });
});

describe('体力落库与广告回体', () => {
  beforeEach(() => {
    PlayerData.load();
  });

  it('扣体力：不足时整笔拒绝，不做部分扣减', () => {
    const before = PlayerData.stamina;
    expect(PlayerData.consumeStamina(before + 1)).toBe(false);
    expect(PlayerData.stamina).toBe(before);
    expect(PlayerData.consumeStamina(6)).toBe(true);
    expect(PlayerData.stamina).toBe(before - 6);
  });

  it('cost ≤ 0 恒可通过（塔与新手章）', () => {
    expect(PlayerData.hasStamina(0)).toBe(true);
    expect(PlayerData.consumeStamina(0)).toBe(true);
  });

  it('广告回体按次数上限收口，用完返回 false', () => {
    const limit = AD_PLACEMENTS.stamina_refill.dailyLimit;
    expect(PlayerData.staminaAdLeft).toBe(limit);
    for (let i = 0; i < limit; i++) {
      const before = PlayerData.stamina;
      expect(PlayerData.claimStaminaAd()).toBe(true);
      expect(PlayerData.stamina - before).toBe(ECONOMY.stamina.adRefill);
    }
    expect(PlayerData.staminaAdLeft).toBe(0);
    expect(PlayerData.claimStaminaAd()).toBe(false);
  });

  it('广告回体可顶破上限（常规做法，不浪费玩家一次广告）', () => {
    expect(PlayerData.stamina).toBeGreaterThan(PlayerData.staminaMax);
  });
});
