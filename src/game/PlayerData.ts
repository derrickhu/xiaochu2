/**
 * 玩家本地存档：关卡进度、灵宠币/经验、灵宠拥有与养成（等级/星级/碎片）、编队
 *
 * 写入走 Platform.setStorageAsync（不阻塞主线程）。
 * 养成闭环单一真源：拥有/等级/星级/碎片只在此读写，UI 与战斗均读此处。
 */
import { Platform } from '@/core/PlatformService';
import { STAGES, type StageDef } from '@/balance/stages';
import {
  PETS, PET_MAP, DEFAULT_TEAM, TEAM_SIZE,
  INITIAL_PET_LEVEL, INITIAL_PET_STAR,
} from '@/balance/pets';
import type { Element } from '@/balance/combat';
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';
import { recruitPrice, starUpShardCost } from '@/formulas/economyOutput';
import { petExpToNext } from '@/formulas/growth';
import {
  initialData,
  LEGACY_SAVE_KEY,
  migrateLegacySave,
  parseSaveData,
  SAVE_KEY,
  type OwnedPet,
  type RecruitResult,
  type SaveData,
} from './playerSave';
import {
  addLingyu as addLingyuToSave,
  gachaPoolPets as gachaPoolPetsFromSave,
  pullGachaSingle as pullGachaSingleFromSave,
  pullGachaTen as pullGachaTenFromSave,
  unlockPetInSave,
  type PullOutcome,
} from './playerGacha';

export type { OwnedPet, RecruitResult } from './playerSave';

