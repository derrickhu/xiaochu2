/**
 * 养成闭环存档测试：无 wx/tt 环境下 Platform 存储为 no-op，PlayerData 纯内存运行。
 * 单文件内共享单例状态，断言均为相对变化，保证顺序无关。
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { PlayerData } from '../PlayerData';
import { PETS, PET_MAP, DEFAULT_TEAM } from '@/balance/pets';
import { ECONOMY } from '@/balance/economy';
import { STAGE_MAP } from '@/balance/stages';

beforeAll(() => {
  PlayerData.load();
});

describe('初始存档', () => {
  it('初始拥有默认阵容', () => {
    for (const id of DEFAULT_TEAM) {
      expect(PlayerData.isOwned(id)).toBe(true);
    }
    expect(PlayerData.codexCount).toBeGreaterThanOrEqual(DEFAULT_TEAM.length);
  });

  it('商店池为已拥有灵宠，召唤池覆盖全花名册', () => {
    expect(PlayerData.shopPoolIds().length).toBe(PlayerData.ownedPets.length);
    for (const id of PlayerData.shopPoolIds()) {
      expect(PlayerData.isOwned(id)).toBe(true);
    }
    expect(PlayerData.gachaPoolIds().length).toBe(PETS.length);
  });

  it('编队默认非空且均为已拥有', () => {
    expect(PlayerData.team.length).toBeGreaterThan(0);
    for (const id of PlayerData.team) expect(PlayerData.isOwned(id)).toBe(true);
  });
});

describe('招募', () => {
  it('灵宠币不足时招募失败', () => {
    expect(PlayerData.coins).toBe(0);
    expect(PlayerData.recruit()).toBeNull();
  });

  it('足额招募解锁下一只新宠', () => {
    PlayerData.recordClear('stage_1_1', 3, 100000); // 注资
    const next = PlayerData.nextRecruit();
    expect(next).not.toBeNull();
    const before = PlayerData.ownedPets.length;
    const r = PlayerData.recruit();
    expect(r?.duplicate).toBe(false);
    expect(r?.petId).toBe(next);
    expect(PlayerData.ownedPets.length).toBe(before + 1);
    expect(PlayerData.isOwned(next!)).toBe(true);
  });
});

describe('升级 / 升星', () => {
  const pet = DEFAULT_TEAM[0];

  it('经验足够可升级，等级 +1 并扣经验', () => {
    PlayerData.addExp(100000);
    const lv = PlayerData.petLevel(pet);
    const expBefore = PlayerData.exp;
    expect(PlayerData.levelUp(pet)).toBe(true);
    expect(PlayerData.petLevel(pet)).toBe(lv + 1);
    expect(PlayerData.exp).toBeLessThan(expBefore);
  });

  it('碎片足够可升星，星级 +1 并扣碎片', () => {
    PlayerData.addShards(pet, 1000);
    const star = PlayerData.petStar(pet);
    const shardsBefore = PlayerData.petShards(pet);
    expect(PlayerData.canStarUp(pet)).toBe(true);
    expect(PlayerData.starUp(pet)).toBe(true);
    expect(PlayerData.petStar(pet)).toBe(star + 1);
    expect(PlayerData.petShards(pet)).toBeLessThan(shardsBefore);
  });

  it('碎片不足不可升星', () => {
    const other = DEFAULT_TEAM[1];
    expect(PlayerData.petShards(other)).toBe(0);
    expect(PlayerData.canStarUp(other)).toBe(false);
    expect(PlayerData.starUp(other)).toBe(false);
  });

  it('通用碎片按稀有度折算补齐缺口，未开启则拒绝', () => {
    const target = DEFAULT_TEAM[2];
    const plan0 = PlayerData.starUpPlan(target)!;
    expect(plan0.shortfall).toBe(plan0.cost);
    const rate = ECONOMY.universal.exchangeRate[PET_MAP.get(target)!.rarity] ?? 1;
    expect(plan0.universalCost).toBe(plan0.cost * rate);
    expect(plan0.affordable).toBe(false);

    // 通用碎片不够 → 仍然拒绝
    PlayerData.addUniversalShards(plan0.universalCost - 1);
    expect(PlayerData.starUp(target, true)).toBe(false);

    PlayerData.addUniversalShards(1);
    const star = PlayerData.petStar(target);
    // 未显式开启通用碎片时保持旧行为（纯本体碎片口径）
    expect(PlayerData.starUp(target)).toBe(false);
    expect(PlayerData.starUp(target, true)).toBe(true);
    expect(PlayerData.petStar(target)).toBe(star + 1);
    expect(PlayerData.universalShards).toBe(0);
  });
});

describe('未拥有宠碎片暂存（修复丢弃）', () => {
  it('给未拥有宠加碎片进暂存，解锁后并入', () => {
    const unowned = PETS.find((p) => !PlayerData.isOwned(p.id));
    expect(unowned).toBeTruthy();
    PlayerData.addShards(unowned!.id, 7);
    expect(PlayerData.petShards(unowned!.id)).toBe(7);
  });
});

describe('Boss 直掉解锁', () => {
  it('unlockPet 仅首次返回 true', () => {
    const unowned = PETS.find((p) => !PlayerData.isOwned(p.id));
    expect(unowned).toBeTruthy();
    expect(PlayerData.unlockPet(unowned!.id)).toBe(true);
    expect(PlayerData.isOwned(unowned!.id)).toBe(true);
    expect(PlayerData.unlockPet(unowned!.id)).toBe(false);
  });
});

describe('抽卡（灵玉）', () => {
  it('单抽扣除灵玉并返回结果', () => {
    PlayerData.addLingyu(ECONOMY.gacha.singleCost); // 注资保证可抽
    const before = PlayerData.lingyu;
    const o = PlayerData.pullGachaSingle(() => 0);
    expect(o).not.toBeNull();
    expect(PlayerData.lingyu).toBe(before - ECONOMY.gacha.singleCost);
  });

  it('灵玉不足时单抽返回 null', () => {
    while (PlayerData.lingyu >= ECONOMY.gacha.singleCost) {
      PlayerData.pullGachaSingle(() => 0);
    }
    expect(PlayerData.pullGachaSingle(() => 0)).toBeNull();
  });
});

describe('里程碑与货币', () => {
  it('首通关卡发放灵玉，重复通关不再发', () => {
    const stageId = 'stage_1_3';
    const before = PlayerData.lingyu;
    const granted = PlayerData.recordClear(stageId, 1, 0);
    expect(granted).toBeGreaterThan(0);
    expect(PlayerData.lingyu).toBe(before + granted);
    expect(PlayerData.recordClear(stageId, 1, 0)).toBe(0);
  });

  it('spendCoins 不足返回 false', () => {
    expect(PlayerData.spendCoins(PlayerData.coins + 1)).toBe(false);
  });

  it('图鉴里程碑：每拥有满 codexEvery 只发一次灵玉，且不重复发', () => {
    const every = ECONOMY.milestone.codexEvery;
    PlayerData.claimCodexMilestones();

    const unowned = PETS.filter((p) => !PlayerData.isOwned(p.id)).map((p) => p.id);
    expect(unowned.length).toBeGreaterThanOrEqual(every);

    const start = PlayerData.codexMilestoneProgress.count;
    const need = (Math.floor(start / every) + 1) * every - start;
    for (let i = 0; i < need - 1; i++) PlayerData.unlockPet(unowned[i]);
    expect(PlayerData.claimCodexMilestones()).toBe(0);
    PlayerData.unlockPet(unowned[need - 1]);
    const before = PlayerData.lingyu;
    const granted = PlayerData.claimCodexMilestones();
    expect(granted).toBe(ECONOMY.milestone.codexLingyu);
    expect(PlayerData.lingyu).toBe(before + granted);
    expect(PlayerData.claimCodexMilestones()).toBe(0);
  });
});

describe('抖音侧边栏复访奖励', () => {
  it('每日仅可领取一次灵玉', () => {
    const before = PlayerData.lingyu;
    expect(PlayerData.sidebarRewardClaimedToday).toBe(false);
    expect(PlayerData.claimSidebarReward()).toBe(true);
    expect(PlayerData.lingyu).toBe(before + ECONOMY.sidebar.lingyuReward);
    expect(PlayerData.sidebarRewardClaimedToday).toBe(true);
    expect(PlayerData.claimSidebarReward()).toBe(false);
  });
});

describe('GM 跳关解锁', () => {
  it('gmUnlockUpTo 解锁目标关且不污染经济', () => {
    const coinsBefore = PlayerData.coins;
    const lingyuBefore = PlayerData.lingyu;
    const r = PlayerData.gmUnlockUpTo(4, 1);
    expect(r.targetId).toBe('stage_4_1');
    expect(PlayerData.isChapterUnlocked(4)).toBe(true);
    expect(PlayerData.isUnlocked(STAGE_MAP.get('stage_4_1')!)).toBe(true);
    expect(PlayerData.isCleared('stage_3_8')).toBe(true);
    expect(PlayerData.starsOf('stage_3_8')).toBe(3);
    expect(PlayerData.isCleared('stage_4_1')).toBe(false);
    expect(PlayerData.coins).toBe(coinsBefore);
    expect(PlayerData.lingyu).toBe(lingyuBefore);
  });
});
