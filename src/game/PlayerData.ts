/**
 * 玩家本地存档：关卡进度（星数）、灵宠币累计
 *
 * 写入走 Platform.setStorageAsync（不阻塞主线程），
 * 招募/养成上线后在此扩展宠物拥有/等级数据。
 */
import { Platform } from '@/core/PlatformService';
import { STAGES, type StageDef } from '@/balance/stages';

const SAVE_KEY = 'xiaochu2_save_v1';

interface SaveData {
  coins: number;
  /** stageId → 最佳星数（1~3） */
  stars: Record<string, number>;
}

class PlayerDataClass {
  private _data: SaveData = { coins: 0, stars: {} };
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
        };
      }
    } catch (e) {
      console.warn('[PlayerData] 存档解析失败，使用初始数据', e);
    }
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
