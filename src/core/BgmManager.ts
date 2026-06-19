/**
 * 背景音乐管理（首版：主循环 BGM）
 *
 * 使用平台 InnerAudioContext，路径见 config/Audio.ts。
 * 小游戏切后台 pause、回前台 resume。
 */
import { AUDIO } from '@/config/Audio';
import { Platform } from './PlatformService';

class BgmManagerClass {
  private _ctx: WechatMinigame.InnerAudioContext | null = null;
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
      console.warn('[BgmManager] 加载失败:', AUDIO.mainBgm, err);
      this._destroy();
    });
    ctx.play();
  }

  pause(): void {
    try {
      this._ctx?.pause();
    } catch (_) {}
  }

  resume(): void {
    if (!this._enabled) return;
    try {
      if (this._ctx) this._ctx.play();
      else this.playMain();
    } catch (_) {}
  }

  stop(): void {
    this._destroy();
  }

  setEnabled(enabled: boolean): void {
    this._enabled = enabled;
    if (enabled) this.playMain();
    else this.stop();
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this._ctx) this._ctx.volume = this._volume;
  }

  private _destroy(): void {
    if (!this._ctx) return;
    try {
      this._ctx.stop();
    } catch (_) {}
    try {
      this._ctx.destroy();
    } catch (_) {}
    this._ctx = null;
  }
}

export const BgmManager = new BgmManagerClass();
