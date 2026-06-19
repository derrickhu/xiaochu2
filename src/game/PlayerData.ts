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
import { getStarProfile } from '@/balance/growth';
import { ECONOMY } from '@/balance/economy';
import { recruitPrice, starUpShardCost } from '@/formulas/economyOutput';
import { petExpToNext } from '@/formulas/growth';

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
  /** 升级经验池（关卡掉落，跨宠共享，升级时按需消耗） */
  exp: number;
  /** stageId → 最佳星数（1~3） */
  stars: Record<string, number>;
  /** 当前编队（宠物 id，1~5 只） */
  team: string[];
  /** 已拥有灵宠 → 养成进度 */
  ownedPets: Record<string, OwnedPet>;
  /** 已招募新宠次数（招募定价用，含碎片溢出招募） */
  recruitedCount: number;
  /** 已领取的图鉴收录里程碑（收录数阈值列表） */
  codexClaims: number[];
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
      exp: 0,
      stars: {},
      team: [...DEFAULT_TEAM],
      ownedPets: this._initialOwned(),
      recruitedCount: 0,
      codexClaims: [],
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
      exp: typeof parsed.exp === 'number' ? parsed.exp : 0,
      stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
      ownedPets: owned,
      team: this._sanitizeTeam(parsed.team, owned),
      recruitedCount: typeof parsed.recruitedCount === 'number'
        ? parsed.recruitedCount
        : this._countNonInitial(owned),
      codexClaims: Array.isArray(parsed.codexClaims)
        ? parsed.codexClaims.filter((n): n is number => typeof n === 'number')
        : [],
    };
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
      exp: 0,
      stars: legacy.stars && typeof legacy.stars === 'object' ? (legacy.stars as Record<string, number>) : {},
      ownedPets: owned,
      team: this._sanitizeTeam(legacy.team, owned),
      recruitedCount: this._countNonInitial(owned),
      codexClaims: [],
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
    return this._data.ownedPets[petId]?.shards ?? 0;
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
    const o = this._data.ownedPets[petId];
    if (!o || amount <= 0) return;
    o.shards += Math.floor(amount);
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

  // ═══════════ 图鉴收录 ═══════════

  /** 已收录数量（= 拥有过的灵宠数） */
  get codexCount(): number {
    return this.ownedPets.length;
  }

  /** 里程碑是否已领取 */
  isCodexClaimed(threshold: number): boolean {
    return this._data.codexClaims.includes(threshold);
  }

  /** 领取收录里程碑奖励（达成且未领取时返回 true 并发币） */
  claimCodexMilestone(threshold: number, coinReward: number): boolean {
    if (this.codexCount < threshold || this.isCodexClaimed(threshold)) return false;
    this._data.codexClaims.push(threshold);
    this._data.coins += coinReward;
    this._save();
    return true;
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

  /** 通关结算：星数取历史最佳，灵宠币直接累加 */
  recordClear(stageId: string, stars: number, coins: number): void {
    const best = this._data.stars[stageId] ?? 0;
    if (stars > best) this._data.stars[stageId] = stars;
    this._data.coins += coins;
    this._save();
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
