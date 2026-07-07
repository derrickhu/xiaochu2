/**
 * 国风音效管理 — 移植自 xiao_chu/js/runtime/music.js
 *
 * 转珠交互、消除连击、战斗伤害等 SFX；BGM 仍由 BgmManager 负责。
 */
import { AUDIO } from '@/config/Audio';
import { COMBO_MILESTONES, getComboTier } from '@/scenes/battle/ComboDisplay';
import { Platform } from './PlatformService';

/** 连击音阶（十二平均律，以 combo.mp3 为 Do 基准） */
const SCALE = [
  1.0, 1.122, 1.26, 1.335, 1.498, 1.682, 1.888, 2.0,
] as const;

type SfxPool = { idx: number; items: WechatMinigame.InnerAudioContext[] };

class SfxManagerClass {
  enabled = true;
  private _sfxPool: Record<string, SfxPool> = {};
  private readonly _poolSize = 4;
  private _swapPlaying = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playComboHit(comboNum: number): void {
    if (!this.enabled) return;
    const n = Math.min(comboNum, 8);
    const pitch = SCALE[n - 1];
    const vol = Math.min(1.0, 0.85 + (comboNum - 1) * 0.025);
    this._playEx(AUDIO.combo, vol, Math.min(2.0, pitch * 1.3));

    if (comboNum > 8) {
      const idx2 = Math.min(comboNum - 9, SCALE.length - 1);
      const pitch2 = SCALE[idx2];
      const vol2 = Math.min(0.6, 0.3 + (comboNum - 9) * 0.05);
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
          this._playEx(AUDIO.combo, 0.45, SCALE[6]);
          this._playEx(AUDIO.eliminate, 0.35, SCALE[7]);
        }
      }, 40);
    } else if (tier === 3 || tier === 4) {
      this._playEx(AUDIO.skill, 0.7, SCALE[7]);
      setTimeout(() => {
        if (this.enabled) {
          this._playEx(AUDIO.combo, 0.5, SCALE[4]);
          this._playEx(AUDIO.attack, 0.4, SCALE[7]);
        }
      }, 50);
    } else if (tier >= 5) {
      this._playEx(AUDIO.boss, 0.6, SCALE[0]);
      setTimeout(() => {
        if (this.enabled) {
          this._playEx(AUDIO.victory, 0.5, SCALE[4]);
          this._playEx(AUDIO.skill, 0.4, SCALE[7]);
          this._playEx(AUDIO.combo, 0.35, SCALE[7]);
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
        if (this.enabled) this._playEx(AUDIO.combo, 0.25, 1.5);
      }, 30);
    } else if (count === 4) {
      this._playEx(AUDIO.eliminate, 0.55, 1.1);
      this._playEx(AUDIO.combo, 0.2, 1.3);
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
    this._playEx(AUDIO.combo, 0.15, 0.5);
  }

  playAttackCrit(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.attack, 0.65, 1.15);
    this.playCritHit();
  }

  playCritHit(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.combo, 0.7, 1.6);
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

  private _getPooled(src: string): WechatMinigame.InnerAudioContext | null {
    if (!Platform.isMinigame) return null;
    if (!this._sfxPool[src]) {
      this._sfxPool[src] = { idx: 0, items: [] };
      for (let i = 0; i < this._poolSize; i++) {
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
    a.playbackRate = 1.0;
    try { a.stop(); } catch (_) {}
    try { a.seek(0); } catch (_) {}
    a.play();
  }

  private _playEx(src: string, volume: number, playbackRate: number): void {
    const a = this._getPooled(src);
    if (!a) return;
    a.volume = volume;
    try { a.stop(); } catch (_) {}
    try { a.seek(0); } catch (_) {}
    const rate = playbackRate !== 1.0 ? playbackRate : 1.0;
    a.playbackRate = rate;
    a.play();
    if (rate !== 1.0) a.playbackRate = rate;
  }
}

export const SfxManager = new SfxManagerClass();
