/**
 * 灵宠详情场景：三维条形可视化 + 升级（消耗经验池）+ 升星（消耗碎片）+ 上阵/下阵。
 *
 * 数值与养成进度全部读写 PlayerData，单一真源。
 * 全场景走 @/ui（主题色 / 通用按钮 / 面板），不再硬编码暗色与自绘按钮。
 * 养成成功时局部刷新 + 数字 countUp + 粒子 + 闪光 + 震动反馈。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TextureCache } from '@/core/TextureCache';
import { getPetAvatarTexture } from '@/config/petAvatarTexture';
import { ensurePetAvatars, petDetailPreloadImages, petDetailAvatarEntry } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';
import { UI } from '@/balance/ui';
import { PET_MAP, type PetDef, INITIAL_PET_LEVEL, INITIAL_PET_STAR } from '@/balance/pets';
import { getStarProfile, MAX_PET_STAR } from '@/balance/growth';
import { getStatUi, type StatKey } from '@/balance/petRoles';
import { getRarity } from '@/balance/rarity';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import { skillForPet } from '@/game/battle/SkillEngine';
import { passiveDisplayLines } from './abilityInfo';
import {
  petFrameImage, BACKGROUND_IMAGES, UI_FX_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE, RADIUS,
  makeButton, makeCoverBackground, makePanel, makeText, makeProgressBar, makeTopBar,
  makeRarityElementRoleLine, makeLevelStarLine, SceneFx, popIn, countUp, pulse,
  type ProgressBarHandle,
} from '@/ui';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';

export interface PetDetailEnterData {
  petId: string;
  /** 返回目标场景，默认 codex */
  backScene?: string;
  /** 返回时传给 backScene 的 onEnter 数据 */
  backData?: unknown;
  /** 仅查看属性（隐藏升级/上阵），章节目标卡等入口使用 */
  preview?: boolean;
}

interface StatRow {
  bar: ProgressBarHandle;
  value: PIXI.Text;
}

export class PetDetailScene implements Scene {
  readonly name = 'petDetail';
  readonly container = new PIXI.Container();

  /** 页面内容层（操作后只重建这层，特效层常驻） */
  private _content = new PIXI.Container();
  private _fx: SceneFx | null = null;

  private _petId = '';
  private _backScene = 'codex';
  private _backData: unknown;
  private _preview = false;

