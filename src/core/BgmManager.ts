/**
 * 背景音乐管理（主循环 + Boss 战）
 *
 * 使用平台 InnerAudioContext，路径见 config/Audio.ts。
 * 小游戏切后台 pause、回前台 resume。
 */
import { AUDIO } from '@/config/Audio';
import { Platform } from './PlatformService';

class BgmManagerClass {
  private _ctx: WechatMinigame.InnerAudioContext | null = null;
  private _bossCtx: WechatMinigame.InnerAudioContext | null = null;
  private _enabled = true;
  private _volume = 0.5;

  /** 播放主 BGM（已在播则忽略） */
  playMain(): void {
    if (!this._enabled || !Platform.isMinigame) return;
    if (this._ctx) return;

    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;

    this._ctx = ctx;
    ctx.src = AUDIO.mainBgm;
    ctx.loop = true;
    ctx.volume = this._volume;
    ctx.onError((err) => {
      console.warn('[BgmManager] 主 BGM 加载失败:', AUDIO.mainBgm, err);
      this._destroyMain();
    });
    ctx.play();
  }

  /** Boss 战 BGM：暂停主 BGM，播 Boss 曲 */
  playBoss(): void {
    if (!this._enabled || !Platform.isMinigame) return;
    this._destroyBoss();
    if (this._ctx) {
      try { this._ctx.stop(); } catch (_) {}
    }

    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;

    this._bossCtx = ctx;
    ctx.src = AUDIO.bossBgm;
    ctx.loop = true;
    ctx.volume = Math.min(1, this._volume * 1.2);
    ctx.onError((err) => {
      console.warn('[BgmManager] Boss BGM 加载失败:', AUDIO.bossBgm, err);
      this._destroyBoss();
    });
    ctx.play();
  }

  /** Boss 战结束：销毁 Boss 曲，恢复主 BGM */
  resumeNormal(): void {
    this._destroyBoss();
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
    try { this._bossCtx?.pause(); } catch (_) {}
  }

  resume(): void {
    if (!this._enabled) return;
    try {
      if (this._bossCtx) this._bossCtx.play();
      else if (this._ctx) this._ctx.play();
      else this.playMain();
    } catch (_) {}
  }

  stop(): void {
    this._destroyMain();
    this._destroyBoss();
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (enabled) this.playMain();
    else this.stop();
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this._ctx) this._ctx.volume = this._volume;
    if (this._bossCtx) this._bossCtx.volume = Math.min(1, this._volume * 1.2);
  }

  private _destroyMain(): void {
    if (!this._ctx) return;
    try { this._ctx.stop(); } catch (_) {}
    try { this._ctx.destroy(); } catch (_) {}
    this._ctx = null;
  }

  private _destroyBoss(): void {
    if (!this._bossCtx) return;
    try { this._bossCtx.stop(); } catch (_) {}
    try { this._bossCtx.destroy(); } catch (_) {}
    this._bossCtx = null;
  }
}

export const BgmManager = new BgmManagerClass();
