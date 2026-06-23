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
  INITIAL_PET_LEVEL, INITIAL_PET_STAR, type PetDef,
} from '@/balance/pets';
import type { Element } from '@/balance/combat';
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';
import { recruitPrice, starUpShardCost } from '@/formulas/economyOutput';
import { petExpToNext } from '@/formulas/growth';
import { pullOne, pullTen, type GachaState, type PullOutcome } from '@/game/gacha/Gacha';

const SAVE_KEY = 'xiaochu2_save_v2';
const LEGACY_SAVE_KEY = 'xiaochu2_save_v1';
const SAVE_VERSION = 2;

/** 单只灵宠的养成进度 */
export interface OwnedPet {
  level: number;
  star: number;
  shards: number;
}

interface SaveData {
  version: number;
  coins: number;
  /** 抽卡货币：灵玉 */
  lingyu: number;
  /** 招募券（十连券等，预留） */
  tickets: number;
  /** 抽卡硬保底计数（连续未出 SSR+ 抽数） */
  gachaSinceHigh: number;
  /** 升级经验池（关卡掉落，跨宠共享，升级时按需消耗） */
  exp: number;
  /** stageId → 最佳星数（1~3） */
  stars: Record<string, number>;
  /** 当前编队（宠物 id，1~5 只） */
  team: string[];
  /** 已拥有灵宠 → 养成进度 */
  ownedPets: Record<string, OwnedPet>;
  /** 未拥有灵宠的碎片暂存（解锁该宠时并入 OwnedPet.shards，修复碎片丢弃） */
  pendingShards: Record<string, number>;
  /** 已招募新宠次数（招募定价用，含碎片溢出招募） */
  recruitedCount: number;
  /**
   * 已收录生物 id（阶段九）：击败其高级形态即收录，进入「可获取池」。
   * 初始 5 只赠送宠开局即同时进入 ownedPets / discovered / team，避免状态割裂。
   */
  discovered: string[];
}

/** 招募结果 */
export interface RecruitResult {
  petId: string;
  /** true = 已全收集，本次转为碎片 */
  duplicate: boolean;
  shards?: number;
}

class PlayerDataClass {
  private _data: SaveData = this._initialData();
  private _loaded = false;

  private _initialData(): SaveData {
    return {
      version: SAVE_VERSION,
      coins: 0,
      lingyu: ECONOMY.gacha.starterLingyu,
      tickets: 0,
      gachaSinceHigh: 0,
      exp: 0,
      stars: {},
      team: [...DEFAULT_TEAM],
      ownedPets: this._initialOwned(),
      pendingShards: {},
      recruitedCount: 0,
      discovered: [...DEFAULT_TEAM],
    };
  }