  // 局部刷新与反馈所需引用（每次 build 重置）
  private _avatar: PIXI.Container | null = null;
  private _starRow: PIXI.Container | null = null;
  private _statRows: Partial<Record<StatKey, StatRow>> = {};
  private _avatarCenter = new PIXI.Point();
  /** 各维「满养成潜力」上限，用于条形归一 */
  private _statPotential: Record<StatKey, number> = { atk: 1, hp: 1, rcv: 1 };
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(data?: unknown): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const enter = data as PetDetailEnterData | undefined;
    this._petId = enter?.petId ?? PlayerData.ownedPets[0] ?? '';
    this._backScene = enter?.backScene ?? 'codex';
    this._backData = enter?.backData;
    this._preview = enter?.preview ?? false;
    this._fx?.destroy();
    this._fx = null;
    this._mountEnterShell();
    const token = this._enterSeq.next();
    // 下一帧先铺骨架 UI（不等分包），避免 preload 期间整屏空白
    deferSceneBuild(token, this._enterSeq, 'petDetail', () => this._buildSafe());
    void this._enter(token);
  }

  /** 异步 preload 完成前先铺深色底 + 加载提示，避免真机切场景白屏 */
  private _mountEnterShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    const base = new PIXI.Graphics();
    base.beginFill(0x1a1126);
    base.drawRect(0, 0, w, h);
    base.endFill();
    this.container.addChild(base);
    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.home, w, h));
    if (this._content.destroyed) this._content = new PIXI.Container();
    this.container.addChild(this._content);
    const hint = makeText('加载中…', {
      size: FONT_SIZE.sm, fill: COLORS.textInverse, anchor: 0.5,
    });
    hint.name = 'petDetailLoading';
    hint.position.set(w / 2, h / 2);
    this.container.addChild(hint);
  }

  private _prepareContentLayer(): void {
    if (this._content.destroyed) this._content = new PIXI.Container();
    if (this._content.parent !== this.container) {
      this.container.addChild(this._content);
    }
    this.container.getChildByName('petDetailLoading')?.destroy();
  }

  private _buildSafe(): void {
    try {
      this._prepareContentLayer();
      this._build();
      this._ensureSceneFx();
    } catch (e) {
      console.error('[PetDetailScene] _build 失败:', e);
      this._buildErrorFallback();
    }
  }

  private _buildErrorFallback(): void {
    this._prepareContentLayer();
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._content.removeChildren().forEach((c) => c.destroy({ children: true }));
    const msg = makeText('页面加载异常', {
      size: FONT_SIZE.md, fill: COLORS.textMain, anchor: 0.5,
    });
    msg.position.set(w / 2, h / 2 - 40);
    this._content.addChild(msg);
    const back = makeButton({
      label: '返回', width: 220, height: 60, variant: 'primary',
      onTap: () => SceneManager.switchTo(this._backScene, this._backData),
    });
    back.position.set(w / 2, h / 2 + 40);
    this._content.addChild(back);
  }

  /** 特效层须在 UI 之后挂载，且 FlashOverlay 空闲时不可见（见 FlashOverlay） */
  private _ensureSceneFx(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._fx?.destroy();
    this._fx = new SceneFx();
    this._fx.build(this.container, w, h);
  }

  private async _enter(token: number): Promise<void> {
    try {
      await ensureAssets(petDetailPreloadImages(this._petId));
    } catch (e) {
      console.warn('[PetDetailScene] 资源预加载部分失败:', e);
    }
    const avatarEntry = this._preview
      ? { petId: this._petId, star: 1 as const }
      : petDetailAvatarEntry(this._petId);
    if (avatarEntry) {
      try {
        await ensurePetAvatars([avatarEntry]);
      } catch (e) {
        console.warn('[PetDetailScene] 头像加载失败:', e);
      }
    }
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'petDetail', () => this._buildSafe());
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._fx?.destroy();
    this._fx = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._content = new PIXI.Container();
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._content.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._statRows = {};
    this._avatar = null;
    this._starRow = null;

    this._content.addChild(makeCoverBackground(BACKGROUND_IMAGES.petDetail, w, h));

    const pet = PET_MAP.get(this._petId);
    if (!pet) {
      const back = makeButton({
        label: '返回灵宠', width: 220, height: 60, variant: 'primary',
        onTap: () => SceneManager.switchTo('codex'),
      });
      back.position.set(w / 2, h / 2);
      this._content.addChild(back);
      return;
    }

    const lv = this._preview ? INITIAL_PET_LEVEL : PlayerData.petLevel(this._petId);
    const star = this._preview ? INITIAL_PET_STAR : PlayerData.petStar(this._petId);

    this._content.addChild(makeTopBar({
      title: pet.name, width: w, centerY: Game.safeTop + 36,
      onBack: () => SceneManager.switchTo(this._backScene, this._backData),
    }));

    const avatarCY = Game.safeTop + 170;
    this._buildAvatar(pet, star, w / 2, avatarCY);

    const meta = makeRarityElementRoleLine(pet.rarity, pet.element, pet.role, { size: FONT_SIZE.sm });
    meta.position.set(w / 2 - meta.width / 2, avatarCY + 130);
    this._content.addChild(meta);

    const maxLv = getStarProfile(star).maxLevel;
    this._starRow = makeLevelStarLine({
      level: lv, star, maxLevel: maxLv, size: FONT_SIZE.sm, emptyStyle: 'hollow',
    });
    this._starRow.position.set(w / 2 - this._starRow.width / 2, avatarCY + 168);
    this._content.addChild(this._starRow);

    const statBottom = this._buildStatPanel(pet, lv, star, w, avatarCY + 208);
    const abilityBottom = this._buildAbilityPanel(pet, lv, star, w, statBottom + 16);
    if (this._preview) {
      this._buildPreviewHint(w, abilityBottom + 24);
    } else {
      this._buildActionButtons(w, h, abilityBottom + 20);
    }
  }

  /** 章节收录等预览入口：说明文案，不提供养成操作 */
  private _buildPreviewHint(w: number, y: number): void {
    const hint = makeText('章节收录预览 · 以 ★1 初始属性展示', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5,
    });
    hint.position.set(w / 2, y);
    this._content.addChild(hint);
  }

  private _buildAvatar(pet: PetDef, star: number, cx: number, cy: number): void {
    this._avatarCenter.set(cx, cy);
    const holder = new PIXI.Container();
    holder.position.set(cx, cy);

    const frameTex = TextureCache.get(petFrameImage(pet.element));
    if (frameTex) {
      const frame = new PIXI.Sprite(frameTex);
      frame.anchor.set(0.5);
      frame.scale.set(248 / Math.max(frame.width, frame.height));
      holder.addChild(frame);
    }

    const tex = getPetAvatarTexture(pet.id, star);
    if (tex) {
      const avatar = new PIXI.Sprite(tex);
      avatar.anchor.set(0.5);
      avatar.scale.set(200 / Math.max(avatar.width, avatar.height));
      holder.addChild(avatar);
    }
    this._content.addChild(holder);
    this._avatar = holder;
  }

  /** 三维条形面板：每维 标签 + 进度条（相对满养成潜力）+ 数值 */
  private _buildStatPanel(pet: PetDef, lv: number, star: number, w: number, y: number): number {
    const panelW = 640;
    const panelH = 162;
    const left = w / 2 - panelW / 2;
    this._content.addChild(this._panelAt(panelW, panelH, left, y));

    const maxStarLv = getStarProfile(MAX_PET_STAR).maxLevel;
    this._statPotential = {
      atk: petAtk(pet, maxStarLv, MAX_PET_STAR),
      hp: petHp(pet, maxStarLv, MAX_PET_STAR),
      rcv: petRcv(pet, maxStarLv, MAX_PET_STAR),
    };
    const current: Record<StatKey, number> = {
      atk: petAtk(pet, lv, star),
      hp: petHp(pet, lv, star),
      rcv: petRcv(pet, lv, star),
    };

    const order: StatKey[] = ['hp', 'atk', 'rcv'];
    const rowH = 40;
    const barW = 360;
    const labelX = left + 30;
    const barX = left + 120;
    const valX = left + panelW - 30;
    order.forEach((stat, i) => {
      const rowY = y + 30 + i * rowH;
      const def = getStatUi(stat);
      const label = makeText(def.longLabel, {
        size: FONT_SIZE.xs, fill: def.color, bold: true, anchor: [0, 0.5],
      });
      label.position.set(labelX, rowY);
      this._content.addChild(label);

      const ratio = Math.min(1, current[stat] / Math.max(1, this._statPotential[stat]));
      const bar = makeProgressBar({ width: barW, height: 14, ratio, fill: def.color });
      bar.position.set(barX, rowY - 7);
      this._content.addChild(bar);

      const value = makeText(`${current[stat]}`, {
        size: FONT_SIZE.sm, fill: COLORS.textMain, bold: true, anchor: [1, 0.5],
      });
      value.position.set(valX, rowY);
      this._content.addChild(value);

      this._statRows[stat] = { bar, value };
    });

    return y + panelH;
  }

  /** 主动技能 + 被动（签名战斗属性 / passives / 星级成长，统一入口） */
  private _buildAbilityPanel(pet: PetDef, _lv: number, star: number, w: number, y: number): number {
    const panelW = 640;
    const padX = 28;
    const left = w / 2 - panelW / 2;
    const skill = skillForPet(pet, star);
    const passiveLines = passiveDisplayLines(pet, star);

    const descProbe = makeText(skill.desc, {
      size: FONT_SIZE.xs, fill: COLORS.textMain, wordWrapWidth: panelW - padX * 2,
    });
    const passiveBlockH = passiveLines.length > 0 ? 26 + passiveLines.length * 26 + 8 : 26;
    const panelH = 18 + 34 + descProbe.height + 20 + passiveBlockH + 28;
    descProbe.destroy();

    this._content.addChild(this._panelAt(panelW, panelH, left, y));

    const title = makeText(`技能 · ${skill.name}    CD ${skill.cd}`, {
      size: FONT_SIZE.sm, fill: COLORS.accentDeep, bold: true, anchor: [0, 0],
    });
    title.position.set(left + padX, y + 18);
    this._content.addChild(title);

    const desc = makeText(skill.desc, {
      size: FONT_SIZE.xs, fill: COLORS.textMain, anchor: [0, 0],
      wordWrapWidth: panelW - padX * 2,
    });
    desc.position.set(left + padX, y + 52);
    this._content.addChild(desc);

    let lineY = y + 52 + desc.height + 16;
    const passiveTitle = makeText('被动', {
      size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: [0, 0],
    });
    passiveTitle.position.set(left + padX, lineY);
    this._content.addChild(passiveTitle);

    lineY += 26;
    if (passiveLines.length === 0) {
      const none = makeText('无', {
        size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: [0, 0],
      });
      none.position.set(left + padX, lineY);
      this._content.addChild(none);
    } else {
      for (const line of passiveLines) {
        const unlocked = line.unlocked !== false;
        const t = makeText(`· ${line.text}`, {
          size: FONT_SIZE.xs,
          fill: unlocked ? (line.color ?? COLORS.textSub) : COLORS.textSub,
          anchor: [0, 0],
        });
        t.alpha = unlocked ? 1 : 0.45;
        t.position.set(left + padX, lineY);
        this._content.addChild(t);
        lineY += 26;
      }
    }

    return y + panelH;
  }

  private _buildActionButtons(w: number, h: number, minTop: number): void {
    const btnW = 480;
    const btnH = 66;
    const gap = 16;
    const bottomY = h - 90 - (btnH + gap) * 2;
    const baseY = Math.max(minTop, bottomY);

    // 升级
    const lvCost = PlayerData.levelUpCost(this._petId);
    const canLv = PlayerData.canLevelUp(this._petId);
    const lvLabel = lvCost === null ? '已满级' : `升级    经验 ${PlayerData.exp}/${lvCost}`;
    const lvBtn = makeButton({
      label: lvLabel, width: btnW, height: btnH, variant: 'success', enabled: canLv,
      onTap: () => this._onLevelUp(),
    });
    lvBtn.position.set(w / 2, baseY);
    this._content.addChild(lvBtn);

    // 升星
    const starCost = PlayerData.starUpCost(this._petId);
    const canStar = PlayerData.canStarUp(this._petId);
    const shards = PlayerData.petShards(this._petId);
    const starLabel = starCost === null ? '已满星' : `升星    碎片 ${shards}/${starCost}`;
    const starBtn = makeButton({
      label: starLabel, width: btnW, height: btnH, variant: 'recruit', enabled: canStar,
      onTap: () => this._onStarUp(),
    });
    starBtn.position.set(w / 2, baseY + btnH + gap);
    this._content.addChild(starBtn);

    // 上阵 / 下阵
    const inTeam = PlayerData.isInTeam(this._petId);
    const teamBtn = makeButton({
      label: inTeam ? '下阵' : '上阵', width: btnW, height: btnH,
      variant: inTeam ? 'danger' : 'primary',
      onTap: () => this._onToggleTeam(inTeam),
    });
    teamBtn.position.set(w / 2, baseY + (btnH + gap) * 2);
    this._content.addChild(teamBtn);
  }

  // ── 操作 + 反馈 ──

  private _onLevelUp(): void {
    const before = this._currentStats();
    if (!PlayerData.levelUp(this._petId)) {
      Platform.showToast(PlayerData.levelUpCost(this._petId) === null ? '已满级' : '经验不足');
      return;
    }
    Platform.vibrateShort('light');
    this._build();
    this._playGrowthFeedback(before, false);
  }

  private _onStarUp(): void {
    const before = this._currentStats();
    if (!PlayerData.starUp(this._petId)) {
      Platform.showToast(PlayerData.starUpCost(this._petId) === null ? '已满星' : '碎片不足');
      return;
    }
    Platform.vibrateShort('medium');
    this._build();
    this._playGrowthFeedback(before, true);
    if (this._starRow) pulse(this._starRow, { peak: 1.22 });
  }

  private _onToggleTeam(inTeam: boolean): void {
    if (inTeam) {
      if (!PlayerData.removeFromTeam(this._petId)) {
        Platform.showToast('至少保留 1 只灵宠');
        return;
      }
    } else if (!PlayerData.addToTeam(this._petId)) {
      Platform.showToast('队伍已满 5 只');
      return;
    }
    Platform.vibrateShort('light');
    this._build();
    if (this._avatar) pulse(this._avatar);
    this._burstAtAvatar(inTeam ? COLORS.textSub : COLORS.accentDeep, false);
  }

  private _currentStats(): Record<StatKey, number> {
    const pet = PET_MAP.get(this._petId);
    if (!pet) return { atk: 0, hp: 0, rcv: 0 };
    const lv = PlayerData.petLevel(this._petId);
    const star = PlayerData.petStar(this._petId);
    return { atk: petAtk(pet, lv, star), hp: petHp(pet, lv, star), rcv: petRcv(pet, lv, star) };
  }

  /** 数字 countUp + 条形补间 + 头像回弹 + 粒子 + 闪光 */
  private _playGrowthFeedback(before: Record<StatKey, number>, strong: boolean): void {
    const after = this._currentStats();
    (['hp', 'atk', 'rcv'] as StatKey[]).forEach((stat) => {
      const row = this._statRows[stat];
      if (!row) return;
      const from = before[stat];
      const to = after[stat];
      if (from !== to) {
        countUp({
          from, to, duration: 0.5,
          onUpdate: (v) => { row.value.text = `${v}`; },
        });
      }
      const cap = Math.max(1, this._statPotential[stat]);
      const fromR = Math.min(1, from / cap);
      const toR = Math.min(1, to / cap);
      const dummy = { r: fromR };
      row.bar.setRatio(fromR);
      TweenManager.to({
        target: dummy, props: { r: toR }, duration: 0.5, ease: Ease.easeOutCubic,
        onUpdate: () => row.bar.setRatio(dummy.r),
      });
    });

    if (this._avatar) pulse(this._avatar, { peak: strong ? 1.2 : 1.12 });
    const color = strong ? getRarity(PET_MAP.get(this._petId)?.rarity ?? 1).color : COLORS.accent;
    this._fx?.flash(color, strong ? 0.32 : 0.18, 0.4);
    this._burstAtAvatar(color, strong);
  }

  private _burstAtAvatar(color: number, strong: boolean): void {
    this._fx?.burst({
      x: this._avatarCenter.x, y: this._avatarCenter.y, color,
      count: strong ? 22 : 12, speed: strong ? 420 : 280, life: strong ? 0.85 : 0.6,
      gravity: 280, size: strong ? 30 : 20, endScale: 0.1,
      texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
      blendMode: PIXI.BLEND_MODES.ADD,
    });
  }

  private _panelAt(width: number, height: number, x: number, y: number): PIXI.Container {
    const panel = makePanel({
      width, height, radius: RADIUS.card, centered: false,
      bg: COLORS.panelBg, bgAlpha: 0.95, border: COLORS.panelBorder,
    });
    panel.position.set(x, y);
    return panel;
  }
}
