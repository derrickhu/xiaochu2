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
import { getComboTier } from '@/scenes/battle/ComboDisplay';
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
  (p) => p !== AUDIO.mainBgm && p !== AUDIO.battleBgm && p !== AUDIO.bossBgm,
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
  AUDIO.comboC1, AUDIO.comboC2, AUDIO.comboC3, AUDIO.comboC4,
  AUDIO.comboC5, AUDIO.comboC6, AUDIO.comboC7, AUDIO.comboC8,
  AUDIO.comboC9, AUDIO.comboC10, AUDIO.comboC11, AUDIO.comboC12,
  AUDIO.levelupSol, AUDIO.comboSi, AUDIO.eliminateDo,
  AUDIO.attack, AUDIO.enemyAttack, AUDIO.heroHurt, AUDIO.block,
  AUDIO.petSkill, AUDIO.skill, AUDIO.enemySkill,
];

/**
 * 连击 1–12 预烘焙升调采样（×1.30 → ×3.28），播放时 rate 恒为 1。
 * 12 档已越过 playbackRate 的 2.0 上限，这正是运行时变调做不到、
 * 而「第 8 连之后音高不再变化」的老问题的解法。
 */
const COMBO_LADDER: readonly string[] = [
  AUDIO.comboC1, AUDIO.comboC2, AUDIO.comboC3, AUDIO.comboC4,
  AUDIO.comboC5, AUDIO.comboC6, AUDIO.comboC7, AUDIO.comboC8,
  AUDIO.comboC9, AUDIO.comboC10, AUDIO.comboC11, AUDIO.comboC12,
];

/**
 * 每档音阶只在一次连击链里响一次，且相邻两档至少隔一个节拍，
 * 给 2 个实例就够。给 8 会让 12 档吃掉 96 个 InnerAudioContext，
 * 部分机型建不出来，代价是整类音效静默。
 */
