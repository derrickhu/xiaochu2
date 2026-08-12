/**
 * 背景音乐管理（主循环 + 常规战斗 + Boss 战）
 *
 * 使用平台 InnerAudioContext，路径见 config/Audio.ts。
 * CDN 音频异步 resolve 后再设 src，不阻塞主流程。
 */
import { AUDIO } from '@/config/Audio';
import { CdnAssetService } from '@/core/CdnAssetService';
import { Platform } from './PlatformService';

type CombatKind = 'battle' | 'boss';

/**
 * 战斗曲相对主 BGM 的音量倍率。
 * 原先 battle=1.0 / boss=1.2 会盖住连击升调；压低后 SFX 层次更清楚。
 */
const BATTLE_BGM_MULT = 0.55;
const BOSS_BGM_MULT = 0.7;

class BgmManagerClass {
  private _ctx: WechatMinigame.InnerAudioContext | null = null;
  private _combatCtx: WechatMinigame.InnerAudioContext | null = null;
  private _combatKind: CombatKind | null = null;
  private _enabled = true;
  /** 默认低于 SFX：BGM 常驻，抬太高会盖掉按钮/战斗反馈（见 AudioSettings） */
  private _volume = 0.28;
  private _mainLogical = AUDIO.mainBgm;
  private _duckTimer: ReturnType<typeof setTimeout> | null = null;

  private _combatMult(kind: CombatKind | null = this._combatKind): number {
    if (kind === 'boss') return BOSS_BGM_MULT;
    if (kind === 'battle') return BATTLE_BGM_MULT;
    return 1;
  }

  /** 播放主 BGM（已在播则忽略） */
  playMain(): void {
    if (!this._enabled || !Platform.isMinigame) return;
    if (this._ctx) return;

    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;

    this._ctx = ctx;
    ctx.loop = true;
    ctx.volume = this._volume;
    ctx.onError((err) => {
      console.warn('[BgmManager] 主 BGM 加载失败:', this._mainLogical, err);
      this._destroyMain();
    });
    void CdnAssetService.resolveOrDownload(this._mainLogical).then((src) => {
      if (this._ctx !== ctx) return;
      ctx.src = src;
      ctx.play();
    }).catch((e) => {
      console.warn('[BgmManager] 主 BGM CDN 解析失败', e);
      if (this._ctx !== ctx) return;
      ctx.src = this._mainLogical;
      ctx.play();
    });
  }

  /** 常规战斗 BGM：暂停主 BGM，播战斗曲（音量低于主曲，给连击/打击让路） */
  playBattle(): void {
    this._playCombat('battle', AUDIO.battleBgm, BATTLE_BGM_MULT);
  }

  /** Boss 战 BGM：略高于常规战斗，仍明显低于旧版 1.2 */
  playBoss(): void {
    this._playCombat('boss', AUDIO.bossBgm, BOSS_BGM_MULT);
  }

  /** 战斗结束：销毁战斗曲，恢复主 BGM */
  resumeNormal(): void {
    this._destroyCombat();
    if (!this._enabled || !Platform.isMinigame) return;
    if (this._ctx) {
      try {
        this._ctx.volume = this._volume;
        this._ctx.play();
      } catch (_) {}
      return;
    }
    this.playMain();
  }

  pause(): void {
    try { this._ctx?.pause(); } catch (_) {}
    try { this._combatCtx?.pause(); } catch (_) {}
  }

  resume(): void {
    if (!this._enabled) return;
    try {
      if (this._combatCtx) this._combatCtx.play();
      else if (this._ctx) this._ctx.play();
      else this.playMain();
    } catch (_) {}
  }

  stop(): void {
    this._destroyMain();
    this._destroyCombat();
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (enabled) this.playMain();
    else this.stop();
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this._ctx) this._ctx.volume = this._volume;
    if (this._combatCtx) {
      this._combatCtx.volume = Math.min(1, this._volume * this._combatMult());
    }
  }

  get volume(): number {
    return this._volume;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * 短暂压低 BGM，给胜利/失败等一次性音效让路。
   * 微信 InnerAudioContext 没有真正的侧链压缩，只能硬切音量再还原。
   */
  duck(level = 0.15, ms = 1400): void {
    if (!this._enabled) return;
    if (this._duckTimer != null) {
      clearTimeout(this._duckTimer);
      this._duckTimer = null;
    }
    const ducked = Math.max(0, Math.min(1, this._volume * level));
    try {
      if (this._ctx) this._ctx.volume = ducked;
      if (this._combatCtx) this._combatCtx.volume = ducked;
    } catch (_) { /* ignore */ }
    this._duckTimer = setTimeout(() => {
      this._duckTimer = null;
      this._restoreDuckedVolume();
    }, ms);
  }

  /** 结算短曲被点掉时立刻还原 BGM，不要等 duck 定时器跑完 */
  unduck(): void {
    if (this._duckTimer != null) {
      clearTimeout(this._duckTimer);
      this._duckTimer = null;
    }
    this._restoreDuckedVolume();
  }

  private _restoreDuckedVolume(): void {
    try {
      if (this._ctx) this._ctx.volume = this._volume;
      if (this._combatCtx) {
        this._combatCtx.volume = Math.min(1, this._volume * this._combatMult());
      }
    } catch (_) { /* ignore */ }
  }

  private _playCombat(kind: CombatKind, logical: string, volumeMult: number): void {
    if (!this._enabled || !Platform.isMinigame) return;
    // 同曲已在播：不重切，避免波次切换时重头播
    if (this._combatCtx && this._combatKind === kind) return;

    this._destroyCombat();
    if (this._ctx) {
      try { this._ctx.stop(); } catch (_) {}
    }

    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;

    this._combatCtx = ctx;
    this._combatKind = kind;
    ctx.loop = true;
    ctx.volume = Math.min(1, this._volume * volumeMult);
    ctx.onError((err) => {
      console.warn(`[BgmManager] ${kind} BGM 加载失败:`, logical, err);
      this._destroyCombat();
    });
    void CdnAssetService.resolveOrDownload(logical).then((src) => {
      if (this._combatCtx !== ctx) return;
      ctx.src = src;
      ctx.play();
    }).catch((e) => {
      console.warn(`[BgmManager] ${kind} BGM CDN 解析失败`, e);
      if (this._combatCtx !== ctx) return;
      ctx.src = logical;
      ctx.play();
    });
  }

  private _destroyMain(): void {
    if (!this._ctx) return;
    try { this._ctx.stop(); } catch (_) {}
    try { this._ctx.destroy(); } catch (_) {}
    this._ctx = null;
  }

  private _destroyCombat(): void {
    if (!this._combatCtx) return;
    try { this._combatCtx.stop(); } catch (_) {}
    try { this._combatCtx.destroy(); } catch (_) {}
    this._combatCtx = null;
    this._combatKind = null;
  }
}

export const BgmManager = new BgmManagerClass();
