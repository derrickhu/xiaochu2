/**
 * 国风音效管理 — 移植自 xiao_chu/js/runtime/music.js
 *
 * 转珠交互、消除连击、战斗伤害等 SFX；BGM 仍由 BgmManager 负责。
 */
import { AUDIO } from '@/config/Audio';
import { COMBO_MILESTONES, getComboTier } from '@/scenes/battle/ComboDisplay';
import { Platform } from './PlatformService';

/** 连击音阶（十二平均律，以 combo.mp3 为 Do 基准）— 对齐 xiao_chu music.js */
export const COMBO_PITCH_SCALE = [
  1.0,     // 1 Do
  1.122,   // 2 Re
  1.26,    // 3 Mi
  1.335,   // 4 Fa
  1.498,   // 5 Sol
  1.682,   // 6 La
  1.888,   // 7 Si
  2.0,     // 8 Do'
] as const;

const SCALE = COMBO_PITCH_SCALE;

type SfxPool = { idx: number; items: WechatMinigame.InnerAudioContext[] };

class SfxManagerClass {
  enabled = true;
  private _sfxPool: Record<string, SfxPool> = {};
  private readonly _poolSize = 4;
  private readonly _comboPoolSize = 8;
  private _swapPlaying = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * 连击递进 — Do Re Mi Fa Sol La Si Do，连击越高音越高、音量略增。
   * combo 9+ 叠加 levelup 进入第二八度。
   *
   * 注意：旧版沿用 xiao_chu 的 `pitch × 1.3` 再 `min(2.0)`，会在第 5 连起
   * 全部顶死在 2.0（5~8 连几乎同音），玩家听不出升调。这里直接走音阶比值，
   * 让 1→8 连完整跨一个八度。
   */
  playComboHit(comboNum: number): void {
    if (!this.enabled) return;
    const scale = SCALE;
    const n = Math.min(comboNum, 8);
    const pitch = scale[n - 1];
    const vol = Math.min(1.0, 0.82 + (comboNum - 1) * 0.03);
    this._playComboEx(vol, pitch);

    if (comboNum > 8) {
      const idx2 = Math.min(comboNum - 9, scale.length - 1);
      const pitch2 = scale[idx2];
      const vol2 = Math.min(0.65, 0.35 + (comboNum - 9) * 0.05);
      // 第二八度：levelup 音色 + 音阶，避免再被 2.0 顶死
      this._playEx(AUDIO.levelup, vol2, pitch2);
    }

    if (comboNum >= 8) {
      this._playEx(AUDIO.attack, 0.3, pitch);
    } else if (comboNum >= 5) {
      this._playEx(AUDIO.eliminate, 0.2, pitch);
    }
  }

  playComboMilestone(comboNum: number): void {
    if (!this.enabled) return;
    const tier = getComboTier(comboNum);

    if (tier === 1 || tier === 2) {
      this._playEx(AUDIO.levelup, 0.6, SCALE[4]);
      setTimeout(() => {
        if (this.enabled) {
          this._playComboEx(0.45, SCALE[6]);
          this._playEx(AUDIO.eliminate, 0.35, SCALE[7]);
        }
      }, 40);
    } else if (tier === 3 || tier === 4) {
      this._playEx(AUDIO.skill, 0.7, SCALE[7]);
      setTimeout(() => {
        if (this.enabled) {
          this._playComboEx(0.5, SCALE[4]);
          this._playEx(AUDIO.attack, 0.4, SCALE[7]);
        }
      }, 50);
    } else if (tier >= 5) {
      this._playEx(AUDIO.boss, 0.6, SCALE[0]);
      setTimeout(() => {
        if (this.enabled) {
          this._playEx(AUDIO.victory, 0.5, SCALE[4]);
          this._playEx(AUDIO.skill, 0.4, SCALE[7]);
          this._playComboEx(0.35, SCALE[7]);
        }
      }, 60);
    }

    const interval = COMBO_MILESTONES[1]
      ? COMBO_MILESTONES[1].threshold - COMBO_MILESTONES[0].threshold
      : 3;
    if (comboNum >= 9 && comboNum % interval === 0) {
      const impactVol = Math.min(0.8, 0.5 + (comboNum / 10) * 0.1);
      this._playEx(AUDIO.boss, impactVol, 0.6);
      setTimeout(() => {
        if (this.enabled) this._playEx(AUDIO.victory, impactVol * 0.7, 1.0);
      }, 80);
    }
  }

  playEliminate(count: number): void {
    if (!this.enabled) return;
    if (count >= 5) {
      this._playEx(AUDIO.eliminate, 0.7, 1.2);
      this._playEx(AUDIO.skill, 0.3, 0.8);
      setTimeout(() => {
        if (this.enabled) this._playComboEx(0.25, 1.5);
      }, 30);
    } else if (count === 4) {
      this._playEx(AUDIO.eliminate, 0.55, 1.1);
      this._playComboEx(0.2, 1.3);
    } else {
      this._play(AUDIO.eliminate, 0.4);
    }
  }