const COMBO_LADDER_POOL = 2;

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
   * 连击主音递进 —— 12 档预烘焙音阶，一路升到 ×3.28。
   *
   * 高音天然更薄更短，所以音量随连击补、并逐段垫低频层：只让音高上行的话，
   * 第 10 连听起来反而比第 3 连还小，这就是「越连越平」的直接来源。
   */
  playComboHit(comboNum: number): void {
    if (!this.enabled) return;
    const idx = Math.min(comboNum, COMBO_LADDER.length) - 1;
    const vol = Math.min(1.0, 0.88 + comboNum * 0.015);
    this._playEx(COMBO_LADDER[idx], vol, 1.0, COMBO_LADDER_POOL);

    if (comboNum >= 9) {
      this._playEx(AUDIO.attack, 0.5, 0.72);
      this._playEx(AUDIO.levelup, 0.38, 1.45);
    } else if (comboNum >= 6) {
      this._playEx(AUDIO.attack, 0.38, 0.85);
    } else if (comboNum >= 3) {
      this._playEx(AUDIO.eliminate, 0.24, 1.3);
    }
  }

  /**
   * 连击里程碑和弦 —— 定音 →（停顿）→ 和弦 →（高 tier 再补尾轰）。
   *
   * 两段之间的空白就是玩家听到的「停顿」，间隔与 duck 时长都跟着 tier 拉长，
   * 配合 comboRhythm 里同步变长的画面空拍；只加长画面不加长声音，
   * 听感就会变成「卡了一下」而不是「顿了一拍」。
   */
  playComboMilestone(comboNum: number): void {
    if (!this.enabled) return;
    const tier = getComboTier(comboNum);
    BgmManager.duck(tier >= 3 ? 0.08 : 0.12, 700 + tier * 220);
    const gap = 90 + tier * 24;

    if (tier <= 2) {
      this._playEx(AUDIO.levelupSol, 0.95, 1.0);
      setTimeout(() => {
        if (!this.enabled) return;
        this._playEx(AUDIO.comboSi, 0.75, 1.0, COMBO_LADDER_POOL);
        this._playEx(AUDIO.eliminateDo, 0.6, 1.0);
      }, gap);
    } else if (tier <= 4) {
      this._playEx(AUDIO.skill, 0.8, 0.9);
      this._playEx(AUDIO.levelupSol, 0.5, 1.0);
      setTimeout(() => {
        if (!this.enabled) return;
        this._playEx(AUDIO.comboC10, 0.6, 1.0, COMBO_LADDER_POOL);
        this._playEx(AUDIO.attack, 0.55, 0.75);
      }, gap);
      setTimeout(() => {
        if (this.enabled) this._playEx(AUDIO.boss, 0.5, 1.0);
      }, gap * 2);
    } else {
      this._playEx(AUDIO.boss, 0.75, 1.0);
      this._playEx(AUDIO.skill, 0.5, 0.7);
      setTimeout(() => {
        if (!this.enabled) return;
        this._playEx(AUDIO.comboC12, 0.6, 1.0, COMBO_LADDER_POOL);
        this._playEx(AUDIO.attack, 0.6, 0.7);
      }, gap);
      setTimeout(() => {
        if (this.enabled) this._playEx(AUDIO.victory, 0.6, 1.0);
      }, gap * 2);
    }
  }

  /**
   * 消除音层次 — 对齐 xiao_chu playEliminate（不跟连击 pitch，避免盖住主音阶）。
   */
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
      this._playEx(AUDIO.eliminate, 0.4, 1.0);
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
    // 只播一记脆响。再叠低频或 attack 会糊成落石。
    const vol = dmgRatio != null
      ? Math.min(0.64, 0.50 + dmgRatio * 0.16)
      : 0.54;
    BgmManager.duck(0.10, 140);
    this._playEx(AUDIO.enemyAttack, vol, 1.0);
    this._playComboEx(0.12, 0.48);
  }

  playHeroHurt(dmgRatio?: number): void {
    if (!this.enabled) return;
    const vol = dmgRatio != null
      ? Math.min(0.38, 0.2 + dmgRatio * 0.22)
      : 0.26;
    this._playEx(AUDIO.heroHurt, vol, 0.9);
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
    // ★3+ 叠在 playSkill 上；素材沿用 xiao_chu（偏轻），靠 duck 保证听得见
    BgmManager.duck(0.25, 700);
    this._play(AUDIO.petSkill, 0.7);
  }

  playSkill(): void {
    if (!this.enabled) return;
    this._play(AUDIO.skill, 0.6);
  }

  /*
   * ── 技能专属命中层 ──
   *
   * 瞬发直伤此前与消珠普攻共用 playAttack + playPetDmgHit，两者听感完全一样，
   * 于是「攒了五回合的核爆」和「顺手消一组珠」在耳朵里没有分别。下面几条不引入新素材，
   * 靠已有片段的音高与叠法拉开差异：核爆压低成一记闷轰，多段技逐段爬音阶，
   * 增益走上扬和弦。素材到位后可整体替换，调用点不用动。
   */

  /** 瞬发直伤命中：重击额外铺一层低频轰 + 尾音 */
  playSkillImpact(heavy: boolean): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.skill, heavy ? 0.85 : 0.55, heavy ? 0.72 : 0.98);
    if (!heavy) return;
    this._playEx(AUDIO.boss, 0.5, 0.6);
    setTimeout(() => {
      if (this.enabled) this._playEx(AUDIO.levelup, 0.38, 1.35);
    }, 70);
  }

  /** 多段技第 index 段（0 基）：逐段爬音阶，最后一段落回主音收尾 */
  playSkillMultiHit(index: number, total: number): void {
    if (!this.enabled) return;
    const last = index >= total - 1;
    const pitch = SCALE[Math.min(index, SCALE.length - 1)];
    this._playEx(AUDIO.attack, last ? 0.62 : 0.42, pitch);
    if (last) this._playEx(AUDIO.skill, 0.6, 0.85);
  }

  /** 增益 / 治疗 / 护盾类技能：上扬和弦，与直伤的下沉感区分 */
  playSkillBuff(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.levelup, 0.5, 1.1);
    this._playComboEx(0.3, SCALE[4]);
  }

  /** 转珠 / 净化类：扫过盘面的沙沙声 */
  playSkillBoardWave(): void {
    if (!this.enabled) return;
    this._playEx(AUDIO.rolling, 0.6, 1.15);
    this._playEx(AUDIO.eliminate, 0.28, 1.5);
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
    // 胜利短曲约 8.5s，压 BGM 全程，否则中段被战斗曲盖掉
    BgmManager.duck(0.12, 8500);
    this._play(AUDIO.victory, 0.95);
  }

  playGameOver(): void {
    if (!this.enabled) return;
    // 失败孤笛约 2.6s；压 BGM 让下行尾音不被盖掉
    BgmManager.duck(0.1, 2800);
    this._play(AUDIO.gameover, 0.95);
  }

  /** 离开结算板时掐掉胜负短曲，避免切场景后还在响 */
  stopSettlementSting(): void {
    this._stop(AUDIO.victory);
    this._stop(AUDIO.gameover);
    BgmManager.unduck();
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
    // 护盾是信息音，不能盖过战斗反馈；旧版太亮太突
    this._play(AUDIO.shieldGain, 0.45);
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
    // 音阶档位是单发的，池必须小，否则 12 档 × 8 会把音频实例配额吃干
    if (src === AUDIO.comboSi || COMBO_LADDER.includes(src)) return COMBO_LADDER_POOL;
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

  private _stop(src: string): void {
    const pool = this._sfxPool[src];
    if (!pool) return;
    for (const a of pool.items) {
      try { a.stop(); } catch (_) { /* ignore */ }
    }
  }

  /**
   * 支持 playbackRate 变调。
   * 对齐 xiao_chu：先设 rate → play → 立刻再设一次（微信小游戏部分机型 play 后才吃 rate）。
   * 不再每次挂 onCanplay/onPlay，避免池化实例监听器堆叠互相打架。
   */
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
    const rate = Math.max(0.5, Math.min(2.0, playbackRate));
    a.playbackRate = rate;
    a.play();
    if (rate !== 1.0) {
      a.playbackRate = rate;
      setTimeout(() => { a.playbackRate = rate; }, 16);
    }
  }

  private _playComboEx(volume: number, playbackRate: number): void {
    this._playEx(AUDIO.combo, volume, playbackRate, this._comboPoolSize);
  }
}

export const SfxManager = new SfxManagerClass();
