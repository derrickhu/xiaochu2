/**
 * 灵宠场景（原图鉴入口）：已拥有灵宠列表 + 点击进入养成详情
 *
 * 卡片布局对齐 xiao_chu petPoolView：3 列竖卡、cardW×1.35；背景与编队页共用 scene_pet_pool。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { PETS, PET_MAP, type PetDef } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import { CHAPTER_NAME } from '@/balance/stages';
import { petAtk, petHp, petRcv } from '@/formulas/growth';
import {
  BACKGROUND_IMAGES, CODEX_PRELOAD_IMAGES, ORB_IMAGES, petAvatarPath, UI_IMAGES,
} from '@/config/Assets';
import { Platform } from '@/core/PlatformService';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  makeButton, makeCoverBackground, makeIconLabel, makePanel, makeText,
  makeRarityBadge, makeRoleBadge, makeStarRow, makeLevelLabel, makePetStatsLine,
} from '@/ui';
import type { PetDetailEnterData } from './PetDetailScene';
import { buildAbilityPanel } from './abilityCard';

/** xiao_chu 设计缩放：S = logicWidth / 375 */
function designScale(w: number): number {
  return w / 375;
}

/** 图鉴三态：已拥有 / 已收录可获取 / 未收录 */
type CodexState = 'owned' | 'discovered' | 'unknown';

/** 某生物的收录入口：其 tier2 captureUnlock 遭遇所在关卡（取首个） */
const CAPTURE_STAGE: ReadonlyMap<string, { name: string; chapter: number }> = (() => {
  const m = new Map<string, { name: string; chapter: number }>();
  for (const s of STAGES) {
    for (const e of s.encounters) {
      if (e.kind === 'creature' && e.tier === 'tier2' && e.captureUnlock && !m.has(e.id)) {
        m.set(e.id, { name: s.name, chapter: s.chapter });
      }
    }
  }
  return m;
})();

/** xiao_chu petPoolView 网格规格 */
function petPoolGrid(w: number) {
  const S = designScale(w);
  const cols = 3;
  const cardGap = 8 * S;
  const cardW = (w - 24 * S - cardGap * (cols - 1)) / cols;
  const cardH = cardW * 1.35;
  const marginX = 12 * S;
  return { S, cols, cardGap, cardW, cardH, marginX };
}

export class CodexScene implements Scene {
  readonly name = 'codex';
  readonly container = new PIXI.Container();

  // ── 列表纵向拖拽滚动状态 ──
  private _content: PIXI.Container | null = null;
  private _scrollMin = 0;
  private _listTop = 0;
  private _viewportTop = 0;
  private _viewportH = 0;
  /** 本次手势是否在滚动（true 时屏蔽卡片 tap） */
  private _moved = false;
  private _dragging = false;
  private _lastTouchY = 0;
  /** canvas 原生 touch（小游戏 adapter 与 Pixi pointermove 隔离，对齐 BoardView） */
  private _rawDown: ((e: unknown) => void) | null = null;
  private _rawMove: ((e: unknown) => void) | null = null;
  private _rawUp: (() => void) | null = null;

  private _rawClientY(e: unknown): number {
    const ev = e as { clientY?: number; y?: number; touches?: { clientY: number }[]; changedTouches?: { clientY: number }[] };
    const t0 = ev.touches?.[0] ?? ev.changedTouches?.[0];
    const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
    return cy * (Game.designWidth / Game.screenWidth);
  }

  private _inScrollViewport(y: number): boolean {
    return y >= this._viewportTop && y <= this._viewportTop + this._viewportH;
  }

