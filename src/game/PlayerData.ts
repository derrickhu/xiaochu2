/**
 * 玩家本地存档：关卡进度、灵宠币/经验、灵宠拥有与养成（等级/星级/碎片）、编队
 *
 * 写入走 Platform.setStorageAsync（不阻塞主线程）。
 * 养成闭环单一真源：拥有/等级/星级/碎片只在此读写，UI 与战斗均读此处。
 */
import { Platform } from '@/core/PlatformService';
import { PersistService } from '@/core/PersistService';
import { localDateKey } from '@/core/SidebarService';
import { STAGES, CHAPTER_REWARD_PET, type StageDef } from '@/balance/stages';
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
  type CheckinState,
  type DailyState,
  type OwnedPet,
  type RecruitResult,
  type SaveData,
  type TowerState,
} from './playerSave';
import { ensureDailyFresh, isConsecutiveDay } from './dailyReset';
import {
  msToFull, msToNextPoint, settleStamina, staminaCap,
} from './staminaService';
import { DEV_LEGACY_SAVE_KEYS } from '@/config/CloudConfig';
import { CHECKIN_CYCLE_DAYS } from '@/balance/checkin';
import { checkpointFloorOf, TOWER } from '@/balance/tower';
import { SECRET_REALM } from '@/balance/secretRealm';
import { AD_PLACEMENTS, type AdPlacementId } from '@/balance/monetization';
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
      const parsed = PersistService.readJSON<unknown>(SAVE_KEY);
      if (parsed) {
        this._data = parseSaveData(parsed);
        return;
      }
      const legacyParsed = PersistService.readJSON<unknown>(LEGACY_SAVE_KEY);
      if (legacyParsed) {
        this._data = migrateLegacySave(legacyParsed);
        this._save();
        return;
      }
      for (const legacyKey of DEV_LEGACY_SAVE_KEYS) {
        const devLegacy = PersistService.readJSON<unknown>(legacyKey);
        if (devLegacy) {
          this._data = parseSaveData(devLegacy);
          this._save();
          return;
        }
      }
      // 一份都读不到 = 新号：必须显式回到初始档。
      // 走到这里的另一条路是「云端覆盖后重载」，此时若沿用内存里的旧数据，
      // 清档就会变成「看起来清了、下次保存又把旧数据写回去」。
      this._data = initialData();
    } catch (e) {
      console.warn('[PlayerData] 存档解析失败，使用初始数据', e);
      this._data = initialData();
    }
  }

  /** 云端下行覆盖本地缓存后，重新灌入运行态 */
  reloadFromStorage(reason = 'manual'): boolean {
    console.warn(`[PlayerData] 重新载入存档 reason=${reason}`);
    this._loaded = false;
    this.load();
    return true;
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

  /**
   * 升星结算方案：本体碎片不足时，缺口可用通用碎片按稀有度折算补齐。
   * UI 与 starUp 共用同一口径，避免「按钮亮着但扣不动」。
   */
  starUpPlan(petId: string): {
    cost: number;
    shards: number;
    /** 本体碎片缺口 */
    shortfall: number;
    /** 补齐缺口需要的通用碎片（0 = 本体碎片已够） */
    universalCost: number;
    /** 通用碎片是否够补 */
    affordable: boolean;
  } | null {
    const cost = this.starUpCost(petId);
    const o = this._data.ownedPets[petId];
    const pet = PET_MAP.get(petId);
    if (!o || !pet || cost === null) return null;
    const shortfall = Math.max(0, cost - o.shards);
    const rate = ECONOMY.universal.exchangeRate[pet.rarity] ?? 1;
    const universalCost = shortfall * rate;
    return {
      cost,
      shards: o.shards,
      shortfall,
      universalCost,
      affordable: shortfall === 0 || this._data.universalShards >= universalCost,
    };
  }

  /** @param useUniversal 本体碎片不足时是否允许消耗通用碎片补齐 */
  starUp(petId: string, useUniversal = false): boolean {
    const plan = this.starUpPlan(petId);
    const o = this._data.ownedPets[petId];
    if (!o || !plan) return false;
    if (plan.shortfall > 0) {
      if (!useUniversal || !plan.affordable) return false;
      this._data.universalShards -= plan.universalCost;
      o.shards = 0;
    } else {
      o.shards -= plan.cost;
    }
    o.star++;
    this._save();
    return true;
  }

  // ═══════════ 通用碎片 ═══════════

  get universalShards(): number {
    return this._data.universalShards;
  }

  addUniversalShards(amount: number): void {
    if (amount <= 0) return;
    this._data.universalShards += Math.floor(amount);
    this._save();
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

  /** UR 天井计数（已连续未出 UR 抽数） */
  get gachaSinceUr(): number {
    return this._data.gachaSinceUr;
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

  /** 广告免费单抽：次数由 adGate 在播放后扣，这里只负责不收灵玉 */
  pullGachaFree(rng: () => number = Math.random, element?: Element): PullOutcome | null {
    const outcome = pullGachaSingleFromSave(this._data, rng, element, { free: true });
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

  /** 十连券十连：扣券不扣灵玉（签到第 7 天等发的券唯一出口）。无券返回 null */
  pullGachaTenByTicket(
    rng: () => number = Math.random,
    element?: Element,
  ): PullOutcome[] | null {
    if (this._data.tickets <= 0) return null;
    const outcomes = pullGachaTenFromSave(this._data, rng, element, { free: true });
    if (!outcomes) return null;
    this._data.tickets--;
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

  /** 商店碎片池 = 玩家已拥有的灵宠 */
  shopPoolIds(element?: Element): readonly string[] {
    return this.ownedPets.filter((id) => {
      const pet = PET_MAP.get(id);
      return pet && (!element || pet.element === element);
    });
  }

  // ═══════════ 图鉴 ═══════════

  /** 已收录数量（= 拥有过的灵宠数） */
  get codexCount(): number {
    return this.ownedPets.length;
  }

  /**
   * 图鉴里程碑进度（CodexScene 用）。
   * 初始阵容 DEFAULT_TEAM 已预置进 codexRewarded，开局 5 只不可领，下一档从 10 起。
   */
  get codexMilestoneProgress(): {
    count: number;
    inCycle: number;
    next: number;
    every: number;
    lingyu: number;
    pendingLingyu: number;
  } {
    this._ensureCodexBaseline();
    const every = ECONOMY.milestone.codexEvery;
    const total = this.ownedPets.length;
    const claimedFloor = Math.floor(this._data.codexRewarded / every);
    const nowFloor = Math.floor(total / every);
    const pendingTiers = Math.max(0, nowFloor - claimedFloor);
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

  /** 初始阵容不计入可领档：存档基准至少记到 DEFAULT_TEAM.length */
  private _ensureCodexBaseline(): void {
    const baseline = DEFAULT_TEAM.length;
    if (this._data.codexRewarded >= baseline) return;
    if (this.ownedPets.length < baseline) return;
    this._data.codexRewarded = baseline;
  }

  /**
   * 领取图鉴里程碑：每拥有 codexEvery 只发一次灵玉（仅在图鉴页调用）。
   * @returns 本次发放的灵玉总额（无新里程碑为 0）
   */
  claimCodexMilestones(): number {
    this._ensureCodexBaseline();
    const every = ECONOMY.milestone.codexEvery;
    const total = this.ownedPets.length;
    const claimedFloor = Math.floor(this._data.codexRewarded / every);
    const nowFloor = Math.floor(total / every);
    if (nowFloor <= claimedFloor) {
      this._save();
      return 0;
    }
    this._data.codexRewarded = total;
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

  /**
   * 设为队长（移到首位）。队长技只认 team[0]，所以「换队长」就是换顺序，
   * 其余成员保持相对次序不变（避免顺便把编队洗了）。
   * @returns false = 不在队中或已经是队长
   */
  setLeader(petId: string): boolean {
    const idx = this._data.team.indexOf(petId);
    if (idx <= 0) return false;
    this._data.team.splice(idx, 1);
    this._data.team.unshift(petId);
    this._save();
    return true;
  }

  /** 当前队长（无人上阵为 undefined） */
  get leaderId(): string | undefined {
    return this._data.team[0];
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
   * GM：静默解锁到指定关（把目标关之前的主线全部标为 3★）。
   * 不发币/灵玉，避免跳关污染经济；Boss 掉落宠照常发放，方便测后期编队。
   */
  gmUnlockUpTo(chapter: number, index: number): { cleared: number; petsGranted: number; targetId: string } {
    const target = STAGES.find((s) => s.chapter === chapter && s.index === index);
    if (!target) throw new Error(`无效关卡 ${chapter}-${index}`);

    let cleared = 0;
    let petsGranted = 0;
    for (const s of STAGES) {
      const before = s.chapter < chapter || (s.chapter === chapter && s.index < index);
      if (!before) continue;
      if ((this._data.stars[s.id] ?? 0) < 3) {
        this._data.stars[s.id] = 3;
        cleared += 1;
      }
      if (s.isBoss) {
        const petId = CHAPTER_REWARD_PET[s.chapter];
        if (petId && this.unlockPet(petId)) petsGranted += 1;
      }
    }
    this._save();
    return { cleared, petsGranted, targetId: target.id };
  }

  // ═══════════ 抖音侧边栏复访奖励 ═══════════

  get sidebarRewardClaimedToday(): boolean {
    return this._data.sidebarRewardDate === localDateKey();
  }

  /** 从侧边栏进入且今日未领 → 发放灵玉 */
  claimSidebarReward(): boolean {
    if (this.sidebarRewardClaimedToday) return false;
    this._data.lingyu += ECONOMY.sidebar.lingyuReward;
    this._data.sidebarRewardDate = localDateKey();
    this._save();
    return true;
  }

  /**
   * 通关结算：星数取历史最佳，灵宠币累加；首通额外发灵玉（里程碑产出）。
   *
   * 重复通关按 ECONOMY.coin.repeatClearPct 衰减发币（经验衰减在结算层 BattleResultOverlay）。
   * 体力落地后重复刷已经有体力门控，
   * 但仍保留衰减：首通产出要明显厚于重刷，否则「推新章」会输给「回头刷熟关」，
   * 而第 1 章本身免体力，不衰减就是一个无成本的刷币口。
   * @returns 本次首通发放的灵玉（非首通为 0）
   */
  recordClear(stageId: string, stars: number, coins: number): number {
    const best = this._data.stars[stageId] ?? 0;
    const firstClear = best === 0 && stars > 0;
    if (stars > best) this._data.stars[stageId] = stars;
    this._data.coins += firstClear ? coins : Math.floor(coins * ECONOMY.coin.repeatClearPct);

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

  /** 该关是否已通过（重复通关产出衰减，UI 结算页据此提示） */
  isRepeatClear(stageId: string): boolean {
    return (this._data.stars[stageId] ?? 0) > 0;
  }

  // ═══════════ 日循环（秘境次数 / 日常任务 / 每日首胜） ═══════════

  /** 读日循环状态前先对齐今天，保证所有调用方看到的都是当日数据 */
  private _daily(): DailyState {
    if (ensureDailyFresh(this._data)) this._save();
    return this._data.daily;
  }

  get daily(): Readonly<DailyState> {
    return this._daily();
  }

  /**
   * 五行秘境今日剩余次数（含广告加次数）。
   * 广告加的次数直接读 adUsage 计数，不再另存一个 bonusRuns 字段 ——
   * 「看了几次广告」与「多了几次次数」本来就是同一个数，存两份必然对不上。
   */
  get realmRunsLeft(): number {
    const daily = this._daily();
    const bonus = daily.adUsage.realm_extra_run ?? 0;
    return Math.max(0, SECRET_REALM.dailyRuns + bonus - daily.realmRuns);
  }

  /** 扣一次秘境次数（次数不足返回 false） */
  consumeRealmRun(): boolean {
    if (this.realmRunsLeft <= 0) return false;
    this._daily().realmRuns++;
    this._save();
    return true;
  }

  questProgress(questId: string): number {
    return this._daily().questProgress[questId] ?? 0;
  }

  /** 累加任务进度（已领奖的任务不再累加，避免进度虚高） */
  addQuestProgress(questId: string, amount = 1): void {
    if (amount <= 0) return;
    const daily = this._daily();
    if (daily.questClaimed.includes(questId)) return;
    daily.questProgress[questId] = (daily.questProgress[questId] ?? 0) + Math.floor(amount);
    this._save();
  }

  isQuestClaimed(questId: string): boolean {
    return this._daily().questClaimed.includes(questId);
  }

  /** 标记任务已领奖（重复领取返回 false） */
  markQuestClaimed(questId: string): boolean {
    const daily = this._daily();
    if (daily.questClaimed.includes(questId)) return false;
    daily.questClaimed.push(questId);
    this._save();
    return true;
  }

  /** 今日首胜翻倍是否仍可享受 */
  get firstWinAvailable(): boolean {
    return this._daily().firstWinDate !== localDateKey();
  }

  /** 消费今日首胜翻倍名额；已用过返回 false */
  consumeFirstWin(): boolean {
    const daily = this._daily();
    const today = localDateKey();
    if (daily.firstWinDate === today) return false;
    daily.firstWinDate = today;
    this._save();
    return true;
  }

  // ═══════════ 广告位日限（8 个位共用一份计数，播放链路见 game/adGate.ts） ═══════════

  /** 某广告位今日剩余可看次数 */
  adUsesLeft(id: AdPlacementId): number {
    return Math.max(0, AD_PLACEMENTS[id].dailyLimit - (this._daily().adUsage[id] ?? 0));
  }

  /** 清空今日广告计数（GM 调试用；秘境的广告加次数也会一并回收） */
  resetAdUsage(): void {
    this._daily().adUsage = {};
    this._save();
  }

  /** 记一次广告观看（广告播完后由 adGate 调用）；已达日限返回 false */
  consumeAdUse(id: AdPlacementId): boolean {
    if (this.adUsesLeft(id) <= 0) return false;
    const daily = this._daily();
    daily.adUsage[id] = (daily.adUsage[id] ?? 0) + 1;
    this._save();
    return true;
  }

  // ═══════════ 七日签到 ═══════════

  get checkin(): Readonly<CheckinState> {
    return this._data.checkin;
  }

  get canCheckinToday(): boolean {
    return this._data.checkin.lastDate !== localDateKey();
  }

  /** 今日签到对应七日循环的第几天（1~7），未签到时即为「待签的那一天」 */
  get checkinDayIndex(): number {
    const c = this._data.checkin;
    const today = localDateKey();
    if (c.lastDate === today) return ((c.streak - 1) % CHECKIN_CYCLE_DAYS) + 1;
    const nextStreak = isConsecutiveDay(c.lastDate, today) ? c.streak + 1 : 1;
    return ((nextStreak - 1) % CHECKIN_CYCLE_DAYS) + 1;
  }

  /** 执行签到，返回本次是循环内第几天（1~7）；今日已签返回 null */
  doCheckin(): number | null {
    const today = localDateKey();
    const c = this._data.checkin;
    if (c.lastDate === today) return null;
    c.streak = isConsecutiveDay(c.lastDate, today) ? c.streak + 1 : 1;
    c.lastDate = today;
    c.totalDays++;
    this._save();
    return ((c.streak - 1) % CHECKIN_CYCLE_DAYS) + 1;
  }

  // ═══════════ 通天塔 ═══════════

  get tower(): Readonly<TowerState> {
    if (ensureDailyFresh(this._data)) this._save();
    return this._data.tower;
  }

  /** 通天塔今日剩余重置次数（免费 + 广告） */
  get towerResetsLeft(): number {
    return Math.max(0, TOWER.dailyResets - this.tower.resetsUsed);
  }

  /** 下一次重置是否需要看广告（免费额度已用完） */
  get towerResetNeedsAd(): boolean {
    return this.tower.resetsUsed >= TOWER.freeResets;
  }

  /** 本轮是否已战败封盘（需重置才能再进） */
  get towerRunEnded(): boolean {
    return this.tower.runEnded;
  }

  /**
   * 爬塔推进：记录下一层与续战血量比例（塔的核心差异点 —— HP 不回满）。
   * @returns 是否刷新了历史最高层
   */
  towerAdvance(clearedFloor: number, nextHpPct: number, cds: Record<string, number> = {}): boolean {
    const t = this._data.tower;
    const isBest = clearedFloor > t.bestFloor;
    if (isBest) t.bestFloor = clearedFloor;
    t.runFloor = clearedFloor + 1;
    t.runHpPct = Math.min(1, Math.max(TOWER.minCarryHpPct, nextHpPct));
    t.runCds = cds;
    this._save();
    return isBest;
  }

  /** 战败封盘：本轮就此结束，重置后从最近存档点重来 */
  towerEndRun(): void {
    this._data.tower.runEnded = true;
    this._save();
  }

  /**
   * 消耗一次重置：回退到最近存档点，满血续战。
   * @returns 次数不足返回 false
   */
  towerReset(): boolean {
    if (this.towerResetsLeft <= 0) return false;
    const t = this._data.tower;
    t.resetsUsed++;
    t.runFloor = checkpointFloorOf(t.runFloor);
    t.runHpPct = 1;
    t.runCds = {};
    t.runEnded = false;
    this._save();
    return true;
  }

  /** 领取层数里程碑；已领过返回 false */
  claimTowerMilestone(floor: number): boolean {
    const t = this._data.tower;
    if (t.claimedMilestones.includes(floor)) return false;
    t.claimedMilestones.push(floor);
    this._save();
    return true;
  }

  isTowerMilestoneClaimed(floor: number): boolean {
    return this._data.tower.claimedMilestones.includes(floor);
  }

  // ═══════════ 体力 ═══════════

  /**
   * 体力上限：按已通关章数成长。
   * 「已通关」= 该章 Boss 关有星，未通任何章时为 1 章档位。
   */
  get staminaMax(): number {
    return staminaCap(this._clearedChapters());
  }

  /** 当前体力（读取即惰性补点） */
  get stamina(): number {
    this._settleStamina();
    return this._data.stamina.value;
  }

  /** 距下一点恢复的毫秒数（已满为 0） */
  get staminaNextPointMs(): number {
    this._settleStamina();
    return msToNextPoint(this._data.stamina, this.staminaMax);
  }

  /** 距满瓶的毫秒数（已满为 0） */
  get staminaFullMs(): number {
    this._settleStamina();
    return msToFull(this._data.stamina, this.staminaMax);
  }

  /** 今日广告回体剩余次数 */
  get staminaAdLeft(): number {
    return this.adUsesLeft('stamina_refill');
  }

  hasStamina(cost: number): boolean {
    return cost <= 0 || this.stamina >= cost;
  }

  /** 扣体力；不足返回 false（不做部分扣减） */
  consumeStamina(cost: number): boolean {
    if (cost <= 0) return true;
    this._settleStamina();
    const st = this._data.stamina;
    if (st.value < cost) return false;
    // 从满瓶掉下来的那一刻才开始计恢复，否则会白送一段离线额度
    if (st.value >= this.staminaMax) st.lastRegenMs = Date.now();
    st.value -= cost;
    this._save();
    return true;
  }

  /** 体力发放（签到 / 任务 / 广告）；允许顶破上限 */
  addStamina(amount: number): void {
    if (amount <= 0) return;
    this._settleStamina();
    this._data.stamina.value += Math.floor(amount);
    this._save();
  }

  /**
   * 广告回体：次数用尽返回 false。
   * 走 adGate 时次数已由 adGate 扣过，这里只发体力；直接调用（GM / 测试）则自行扣次数。
   */
  claimStaminaAd(consumeUse = true): boolean {
    if (consumeUse && !this.consumeAdUse('stamina_refill')) return false;
    this.addStamina(ECONOMY.stamina.adRefill);
    return true;
  }

  private _settleStamina(): void {
    if (settleStamina(this._data.stamina, this.staminaMax)) this._save();
  }

  /** 已通关章数（用于体力上限成长）；未通任何章时为 1 */
  private _clearedChapters(): number {
    let cleared = 0;
    for (const s of STAGES) {
      if (s.isBoss && s.chapter >= 1 && this.starsOf(s.id) > 0) {
        cleared = Math.max(cleared, s.chapter);
      }
    }
    return Math.max(1, cleared);
  }

  /** 招募券（十连券）发放 */
  addTickets(amount: number): void {
    if (amount <= 0) return;
    this._data.tickets += Math.floor(amount);
    this._save();
  }

  /** 灵宠币发放（任务 / 签到 / 秘境结算共用） */
  addCoins(amount: number): void {
    if (amount <= 0) return;
    this._data.coins += Math.floor(amount);
    this._save();
  }

  private _save(): void {
    try {
      PersistService.writeJSON(SAVE_KEY, this._data);
    } catch (_) {}
  }
}

export const PlayerData = new PlayerDataClass();