  /** 初始阵容：默认队按初始等级/星级入手 */
  private _initialOwned(): Record<string, OwnedPet> {
    const owned: Record<string, OwnedPet> = {};
    for (const id of DEFAULT_TEAM) {
      owned[id] = { level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0 };
    }
    return owned;
  }

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const raw = Platform.getStorageSync(SAVE_KEY);
      if (raw) {
        this._data = this._parse(JSON.parse(raw));
        return;
      }
      // 旧档（v1）迁移：补出拥有系统，原队伍宠物保底入手
      const legacy = Platform.getStorageSync(LEGACY_SAVE_KEY);
      if (legacy) {
        this._data = this._migrateLegacy(JSON.parse(legacy));
        this._save();
      }
    } catch (e) {
      console.warn('[PlayerData] 存档解析失败，使用初始数据', e);
      this._data = this._initialData();
    }
  }

  /** 解析 v2 存档，缺字段回退默认 */
  private _parse(parsed: Partial<SaveData>): SaveData {
    const owned = this._sanitizeOwned(parsed.ownedPets);
    return {
      version: SAVE_VERSION,
      coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
      lingyu: typeof parsed.lingyu === 'number' ? parsed.lingyu : ECONOMY.gacha.starterLingyu,
      tickets: typeof parsed.tickets === 'number' ? parsed.tickets : 0,
      gachaSinceHigh: typeof parsed.gachaSinceHigh === 'number' ? parsed.gachaSinceHigh : 0,
      exp: typeof parsed.exp === 'number' ? parsed.exp : 0,
      stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
      ownedPets: owned,
      pendingShards: this._sanitizeShardLedger(parsed.pendingShards, owned),
      team: this._sanitizeTeam(parsed.team, owned),
      recruitedCount: typeof parsed.recruitedCount === 'number'
        ? parsed.recruitedCount
        : this._countNonInitial(owned),
      discovered: this._sanitizeDiscovered(parsed.discovered, owned),
    };
  }

  /** 收录列表清洗：仅保留合法生物 id；并入初始赠送 + 已拥有，保证可获取池一致 */
  private _sanitizeDiscovered(
    discovered: unknown,
    owned: Record<string, OwnedPet>,
  ): string[] {
    const set = new Set<string>(DEFAULT_TEAM);
    for (const id of Object.keys(owned)) set.add(id);
    if (Array.isArray(discovered)) {
      for (const id of discovered) {
        if (typeof id === 'string' && PET_MAP.has(id)) set.add(id);
      }
    }
    return [...set];
  }

  /** 暂存碎片清洗：仅保留合法宠 id、非负整数，且必须是「未拥有」的宠 */
  private _sanitizeShardLedger(
    ledger: unknown,
    owned: Record<string, OwnedPet>,
  ): Record<string, number> {
    const out: Record<string, number> = {};
    if (ledger && typeof ledger === 'object') {
      for (const [id, v] of Object.entries(ledger as Record<string, unknown>)) {
        if (!PET_MAP.has(id) || owned[id]) continue;
        const n = typeof v === 'number' ? Math.floor(v) : 0;
        if (n > 0) out[id] = n;
      }
    }
    return out;
  }

  /** v1 → v2：保留 coins/stars/team，拥有列表 = 默认队 ∪ 原队伍 */
  private _migrateLegacy(legacy: { coins?: number; stars?: unknown; team?: unknown }): SaveData {
    const owned = this._initialOwned();
    if (Array.isArray(legacy.team)) {
      for (const id of legacy.team) {
        if (typeof id === 'string' && PET_MAP.has(id) && !owned[id]) {
          owned[id] = { level: INITIAL_PET_LEVEL, star: INITIAL_PET_STAR, shards: 0 };
        }
      }
    }
    return {
      version: SAVE_VERSION,
      coins: typeof legacy.coins === 'number' ? legacy.coins : 0,
      lingyu: ECONOMY.gacha.starterLingyu,
      tickets: 0,
      gachaSinceHigh: 0,
      exp: 0,
      stars: legacy.stars && typeof legacy.stars === 'object' ? (legacy.stars as Record<string, number>) : {},
      ownedPets: owned,
      pendingShards: {},
      team: this._sanitizeTeam(legacy.team, owned),
      recruitedCount: this._countNonInitial(owned),
      discovered: this._sanitizeDiscovered(undefined, owned),
    };
  }

  private _sanitizeOwned(owned: unknown): Record<string, OwnedPet> {
    if (!owned || typeof owned !== 'object') return this._initialOwned();
    const out: Record<string, OwnedPet> = {};
    for (const [id, v] of Object.entries(owned as Record<string, unknown>)) {
      if (!PET_MAP.has(id) || !v || typeof v !== 'object') continue;
      const o = v as Partial<OwnedPet>;
      const star = clampInt(o.star, 1, 5, INITIAL_PET_STAR);
      const maxLv = getStarProfile(star).maxLevel;
      out[id] = {
        star,
        level: clampInt(o.level, 1, maxLv, INITIAL_PET_LEVEL),
        shards: Math.max(0, typeof o.shards === 'number' ? Math.floor(o.shards) : 0),
      };
    }
    // 存档异常导致空拥有时，回退初始阵容，保证可玩
    return Object.keys(out).length > 0 ? out : this._initialOwned();
  }

  /** 编队清洗：去重、剔除未拥有、限长，空了回退默认队（取已拥有者） */
  private _sanitizeTeam(team: unknown, owned: Record<string, OwnedPet>): string[] {
    const isOwned = (id: string) => !!owned[id];
    if (Array.isArray(team)) {
      const valid = [...new Set(team)]
        .filter((id): id is string => typeof id === 'string' && isOwned(id))
        .slice(0, TEAM_SIZE);
      if (valid.length > 0) return valid;
    }
    const fallback = DEFAULT_TEAM.filter(isOwned).slice(0, TEAM_SIZE);
    return fallback.length > 0 ? fallback : Object.keys(owned).slice(0, TEAM_SIZE);
  }

  private _countNonInitial(owned: Record<string, OwnedPet>): number {
    return Object.keys(owned).filter((id) => !DEFAULT_TEAM.includes(id)).length;
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
      if (!this._data.discovered.includes(target)) this._data.discovered.push(target);
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
    if (amount === 0) return;
    this._data.lingyu = Math.max(0, this._data.lingyu + Math.floor(amount));
    this._save();
  }

  /** 解锁一只宠（抽卡/赠送）：并入暂存碎片，初始等级/星级 */
  private _unlockPet(petId: string): void {
    if (this.isOwned(petId)) return;
    const pending = this._data.pendingShards[petId] ?? 0;
    this._data.ownedPets[petId] = {
      level: INITIAL_PET_LEVEL,
      star: INITIAL_PET_STAR,
      shards: pending,
    };
    delete this._data.pendingShards[petId];
    this._data.recruitedCount++;
    // 拥有即视为已收录（保证可获取池/图鉴一致）
    if (!this._data.discovered.includes(petId)) this._data.discovered.push(petId);
  }

  /** 出货池 = 可获取池（按属性可拆分），映射为 PetDef 列表 */
  private _gachaPool(element?: Element): PetDef[] {
    const ids = new Set(this.availablePool(element));
    return PETS.filter((p) => ids.has(p.id));
  }

  /** 单抽：扣灵玉，结算保底/重复转碎片。灵玉不足返回 null。element 限定五行召唤池 */
  pullGachaSingle(rng: () => number = Math.random, element?: Element): PullOutcome | null {
    if (this._data.lingyu < ECONOMY.gacha.singleCost) return null;
    this._data.lingyu -= ECONOMY.gacha.singleCost;
    const state: GachaState = { sinceHigh: this._data.gachaSinceHigh };
    const outcome = pullOne(rng, state, (id) => this.isOwned(id), 1, this._gachaPool(element));
    this._applyPull(outcome);
    this._data.gachaSinceHigh = state.sinceHigh;
    this._save();
    return outcome;
  }

  /** 十连：扣灵玉，含 SR+ 保底。灵玉不足返回 null。element 限定五行召唤池 */
  pullGachaTen(rng: () => number = Math.random, element?: Element): PullOutcome[] | null {
    if (this._data.lingyu < ECONOMY.gacha.tenCost) return null;
    this._data.lingyu -= ECONOMY.gacha.tenCost;
    const state: GachaState = { sinceHigh: this._data.gachaSinceHigh };
    const outcomes = pullTen(rng, state, (id) => this.isOwned(id), this._gachaPool(element));
    for (const o of outcomes) this._applyPull(o);
    this._data.gachaSinceHigh = state.sinceHigh;
    this._save();
    return outcomes;
  }

  /** 落库单次抽卡结果：新宠解锁 / 重复转碎片（不触发 _save，批量后统一存） */
  private _applyPull(o: PullOutcome): void {
    if (o.duplicate) {
      const owned = this._data.ownedPets[o.petId];
      if (owned) owned.shards += o.shards;
      else this._data.pendingShards[o.petId] =
        (this._data.pendingShards[o.petId] ?? 0) + o.shards;
    } else {
      this._unlockPet(o.petId);
    }
  }

  // ═══════════ 收录 / 可获取池（阶段九） ═══════════

  /** 已收录生物 id（按 PETS 表顺序，UI 稳定） */
  get discovered(): readonly string[] {
    return PETS.filter((p) => this._data.discovered.includes(p.id)).map((p) => p.id);
  }

  isDiscovered(id: string): boolean {
    return this._data.discovered.includes(id);
  }

  /**
   * 收录一只生物（战斗击败其高级形态触发）。
   * @returns true = 本次新收录（用于顶部提示）
   */
  discover(id: string): boolean {
    if (!PET_MAP.has(id)) return false;
    if (this._data.discovered.includes(id)) return false;
    this._data.discovered.push(id);
    this._save();
    return true;
  }

  /**
   * 可获取池 = 已收录 ∪ 初始赠送 ∪ 已拥有；召唤/商店仅在此池内出货。
   * @param element 仅取该五行属性（按五行拆分宠物池）
   */
  availablePool(element?: Element): readonly string[] {
    return PETS
      .filter((p) => this._data.discovered.includes(p.id))
      .filter((p) => !element || p.element === element)
      .map((p) => p.id);
  }

  // ═══════════ 图鉴收录 ═══════════

  /** 已收录数量（= 拥有过的灵宠数） */
  get codexCount(): number {
    return this.ownedPets.length;
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

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

export const PlayerData = new PlayerDataClass();
