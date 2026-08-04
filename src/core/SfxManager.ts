/**
 * 国风音效管理 — 移植自 xiao_chu/js/runtime/music.js
 *
 * 转珠交互、消除连击、战斗伤害等 SFX；BGM 仍由 BgmManager 负责。
 *
 * 短音效留在包内（见 CdnConfig.bundledDirs），因为它们要求「按下即响」，
 * 且走 CDN 时一旦 manifest 漏登记就会整局静音。只有 BGM 走 CDN，
 * 那里播放前必须 resolveOrDownload，不可直接用逻辑路径。
 */
import { AUDIO } from '@/config/Audio';
import { ensureAudioSubpackage } from '@/config/Subpackages';
import { CdnAssetService } from '@/core/CdnAssetService';
import { BgmManager } from '@/core/BgmManager';
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

/** 全部短音效（不含 BGM）。战斗进场时整批预热，见 BattleScene._enter */
export const SFX_PATHS = Object.values(AUDIO).filter(
  (p) => p !== AUDIO.mainBgm && p !== AUDIO.bossBgm,
);

/**
 * 一次只可能响一声的音效，池给 1 就够。
 *
 * 这不是省内存的微调：默认池 4 × 35 条音效 = 140 个 InnerAudioContext，
 * 部分机型到不了这个数就创建失败，代价是整类音效静默。
 * 只有真会自身重叠的（连点按钮、多段消除、逐回合跳伤）才需要多个实例。
 */
const SINGLE_SHOT: ReadonlySet<string> = new Set([
  AUDIO.petLevelup, AUDIO.petStarup,
  AUDIO.gachaDraw, AUDIO.gachaRevealRare,
  AUDIO.rewardGet, AUDIO.chestOpen, AUDIO.shopPurchase,
  AUDIO.sceneTransition, AUDIO.errorDenied,
  AUDIO.enemyCharge, AUDIO.gateActivate, AUDIO.gateBroken,
  AUDIO.phaseShift, AUDIO.shieldGain, AUDIO.orbSeal,
  AUDIO.victory, AUDIO.gameover, AUDIO.boss,
]);

/** UI 点击会被连点，2 个实例足够错开相邻两声 */
const UI_TAP_POOL_SIZE = 2;
const UI_TAPS: ReadonlySet<string> = new Set([AUDIO.uiClick, AUDIO.uiBack, AUDIO.uiTab]);

/**
 * 启动时预建池的范围：进首页就可能触发的。
 * 其余（抽卡、升星、闸门…）留给首次播放时懒建 —— 那些场合都有动画铺垫，
 * 晚一帧无感，换来启动时少建几十个音频实例。
 */
const EAGER_WARMUP: readonly string[] = [
  AUDIO.uiClick, AUDIO.uiBack, AUDIO.uiTab, AUDIO.errorDenied,
  AUDIO.eliminate, AUDIO.combo, AUDIO.rolling,
  AUDIO.attack, AUDIO.enemyAttack, AUDIO.heroHurt, AUDIO.block,
  AUDIO.petSkill, AUDIO.skill, AUDIO.enemySkill,
];

type SfxPool = { idx: number; items: WechatMinigame.InnerAudioContext[] };

class SfxManagerClass {
  enabled = true;
  /** 总音量倍率（设置面板调节）；单条 playXxx 的 volume 再叠在这之上 */
  private _masterVolume = 1;
  private _sfxPool: Record<string, SfxPool> = {};
  /** 逻辑路径 → 可播路径（USER_DATA 缓存或包内） */
  private _resolvedSrc: Record<string, string> = {};
  private _resolving = new Map<string, Promise<string>>();
  private readonly _poolSize = 4;
  private readonly _comboPoolSize = 8;
  private _swapPlaying = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setMasterVolume(volume: number): void {
    this._masterVolume = Math.max(0, Math.min(1, volume));
  }

