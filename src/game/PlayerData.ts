/**
 * 玩家本地存档：关卡进度（星数）、灵宠币累计
 *
 * 写入走 Platform.setStorageAsync（不阻塞主线程），
 * 招募/养成上线后在此扩展宠物拥有/等级数据。
 */
import { Platform } from '@/core/PlatformService';
import { STAGES, type StageDef } from '@/balance/stages';
import { PETS, PET_MAP, DEFAULT_TEAM, TEAM_SIZE } from '@/balance/pets';

const SAVE_KEY = 'xiaochu2_save_v1';

interface SaveData {
  coins: number;
  /** stageId → 最佳星数（1~3） */
  stars: Record<string, number>;
  /** 当前编队（宠物 id，1~5 只） */
  team: string[];
}

class PlayerDataClass {
  private _data: SaveData = { coins: 0, stars: {}, team: [...DEFAULT_TEAM] };
  private _loaded = false;

  load(): void {
    if (this._loaded) return;
    this._loaded = true;
    try {
      const raw = Platform.getStorageSync(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<SaveData>;
        this._data = {
          coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
          stars: parsed.stars && typeof parsed.stars === 'object' ? parsed.stars : {},
          team: this._sanitizeTeam(parsed.team),
        };
      }
    } catch (e) {
      console.warn('[PlayerData] 存档解析失败，使用初始数据', e);
    }
  }

  /** 存档中的编队清洗：去重、剔除未知 id、限长，空了回退默认队 */
  private _sanitizeTeam(team: unknown): string[] {
    if (!Array.isArray(team)) return [...DEFAULT_TEAM];
    const valid = [...new Set(team)]
      .filter((id): id is string => typeof id === 'string' && PET_MAP.has(id))
      .slice(0, TEAM_SIZE);
    return valid.length > 0 ? valid : [...DEFAULT_TEAM];
  }

  // ═══════════ 宠物池 / 编队 ═══════════

  /** 拥有的宠物 id（Demo 阶段全解锁，招募上线后改为存档驱动） */
  get ownedPets(): readonly string[] {
    return PETS.map((p) => p.id);
  }

  /** 当前编队（1~5 只） */
  get team(): readonly string[] {
    return this._data.team;
  }

  isInTeam(petId: string): boolean {
    return this._data.team.includes(petId);
  }

  /** 上阵；满员或已上阵返回 false */
  addToTeam(petId: string): boolean {
    if (!PET_MAP.has(petId)) return false;
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

  get coins(): number {
    return this._data.coins;
  }

  starsOf(stageId: string): number {
    return this._data.stars[stageId] ?? 0;
  }

  isCleared(stageId: string): boolean {
    return this.starsOf(stageId) > 0;
  }

  /** 关卡是否解锁：第一关恒解锁，其余需要前一关已通 */
  isUnlocked(stage: StageDef): boolean {
    if (stage.index === 1) return true;
    const prev = STAGES.find((s) => s.chapter === stage.chapter && s.index === stage.index - 1);
    return prev ? this.isCleared(prev.id) : false;
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

export const PlayerData = new PlayerDataClass();