  playPickUp(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.eliminate, 0.55, 1.3);
  }

  playSwap(): void {
    if (!this.enabled) return;
    if (this._swapPlaying) return;
    this._swapPlaying = true;
    this._playEx(AUDIO.rolling, 0.5, 1.3);
    setTimeout(() => { this._swapPlaying = false; }, 80);
  }

  playDragEnd(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.eliminate, 0.55, 0.8);
  }

  playAttack(): void {
    if (!this.enabled) return;
    this._play(AUDIO.attack, 0.5);
    this._playComboEx(0.15, 0.5);
  }

  playAttackCrit(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.attack, 0.65, 1.15);
    this.playCritHit();
  }

  playCritHit(): void {
    if (!this.enabled) return;
    this._playComboEx(0.7, 1.6);
    setTimeout(() => {
      if (this.enabled) this._playEx(AUDIO.attack, 0.6, 0.7);
    }, 50);
  }

  playPetDmgHit(isCrit: boolean): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.reward, isCrit ? 0.5 : 0.38, 1.8);
    this._playEx(AUDIO.eliminate, 0.2, 1.6);
    if (isCrit) this._playEx(AUDIO.levelup, 0.3, 1.5);
  }

  playEnemyAttack(dmgRatio?: number): void {
    if (!this.enabled) return;
    const vol = dmgRatio != null
      ? Math.min(0.8, 0.4 + dmgRatio * 0.6)
      : 0.5;
    this._playEx(AUDIO.enemyAttack, vol, 1.0);
  }

  playHeroHurt(dmgRatio?: number): void {
    if (!this.enabled) return;
    const vol = dmgRatio != null
      ? Math.min(0.7, 0.3 + dmgRatio * 0.5)
      : 0.4;
    this._playEx(AUDIO.heroHurt, vol, 1.0);
  }

  playBlock(): void {
    if (!this.enabled) return;
    this._play(AUDIO.block, 0.55);
  }

  playHeal(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.reward, 0.3, 1.2);
  }

  playPetSkill(): void {
    if (!this.enabled) return;
    this._play(AUDIO.petSkill, 0.7);
  }

  playSkill(): void {
    if (!this.enabled) return;
    this._play(AUDIO.skill, 0.6);
  }

  playEnemySkill(): void {
    if (!this.enabled) return;
    this._play(AUDIO.enemySkill, 0.6);
  }

  playBoss(): void {
    if (!this.enabled) return;
    this._play(AUDIO.boss, 0.7);
  }

  playVictory(): void {
    if (!this.enabled) return;
    this._play(AUDIO.victory, 0.6);
  }

  playGameOver(): void {
    if (!this.enabled) return;
    this._play(AUDIO.gameover, 0.6);
  }

  playNextFloor(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.skill, 0.4, 1.3);
    setTimeout(() => {
      if (this.enabled) this._playEx(AUDIO.reward, 0.45, 1.5);
    }, 40);
    setTimeout(() => {
      if (this.enabled) this._playEx(AUDIO.levelup, 0.4, 1.3);
    }, 90);
  }

  private _poolSizeFor(src: string, requested?: number): number {
    if (src === AUDIO.combo) return this._comboPoolSize;
    return requested ?? this._poolSize;
  }

  private _getPooled(src: string, poolSize?: number): WechatMinigame.InnerAudioContext | null {
    if (!Platform.isMinigame) return null;
    const size = this._poolSizeFor(src, poolSize);
    if (!this._sfxPool[src]) {
      this._sfxPool[src] = { idx: 0, items: [] };
      for (let i = 0; i < size; i++) {
        const a = Platform.createInnerAudioContext();
        if (!a) continue;
        a.src = src;
        this._sfxPool[src].items.push(a);
      }
    }
    const pool = this._sfxPool[src];
    if (pool.items.length === 0) return null;
    const a = pool.items[pool.idx % pool.items.length];
    pool.idx++;
    return a;
  }

  private _play(src: string, volume?: number): void {
    const a = this._getPooled(src);
    if (!a) return;
    if (volume !== undefined) a.volume = volume;
    this._applyRate(a, 1.0);
    try { a.stop(); } catch (_) {}
    try { a.seek(0); } catch (_) {}
    a.play();
  }

  /** 支持 playbackRate 变调（xiao_chu _playSfxEx + BGM 双保险） */
  private _playEx(src: string, volume: number, playbackRate: number, poolSize?: number): void {
    const a = this._getPooled(src, poolSize);
    if (!a) return;
    a.volume = volume;
    try { a.stop(); } catch (_) {}
    try { a.seek(0); } catch (_) {}
    const rate = playbackRate !== 1.0 ? playbackRate : 1.0;
    this._applyRate(a, rate);
    a.play();
  }

  private _applyRate(a: WechatMinigame.InnerAudioContext, rate: number): void {
    a.playbackRate = rate;
    if (rate === 1.0) return;
    try {
      a.onCanplay(() => { a.playbackRate = rate; });
      a.onPlay(() => { a.playbackRate = rate; });
    } catch (_) {}
    setTimeout(() => { a.playbackRate = rate; }, 50);
  }

  private _playComboEx(volume: number, playbackRate: number): void {
    this._playEx(AUDIO.combo, volume, playbackRate, this._comboPoolSize);
  }
}

export const SfxManager = new SfxManagerClass();