class PlayerDataClass {
  private _data: SaveData = initialData();
  private _loaded = false;

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const raw = Platform.getStorageSync(SAVE_KEY);
      if (raw) {
        this._data = parseSaveData(JSON.parse(raw));
        return;
      }
      // 旧档（v1）迁移：补出拥有系统，原队伍宠物保底入手
      const legacy = Platform.getStorageSync(LEGACY_SAVE_KEY);
      if (legacy) {
        this._data = migrateLegacySave(JSON.parse(legacy));
        this._save();
      }
    } catch (e) {
      console.warn('[PlayerData] 存档解析失败，使用初始数据', e);
      this._data = initialData();
    }
  }

  // ═══════════ 拥有 / 养成 ═══════════

  /** 已拥有灵宠 id（按 PETS 表顺序，UI 稳定） */
  get ownedPets(): readonly string[] {
    return PETS.filter((p) => this._data.ownedPets[p.id]).map((p) => p.id);
  }

  isOwned(petId: string): boolean {
    return !!this._data.ownedPets[petId];
  }

  getOwned(petId: string): OwnedPet | undefined {
    return this._data.ownedPets[petId];
  }

  petLevel(petId: string): number {
    return this._data.ownedPets[petId]?.level ?? INITIAL_PET_LEVEL;
  }

  petStar(petId: string): number {
    return this._data.ownedPets[petId]?.star ?? INITIAL_PET_STAR;
  }

  petShards(petId: string): number {
    const o = this._data.ownedPets[petId];
    if (o) return o.shards;
    return this._data.pendingShards[petId] ?? 0;
  }

  get exp(): number {
    return this._data.exp;
  }

  /** 升级到下一级所需经验（已满级返回 null） */
  levelUpCost(petId: string): number | null {
    const o = this._data.ownedPets[petId];
    if (!o) return null;
    if (o.level >= getStarProfile(o.star).maxLevel) return null;
    return petExpToNext(o.level);
  }

  canLevelUp(petId: string): boolean {
    const cost = this.levelUpCost(petId);
    return cost !== null && this._data.exp >= cost;
  }

  levelUp(petId: string): boolean {
    const cost = this.levelUpCost(petId);
    if (cost === null || this._data.exp < cost) return false;
    this._data.exp -= cost;
    this._data.ownedPets[petId].level++;
    this._save();
    return true;
  }

  /** 升星所需碎片（满星 / 未拥有返回 null） */
  starUpCost(petId: string): number | null {
    const o = this._data.ownedPets[petId];
    if (!o) return null;
    return starUpShardCost(o.star);
  }

  canStarUp(petId: string): boolean {
    const cost = this.starUpCost(petId);
    return cost !== null && this.petShards(petId) >= cost;
  }

  starUp(petId: string): boolean {
    const cost = this.starUpCost(petId);
    const o = this._data.ownedPets[petId];
    if (!o || cost === null || o.shards < cost) return false;
    o.shards -= cost;
    o.star++;
    this._save();
    return true;
  }

  addExp(amount: number): void {
    if (amount <= 0) return;
    this._data.exp += Math.floor(amount);
    this._save();
  }

  addShards(petId: string, amount: number): void {
    if (amount <= 0 || !PET_MAP.has(petId)) return;
    const o = this._data.ownedPets[petId];
    if (o) {
      o.shards += Math.floor(amount);
    } else {
      // 未拥有宠：碎片进暂存账本，解锁时并入（修复碎片丢弃）
      this._data.pendingShards[petId] =
        (this._data.pendingShards[petId] ?? 0) + Math.floor(amount);
    }
    this._save();
  }

  // ═══════════ 招募 ═══════════

  /** 招募解锁顺序：未在初始阵容的灵宠，按稀有度升序（同档按 PETS 顺序） */
  private get _recruitOrder(): string[] {
    return PETS
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !DEFAULT_TEAM.includes(p.id))
      .sort((a, b) => a.p.rarity - b.p.rarity || a.i - b.i)
      .map(({ p }) => p.id);
  }

  /** 下一只可招募的灵宠 id（全部拥有返回 null） */
  nextRecruit(): string | null {
    return this._recruitOrder.find((id) => !this.isOwned(id)) ?? null;
  }

  /** 下一次招募定价 */
  nextRecruitPrice(): number {
    return recruitPrice(this._data.recruitedCount);
  }

  get coins(): number {
    return this._data.coins;
  }

  /** 扣灵宠币（不足返回 false） */
  spendCoins(amount: number): boolean {
    if (amount <= 0) return true;
    if (this._data.coins < amount) return false;
    this._data.coins -= Math.floor(amount);
    this._save();
    return true;
  }

  get recruitedCount(): number {
    return this._data.recruitedCount;
  }

  /** 招募：扣币，解锁下一只；若已全收集则转碎片给最高稀有拥有宠 */
  recruit(): RecruitResult | null {
    const price = this.nextRecruitPrice();
    if (this._data.coins < price) return null;

    const target = this.nextRecruit();
    if (target) {
      this._data.coins -= price;
      this._data.ownedPets[target] = {
        level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0,
      };
      this._data.recruitedCount++;
      this._save();
      return { petId: target, duplicate: false };
    }

    // 全收集 → 重复招募转碎片
    const dupId = this._dupShardTarget();
    if (!dupId) return null;
    this._data.coins -= price;
    const shards = ECONOMY.recruit.duplicateShards;
    this._data.ownedPets[dupId].shards += shards;
    this._data.recruitedCount++;
    this._save();
    return { petId: dupId, duplicate: true, shards };
  }

  /** 碎片溢出目标：最高稀有的拥有宠（同档取 PETS 顺序首个） */
  private _dupShardTarget(): string | null {
    const owned = this.ownedPets;
    if (owned.length === 0) return null;
    return [...owned].sort((a, b) => (PET_MAP.get(b)!.rarity - PET_MAP.get(a)!.rarity))[0];
  }

  // ═══════════ 抽卡（灵玉） ═══════════

  get lingyu(): number {
    return this._data.lingyu;
  }

  get tickets(): number {
    return this._data.tickets;
  }

  /** 抽卡硬保底计数（已连续未出 SSR+ 抽数） */
  get gachaSinceHigh(): number {
    return this._data.gachaSinceHigh;
  }

  addLingyu(amount: number): void {
    if (!addLingyuToSave(this._data, amount)) return;
    this._save();
  }

  /** 单抽：扣灵玉，结算保底/重复转碎片。灵玉不足返回 null。element 限定五行召唤池 */
  pullGachaSingle(rng: () => number = Math.random, element?: Element): PullOutcome | null {
    const outcome = pullGachaSingleFromSave(this._data, rng, element);
    if (!outcome) return null;
    this._save();
    return outcome;
  }

  /** 十连：扣灵玉，含 SR+ 保底。灵玉不足返回 null。element 限定五行召唤池 */
  pullGachaTen(rng: () => number = Math.random, element?: Element): PullOutcome[] | null {
    const outcomes = pullGachaTenFromSave(this._data, rng, element);
    if (!outcomes) return null;
    this._save();
    return outcomes;
  }

  // ═══════════ 解锁灵宠（Boss 掉落 / 抽卡 / 招募） ═══════════

  /**
   * 解锁一只灵宠（章 Boss 直掉等）。
   * @returns true = 本次新获得（用于结算提示）
   */
  unlockPet(petId: string): boolean {
    if (!PET_MAP.has(petId)) return false;
    if (this.isOwned(petId)) return false;
    unlockPetInSave(this._data, petId);
    this._save();
    return true;
  }

  /** 召唤出货池 = 全花名册 */
  gachaPoolIds(element?: Element): readonly string[] {
    return gachaPoolPetsFromSave(element).map((p) => p.id);
  }

  /** 商店碎片池 = 全花名册（与召唤池一致） */
  shopPoolIds(element?: Element): readonly string[] {
    return this.gachaPoolIds(element);
  }

  // ═══════════ 图鉴 ═══════════

  /** 已收录数量（= 拥有过的灵宠数） */
  get codexCount(): number {
    return this.ownedPets.length;
  }

  /** 图鉴里程碑进度（CodexScene 进度条用；自上次领取后累计） */
  get codexMilestoneProgress(): {
    count: number;
    inCycle: number;
    next: number;
    every: number;
    lingyu: number;
    pendingLingyu: number;
  } {
    const every = ECONOMY.milestone.codexEvery;
    const total = this.ownedPets.length;
    const claimedFloor = Math.floor(this._data.codexRewarded / every);
    const nowFloor = Math.floor(total / every);
    const pendingTiers = nowFloor - claimedFloor;
    const inCycle = total - claimedFloor * every;
    return {
      count: total,
      inCycle: pendingTiers > 0 ? every : inCycle,
      next: (claimedFloor + 1) * every,
      every,
      lingyu: ECONOMY.milestone.codexLingyu,
      pendingLingyu: pendingTiers * ECONOMY.milestone.codexLingyu,
    };
  }

  /**
   * 领取图鉴里程碑：每拥有 codexEvery 只发一次灵玉（仅在图鉴页调用）。
   * @returns 本次发放的灵玉总额（无新里程碑为 0）
   */
  claimCodexMilestones(): number {
    const every = ECONOMY.milestone.codexEvery;
    const total = this.ownedPets.length;
    const claimedFloor = Math.floor(this._data.codexRewarded / every);
    const nowFloor = Math.floor(total / every);
    this._data.codexRewarded = total;
    if (nowFloor <= claimedFloor) {
      this._save();
      return 0;
    }
    const lingyu = (nowFloor - claimedFloor) * ECONOMY.milestone.codexLingyu;
    addLingyuToSave(this._data, lingyu);
    this._save();
    return lingyu;
  }

  // ═══════════ 编队 ═══════════

  get team(): readonly string[] {
    return this._data.team;
  }

  isInTeam(petId: string): boolean {
    return this._data.team.includes(petId);
  }

  /** 上阵；未拥有/满员/已上阵返回 false */
  addToTeam(petId: string): boolean {
    if (!this.isOwned(petId)) return false;
    if (this._data.team.length >= TEAM_SIZE) return false;
    if (this.isInTeam(petId)) return false;
    this._data.team.push(petId);
    this._save();
    return true;
  }

  /** 下阵；至少保留 1 只，最后一只不可移除 */
  removeFromTeam(petId: string): boolean {
    if (this._data.team.length <= 1) return false;
    const idx = this._data.team.indexOf(petId);
    if (idx < 0) return false;
    this._data.team.splice(idx, 1);
    this._save();
    return true;
  }

  // ═══════════ 关卡进度 ═══════════

  starsOf(stageId: string): number {
    return this._data.stars[stageId] ?? 0;
  }

  isCleared(stageId: string): boolean {
    return this.starsOf(stageId) > 0;
  }

  /**
   * 关卡是否解锁：
   * - 第一章第一关恒解锁
   * - 每章首关需前一章 Boss 通关
   * - 章内其余关需前一关已通
   */
  isUnlocked(stage: StageDef): boolean {
    if (stage.index === 1) {
      if (stage.chapter === 1) return true;
      const prevBoss = STAGES.find((s) => s.chapter === stage.chapter - 1 && s.isBoss);
      return prevBoss ? this.isCleared(prevBoss.id) : true;
    }
    const prev = STAGES.find((s) => s.chapter === stage.chapter && s.index === stage.index - 1);
    return prev ? this.isCleared(prev.id) : false;
  }

  /** 章节是否解锁（首关解锁即视为章节解锁） */
  isChapterUnlocked(chapter: number): boolean {
    const first = STAGES.find((s) => s.chapter === chapter && s.index === 1);
    return first ? this.isUnlocked(first) : false;
  }

  /**
   * 通关结算：星数取历史最佳，灵宠币累加；首通额外发灵玉（里程碑产出）。
   * @returns 本次首通发放的灵玉（非首通为 0）
   */
  recordClear(stageId: string, stars: number, coins: number): number {
    const best = this._data.stars[stageId] ?? 0;
    const firstClear = best === 0 && stars > 0;
    if (stars > best) this._data.stars[stageId] = stars;
    this._data.coins += coins;

    let lingyu = 0;
    if (firstClear) {
      const stage = STAGES.find((s) => s.id === stageId);
      lingyu = stage?.isBoss
        ? ECONOMY.milestone.bossFirstClearLingyu
        : ECONOMY.milestone.firstClearLingyu;
      this._data.lingyu += lingyu;
    }
    this._save();
    return lingyu;
  }

  private _save(): void {
    try {
      Platform.setStorageAsync(SAVE_KEY, JSON.stringify(this._data));
    } catch (_) {}
  }
}

export const PlayerData = new PlayerDataClass();