  get masterVolume(): number {
    return this._masterVolume;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * 预建池，避免首次触发时无声。默认只热高频音效（EAGER_WARMUP），
   * 低频的等真正播放时懒建。
   *
   * 必须等 pkg-audio 分包就位：短音效现在留在包内，分包未加载时
   * 逻辑路径还不可读，建池会拿不到 src。loadSubpackage 幂等，重复 await 无代价。
   */
  async warmup(paths: readonly string[] = EAGER_WARMUP): Promise<void> {
    if (!Platform.isMinigame) return;
    await ensureAudioSubpackage().catch((e) => {
      console.warn('[SfxManager] audio 分包加载失败', e);
    });
    await Promise.all(paths.map(async (p) => {
      try {
        await this._ensureResolved(p);
        this._ensurePool(p);
      } catch (e) {
        console.warn('[SfxManager] warmup fail:', p, e);
      }
    }));
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
    // 上滑施法瞬间要盖过战斗 BGM；旧 pet_skill 峰值过低时像没声音
    BgmManager.duck(0.25, 700);
    this._play(AUDIO.petSkill, 0.9);
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
    // 胜利音必须压过 BGM；短暂压低背景，否则结算一刻像没声音
    BgmManager.duck(0.15, 1600);
    this._play(AUDIO.victory, 0.9);
  }

  playGameOver(): void {
    if (!this.enabled) return;
    // 失败孤笛约 2.6s；压 BGM 让下行尾音不被盖掉
    BgmManager.duck(0.1, 2800);
    this._play(AUDIO.gameover, 0.95);
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

  // ── UI 交互 ──
  // 点击音会被高频连点触发；音量不能太低——手机喇叭对短促瞬态本就弱，
  // 0.4 档实测像「没声音」。压戏靠音效本身短干，不靠把音量抹掉。

  playUiClick(): void {
    if (!this.enabled) return;
    this._play(AUDIO.uiClick, 0.8);
  }

  playUiBack(): void {
    if (!this.enabled) return;
    this._play(AUDIO.uiBack, 0.75);
  }

  playUiTab(): void {
    if (!this.enabled) return;
    this._play(AUDIO.uiTab, 0.8);
  }

  /** 操作被拒（体力不足/条件不满足），给明确反馈避免玩家反复点 */
  playDenied(): void {
    if (!this.enabled) return;
    this._play(AUDIO.errorDenied, 0.75);
  }

  playSceneTransition(): void {
    if (!this.enabled) return;
    this._play(AUDIO.sceneTransition, 0.55);
  }

  // ── 养成与奖励 ──

  playPetLevelUp(): void {
    if (!this.enabled) return;
    this._play(AUDIO.petLevelup, 0.8);
  }

  playPetStarUp(): void {
    if (!this.enabled) return;
    this._play(AUDIO.petStarup, 0.85);
  }

  playGachaDraw(): void {
    if (!this.enabled) return;
    this._play(AUDIO.gachaDraw, 0.8);
  }

  playGachaReveal(): void {
    if (!this.enabled) return;
    this._play(AUDIO.gachaRevealRare, 0.9);
  }

  playRewardGet(): void {
    if (!this.enabled) return;
    this._play(AUDIO.rewardGet, 0.8);
  }

  playChestOpen(): void {
    if (!this.enabled) return;
    this._play(AUDIO.chestOpen, 0.8);
  }

  playShopPurchase(): void {
    if (!this.enabled) return;
    this._play(AUDIO.shopPurchase, 0.8);
  }

  // ── 战斗信息 ──

  /** 敌人蓄力预警：玩家靠它决定攒盾还是抢输出，音量给足 */
  playEnemyCharge(): void {
    if (!this.enabled) return;
    this._play(AUDIO.enemyCharge, 0.85);
  }

  playGateActivate(): void {
    if (!this.enabled) return;
    this._play(AUDIO.gateActivate, 0.85);
  }

  playGateBroken(): void {
    if (!this.enabled) return;
    this._play(AUDIO.gateBroken, 0.8);
  }

  playPhaseShift(): void {
    if (!this.enabled) return;
    this._play(AUDIO.phaseShift, 0.85);
  }

  playShieldGain(): void {
    if (!this.enabled) return;
    this._play(AUDIO.shieldGain, 0.7);
  }

  /** 每回合都响，音量必须压住，否则几回合就烦 */
  playDotTick(): void {
    if (!this.enabled) return;
    this._play(AUDIO.dotTick, 0.45);
  }

  playOrbSeal(): void {
    if (!this.enabled) return;
    this._play(AUDIO.orbSeal, 0.75);
  }

  private _poolSizeFor(src: string, requested?: number): number {
    if (src === AUDIO.combo) return this._comboPoolSize;
    if (requested != null) return requested;
    if (SINGLE_SHOT.has(src)) return 1;
    if (UI_TAPS.has(src)) return UI_TAP_POOL_SIZE;
    return this._poolSize;
  }

  private _ensureResolved(logical: string): Promise<string> {
    const hit = this._resolvedSrc[logical];
    if (hit) return Promise.resolve(hit);

    const sync = CdnAssetService.resolveAsset(logical);
    if (sync) {
      this._resolvedSrc[logical] = sync;
      this._applySrcToPool(logical, sync);
      return Promise.resolve(sync);
    }

    if (!CdnAssetService.isCdnPath(logical)) {
      this._resolvedSrc[logical] = logical;
      return Promise.resolve(logical);
    }

    const inflight = this._resolving.get(logical);
    if (inflight) return inflight;

    const p = CdnAssetService.resolveOrDownload(logical)
      .then((src) => {
        this._resolvedSrc[logical] = src;
        this._applySrcToPool(logical, src);
        this._resolving.delete(logical);
        return src;
      })
      .catch((e) => {
        this._resolving.delete(logical);
        throw e;
      });
    this._resolving.set(logical, p);
    return p;
  }

  private _applySrcToPool(logical: string, src: string): void {
    const pool = this._sfxPool[logical];
    if (!pool) return;
    for (const a of pool.items) {
      try { a.src = src; } catch (_) { /* ignore */ }
    }
  }

  private _ensurePool(src: string, poolSize?: number): SfxPool | null {
    if (!Platform.isMinigame) return null;
    const size = this._poolSizeFor(src, poolSize);
    if (!this._sfxPool[src]) {
      this._sfxPool[src] = { idx: 0, items: [] };
      const resolved = this._resolvedSrc[src];
      for (let i = 0; i < size; i++) {
        const a = Platform.createInnerAudioContext();
        if (!a) continue;
        if (resolved) a.src = resolved;
        this._sfxPool[src].items.push(a);
      }
    }
    return this._sfxPool[src];
  }

  private _getPooled(src: string, poolSize?: number): WechatMinigame.InnerAudioContext | null {
    if (!this._resolvedSrc[src]) return null;
    const pool = this._ensurePool(src, poolSize);
    if (!pool || pool.items.length === 0) return null;
    const a = pool.items[pool.idx % pool.items.length];
    pool.idx++;
    return a;
  }

  private _play(src: string, volume?: number): void {
    this._playEx(src, volume ?? 1, 1.0);
  }

  /** 支持 playbackRate 变调（xiao_chu _playSfxEx + BGM 双保险） */
  private _playEx(src: string, volume: number, playbackRate: number, poolSize?: number): void {
    if (!this._resolvedSrc[src]) {
      const sync = CdnAssetService.resolveAsset(src);
      if (sync) {
        this._resolvedSrc[src] = sync;
      } else if (!CdnAssetService.isCdnPath(src)) {
        /**
         * 包内音效：直接用逻辑路径，不因 fs 探测失败而丢掉这一次播放。
         * 分包刚加载完时 accessSync 可能仍报错，而此时 InnerAudioContext
         * 用逻辑路径已经能播——之前卡在这里会让整局技能音全哑。
         */
        this._resolvedSrc[src] = src;
      } else {
        // 尚未下载：触发 CDN，本次跳过（warmup 后应已就绪）
        void this._ensureResolved(src).catch((e) => {
          console.warn('[SfxManager] resolve fail:', src, e);
        });
        return;
      }
    }

    const a = this._getPooled(src, poolSize);
    if (!a) return;
    a.volume = Math.max(0, Math.min(1, volume * this._masterVolume));
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