  private _attachScrollListeners(viewportTop: number, viewportH: number): void {
    this._detachScrollListeners();
    this._viewportTop = viewportTop;
    this._viewportH = viewportH;

    const canvas = Game.app.view as HTMLCanvasElement;

    this._rawDown = (e: unknown) => {
      if (!this._content) return;
      const y = this._rawClientY(e);
      if (!this._inScrollViewport(y)) return;
      this._dragging = true;
      this._moved = false;
      this._lastTouchY = y;
    };

    this._rawMove = (e: unknown) => {
      if (!this._dragging || !this._content) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      const y = this._rawClientY(e);
      const dy = this._lastTouchY - y;
      if (Math.abs(dy) > 2) this._moved = true;
      if (dy === 0) return;
      this._content.y = Math.max(this._scrollMin, Math.min(this._listTop, this._content.y - dy));
      this._lastTouchY = y;
    };

    this._rawUp = () => { this._dragging = false; };

    // 小游戏走 touch；浏览器预览走 pointer，避免双通道同帧重复滚动
    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', this._rawDown, { passive: true });
      canvas.addEventListener('touchmove', this._rawMove, { passive: false });
      canvas.addEventListener('touchend', this._rawUp);
      canvas.addEventListener('touchcancel', this._rawUp);
    } else {
      canvas.addEventListener('pointerdown', this._rawDown);
      canvas.addEventListener('pointermove', this._rawMove);
      canvas.addEventListener('pointerup', this._rawUp);
      canvas.addEventListener('pointercancel', this._rawUp);
    }
  }

  private _detachScrollListeners(): void {
    const canvas = Game.app?.view as HTMLCanvasElement | undefined;
    if (canvas && this._rawDown) {
      canvas.removeEventListener('touchstart', this._rawDown);
      canvas.removeEventListener('pointerdown', this._rawDown);
    }
    if (canvas && this._rawMove) {
      canvas.removeEventListener('touchmove', this._rawMove);
      canvas.removeEventListener('pointermove', this._rawMove);
    }
    if (canvas && this._rawUp) {
      canvas.removeEventListener('touchend', this._rawUp);
      canvas.removeEventListener('touchcancel', this._rawUp);
      canvas.removeEventListener('pointerup', this._rawUp);
      canvas.removeEventListener('pointercancel', this._rawUp);
    }
    this._rawDown = null;
    this._rawMove = null;
    this._rawUp = null;
  }

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    void this._enter();
  }

  private async _enter(): Promise<void> {
    await TextureCache.preload([...CODEX_PRELOAD_IMAGES]);
    this._build();
  }

  onExit(): void {
    this._detachScrollListeners();
    this._dragging = false;
    this._content = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._detachScrollListeners();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.petPool, w, h));

    const back = makeButton({
      label: '返回', width: 120, height: 54, variant: 'ghost',
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeTop + 36);
    this.container.addChild(back);

    this._buildTitlePlaque(w, Game.safeTop + 36);

    const expRow = makeIconLabel({
      iconPath: UI_IMAGES.iconExp, iconSize: 32,
      text: `经验池 ${PlayerData.exp} · 点击灵宠进入养成`,
      size: FONT_SIZE.xs, fill: COLORS.textSub,
    });
    expRow.position.set(w / 2 - expRow.width / 2, Game.safeTop + 82);
    this.container.addChild(expRow);

    const discoveredCount = PETS.filter((p) => PlayerData.isDiscovered(p.id)).length;
    const countText = makeText(
      `已拥有 ${PlayerData.ownedPets.length} · 已收录 ${discoveredCount} / 共 ${PETS.length} 只 · 点击查看`,
      { size: FONT_SIZE.xs, fill: COLORS.accent, bold: true, anchor: 0.5 },
    );
    countText.position.set(w / 2, Game.safeTop + 118);
    this.container.addChild(countText);

    this._buildPetList(Game.safeTop + 136);
  }

  private _buildTitlePlaque(w: number, centerY: number): void {
    const tex = TextureCache.get(UI_IMAGES.titlePlaque);
    if (tex) {
      const plaque = new PIXI.Sprite(tex);
      plaque.anchor.set(0.5);
      plaque.scale.set(480 / tex.width);
      plaque.position.set(w / 2, centerY);
      this.container.addChild(plaque);
    }
    const title = makeText('灵宠', {
      size: FONT_SIZE.lg, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    title.position.set(w / 2, centerY);
    this.container.addChild(title);
  }

  private _buildPetList(startY: number): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const { S, cols, cardGap, cardW, cardH, marginX } = petPoolGrid(w);
    const cardBgTex = TextureCache.get(UI_IMAGES.petCardPortrait);
    this._listTop = startY;

    // 三态分组：已拥有 → 已收录可获取 → 未收录（按 PETS 顺序稳定）
    const stateOf = (p: PetDef): CodexState =>
      PlayerData.isOwned(p.id) ? 'owned'
        : PlayerData.isDiscovered(p.id) ? 'discovered'
          : 'unknown';
    const ordered = [
      ...PETS.filter((p) => stateOf(p) === 'owned'),
      ...PETS.filter((p) => stateOf(p) === 'discovered'),
      ...PETS.filter((p) => stateOf(p) === 'unknown'),
    ];

    const content = new PIXI.Container();
    content.position.set(0, startY);
    this._content = content;
    this.container.addChild(content);

    let maxBottom = 0;
    ordered.forEach((pet, i) => {
      const state = stateOf(pet);
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = marginX + col * (cardW + cardGap);
      const y = cardGap + row * (cardH + cardGap);
      maxBottom = Math.max(maxBottom, y + cardH);

      const item = new PIXI.Container();
      item.position.set(x, y);
      if (state === 'owned') {
        this._buildPetCard(item, pet, cardW, cardH, S, cardBgTex);
      } else {
        this._buildLockedCard(item, pet, cardW, cardH, S, state);
      }

      item.eventMode = 'static';
      item.interactiveChildren = false;
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
      item.on('pointertap', () => { if (!this._moved) this._showAbilityCard(pet, state); });
      content.addChild(item);
    });

    // 视口与滚动范围
    const viewportH = h - startY - 16;
    const contentH = maxBottom + cardGap;
    this._scrollMin = Math.min(startY, startY - (contentH - viewportH));

    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, startY, w, viewportH);
      mask.endFill();
      this.container.addChild(mask);
      content.mask = mask;

      // 列表区统一 canvas touch 滚动（不依赖 Pixi pointerdown，避免子元素抢事件）
      this._attachScrollListeners(startY, viewportH);
    } else {
      this._detachScrollListeners();
    }
  }

  /**
   * 未拥有卡：
   * - discovered（已收录可获取）：灰度头像 + 「可获取」，展示稀有度/属性供「看能力再抽」。
   * - unknown（未收录）：剪影 + 「未收录」，仅暗示属性，引导去历练关击败高级形态。
   */
  private _buildLockedCard(
    item: PIXI.Container, pet: PetDef, cardW: number, cardH: number, S: number,
    state: 'discovered' | 'unknown',
  ): void {
    const discovered = state === 'discovered';
    item.addChild(makePanel({
      width: cardW, height: cardH, radius: 8 * S, centered: false,
      bg: COLORS.panelBgAlt, bgAlpha: 0.9,
      border: discovered ? COLORS.accent : COLORS.panelBorderSoft,
    }));

    const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
    if (orbTex) {
      const orbSz = 18 * S;
      const orb = new PIXI.Sprite(orbTex);
      orb.width = orbSz;
      orb.height = orbSz;
      orb.position.set(10 * S, 10 * S);
      orb.alpha = discovered ? 0.85 : 0.4;
      item.addChild(orb);
    }

    if (discovered) {
      const badge = makeRarityBadge({ tier: pet.rarity, scale: S });
      badge.position.set(2 * S, 2 * S);
      item.addChild(badge);
    }

    const avatarSize = cardW * 0.62;
    const avatarTex = TextureCache.get(petAvatarPath(pet.id, 1));
    if (avatarTex) {
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = avatarSize;
      avatar.height = avatarSize;
      avatar.position.set((cardW - avatarSize) / 2, 8 * S);
      // 已收录：灰度可辨；未收录：近全黑剪影
      avatar.tint = discovered ? 0x9a9a9a : 0x111317;
      avatar.alpha = discovered ? 0.95 : 0.85;
      item.addChild(avatar);
    }

    const lock = makeText(discovered ? '可获取' : '未收录', {
      size: Math.round(11 * S), fill: discovered ? COLORS.accent : COLORS.textSub,
      bold: true, anchor: 0.5,
    });
    lock.position.set(cardW / 2, 8 * S + avatarSize + 14 * S);
    item.addChild(lock);

    if (discovered) {
      const roleBadge = makeRoleBadge({ role: pet.role, scale: S, maxWidth: cardW - 10 * S });
      roleBadge.position.set((cardW - roleBadge.width) / 2, cardH - 21 * S);
      item.addChild(roleBadge);
    } else {
      const tip = makeText('？？？', {
        size: Math.round(11 * S), fill: COLORS.textDisabled, bold: true, anchor: 0.5,
      });
      tip.position.set(cardW / 2, cardH - 16 * S);
      item.addChild(tip);
    }
  }

  /**
   * 能力卡浮层（三态）：
   * - owned：完整能力 + 「进入养成」。
   * - discovered：能力可见 + 「召唤/商店获取」。
   * - unknown：仅提示「在第 X 章·关卡击败其高级形态以收录」。
   */
  private _showAbilityCard(pet: PetDef, state: CodexState): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const owned = state === 'owned';

    const overlay = new PIXI.Container();
    this.container.addChild(overlay);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(COLORS.scrim, 0.74);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
    scrim.on('pointertap', () => overlay.destroy({ children: true }));
    overlay.addChild(scrim);

    const panelW = Math.min(640, w - 60);
    const panel = buildAbilityPanel(pet, { width: panelW, owned, star: owned ? PlayerData.petStar(pet.id) : 1 });
    panel.position.set(w / 2 - panelW / 2, Game.safeTop + 120);
    overlay.addChild(panel);

    const btnY = Game.safeTop + 120 + panel.height + 28;
    if (owned) {
      const detail = makeButton({
        label: '进入养成', width: 260, height: 64, variant: 'primary',
        onTap: () => SceneManager.switchTo('petDetail', { petId: pet.id } satisfies PetDetailEnterData),
      });
      detail.position.set(w / 2 - 140, btnY + 32);
      overlay.addChild(detail);

      const close = makeButton({
        label: '关闭', width: 160, height: 64, variant: 'ghost',
        onTap: () => overlay.destroy({ children: true }),
      });
      close.position.set(w / 2 + 150, btnY + 32);
      overlay.addChild(close);
    } else if (state === 'discovered') {
      const hint = makeText('已收录 · 前往召唤 / 商店获取', {
        size: FONT_SIZE.xs, fill: COLORS.accent, bold: true, anchor: 0.5,
      });
      hint.position.set(w / 2, btnY);
      overlay.addChild(hint);

      const gacha = makeButton({
        label: '去召唤', width: 200, height: 64, variant: 'primary',
        onTap: () => SceneManager.switchTo('gacha'),
      });
      gacha.position.set(w / 2 - 110, btnY + 48);
      overlay.addChild(gacha);

      const close = makeButton({
        label: '关闭', width: 160, height: 64, variant: 'ghost',
        onTap: () => overlay.destroy({ children: true }),
      });
      close.position.set(w / 2 + 110, btnY + 48);
      overlay.addChild(close);
    } else {
      const cap = CAPTURE_STAGE.get(pet.id);
      const where = cap
        ? `${CHAPTER_NAME[cap.chapter] ?? `第${cap.chapter}章`} · ${cap.name}`
        : '历练关';
      const hint = makeText(`未收录\n在「${where}」击败其高级形态即可收录`, {
        size: FONT_SIZE.xs, fill: COLORS.textInverse, anchor: 0.5, align: 'center',
      });
      hint.position.set(w / 2, btnY + 6);
      overlay.addChild(hint);

      const close = makeButton({
        label: '关闭', width: 220, height: 64, variant: 'ghost',
        onTap: () => overlay.destroy({ children: true }),
      });
      close.position.set(w / 2, btnY + 56);
      overlay.addChild(close);
    }
  }

  /** 单卡布局对齐 xiao_chu _drawPetCard */
  private _buildPetCard(
    item: PIXI.Container, pet: PetDef, cardW: number, cardH: number, S: number,
    cardBgTex: PIXI.Texture | null,
  ): void {
    const petId = pet.id;
    const lv = PlayerData.petLevel(petId);
    const star = PlayerData.petStar(petId);

    if (cardBgTex) {
      const bg = new PIXI.Sprite(cardBgTex);
      bg.width = cardW;
      bg.height = cardH;
      item.addChild(bg);
    } else {
      item.addChild(makePanel({
        width: cardW, height: cardH, radius: 8 * S, centered: false,
        bg: COLORS.panelBg, border: COLORS.panelBorderSoft,
      }));
    }

    const orbTex = TextureCache.get(ORB_IMAGES[pet.element]);
    if (orbTex) {
      const orbSz = 18 * S;
      const orb = new PIXI.Sprite(orbTex);
      orb.width = orbSz;
      orb.height = orbSz;
      orb.position.set(10 * S, 10 * S);
      item.addChild(orb);
    }

    const badge = makeRarityBadge({ tier: pet.rarity, scale: S });
    badge.position.set(2 * S, 2 * S);
    item.addChild(badge);

    const avatarSize = cardW * 0.62;
    const avatarX = (cardW - avatarSize) / 2;
    const avatarY = 8 * S;
    const avatarTex = TextureCache.get(petAvatarPath(pet.id, star));
    if (avatarTex) {
      const avatar = new PIXI.Sprite(avatarTex);
      avatar.width = avatarSize;
      avatar.height = avatarSize;
      avatar.position.set(avatarX, avatarY);
      item.addChild(avatar);
    }

    const displayName = pet.name.length > 4 ? `${pet.name.slice(0, 4)}…` : pet.name;
    const nameY = avatarY + avatarSize + 6 * S;
    const nameText = makeText(displayName, {
      size: Math.round(10 * S), fill: 0x3b2414, bold: true, anchor: 0.5,
      strokeColor: 0xfff0cd, strokeWidth: Math.max(2, Math.round(2 * S)),
    });
    nameText.position.set(cardW / 2, nameY);
    item.addChild(nameText);

    const starY = nameY + 14 * S;
    const stars = makeStarRow({ star, scale: S, variant: 'card', anchor: 'center' });
    stars.position.set(cardW / 2, starY);
    item.addChild(stars);

    const lvY = starY + 12 * S;
    const lvLine = makeLevelLabel({ level: lv, scale: S, variant: 'card' });
    lvLine.position.set(cardW / 2 - lvLine.width / 2, lvY);
    item.addChild(lvLine);

    const statsY = lvY + 12 * S;
    const statsLine = makePetStatsLine({
      atk: petAtk(pet, lv, star),
      hp: petHp(pet, lv, star),
      rcv: petRcv(pet, lv, star),
      scale: S,
      variant: 'card',
    });
    statsLine.position.set(cardW / 2 - statsLine.width / 2, statsY);
    item.addChild(statsLine);

    const roleBadge = makeRoleBadge({ role: pet.role, scale: S, maxWidth: cardW - 10 * S });
    roleBadge.position.set((cardW - roleBadge.width) / 2, cardH - 21 * S);
    item.addChild(roleBadge);
  }
}
