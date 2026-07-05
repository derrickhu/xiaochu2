/**
 * 灵宠场景（原图鉴入口）：已拥有灵宠列表 + 点击进入养成详情
 *
 * 卡片布局对齐 xiao_chu petPoolView：3 列竖卡、cardW×1.35；背景与编队页共用 scene_pet_pool。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { TextureCache } from '@/core/TextureCache';
import { CODEX_SHELL_IMAGES, codexPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI } from '@/balance/ui';
import { PETS, type PetDef } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import { CHAPTER_NAME } from '@/balance/stages';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_SCENE_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  makeButton, makeCoverBackground, makeIconLabel, makeText,
  staggerIn,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { Platform } from '@/core/PlatformService';
import type { PetDetailEnterData } from './PetDetailScene';
import { buildLockedCodexCard, buildOwnedCodexCard } from './codexCards';
import { SceneEnterSeq, deferSceneBuild } from '@/utils/sceneEnterSeq';

/** xiao_chu 设计缩放：S = logicWidth / 375 */
function designScale(w: number): number {
  return w / 375;
}

/** 图鉴两态：已拥有 / 未获得 */
type CodexState = 'owned' | 'locked';

/** 章 Boss 直掉入口：其 tier2 bossDrop 遭遇所在关卡（取首个） */
const BOSS_DROP_STAGE: ReadonlyMap<string, { name: string; chapter: number }> = (() => {
  const m = new Map<string, { name: string; chapter: number }>();
  for (const s of STAGES) {
    for (const e of s.encounters) {
      if (e.kind === 'creature' && e.tier === 'tier2' && e.bossDrop && !m.has(e.id)) {
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
  private _listMask: PIXI.Graphics | null = null;
  private _scroll = new ScrollListController();
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const codexLingyu = PlayerData.claimCodexMilestones();
    if (codexLingyu > 0) {
      Platform.showToast(`图鉴里程碑达成 · 灵玉 +${codexLingyu}`);
    }
    void this._enter(this._enterSeq.next());
  }

  private async _enter(token: number): Promise<void> {
    await ensureAssets(CODEX_SHELL_IMAGES);
    if (!this._enterSeq.stillValid(token)) return;
    deferSceneBuild(token, this._enterSeq, 'codex', () => {
      this._buildShell();
      void this._loadPetCards(token);
    });
  }

  /** 壳层先渲染，避免等全量灵宠头像时黑屏 */
  private async _loadPetCards(token: number): Promise<void> {
    await ensurePetAvatars(codexPetAvatarEntries());
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'codex') return;
    this._buildPetList(Game.safeTop + 192);
    await Game.warmScenePresent();
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._scroll.detach();
    this._content = null;
    if (this._listMask) {
      this.container.removeChild(this._listMask);
      this._listMask.destroy();
      this._listMask = null;
    }
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._content = null;

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

    const countText = makeText(
      `已拥有 ${PlayerData.ownedPets.length} / 共 ${PETS.length} 只 · 点击查看`,
      { size: FONT_SIZE.xs, fill: COLORS.accent, bold: true, anchor: 0.5 },
    );
    countText.position.set(w / 2, Game.safeTop + 118);
    this.container.addChild(countText);

    this._buildMilestoneBar(w, Game.safeTop + 148);
  }

  /** 图鉴里程碑进度条：拥有进度与灵玉奖励均在图鉴页结算 */
  private _buildMilestoneBar(w: number, y: number): void {
    const { inCycle, next, every, lingyu } = PlayerData.codexMilestoneProgress;
    const barW = Math.min(420, w * 0.7);
    const barH = 14;
    const x = (w - barW) / 2;
    const ratio = inCycle / every;

    const g = new PIXI.Graphics();
    g.beginFill(0x1a1126, 0.75);
    g.drawRoundedRect(x, y, barW, barH, barH / 2);
    g.endFill();
    if (ratio > 0.001) {
      g.beginFill(0xffd76a);
      g.drawRoundedRect(x, y, Math.max(barW * ratio, barH), barH, barH / 2);
      g.endFill();
    }
    this.container.addChild(g);

    const label = makeText(
      `图鉴里程碑 ${inCycle}/${every} · 集满 ${next} 只奖励灵玉 ×${lingyu}`,
      { size: FONT_SIZE.xxs, fill: COLORS.textSub, anchor: 0.5 },
    );
    label.position.set(w / 2, y + barH + 14);
    this.container.addChild(label);
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
    this._scroll.detach();
    if (this._listMask) {
      this.container.removeChild(this._listMask);
      this._listMask.destroy();
      this._listMask = null;
    }
    if (this._content) {
      this._content.destroy({ children: true });
      this.container.removeChild(this._content);
      this._content = null;
    }
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const { S, cols, cardGap, cardW, cardH, marginX } = petPoolGrid(w);
    const cardBgTex = TextureCache.get(UI_SCENE_IMAGES.petCardPortrait);

    // 两态分组：已拥有 → 未获得（按 PETS 顺序稳定）
    const stateOf = (p: PetDef): CodexState =>
      PlayerData.isOwned(p.id) ? 'owned' : 'locked';
    const ordered = [
      ...PETS.filter((p) => stateOf(p) === 'owned'),
      ...PETS.filter((p) => stateOf(p) === 'locked'),
    ];

    const content = new PIXI.Container();
    content.position.set(0, startY);
    this._content = content;
    this.container.addChild(content);

    const items: PIXI.Container[] = [];
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
        buildOwnedCodexCard(item, pet, cardW, cardH, S, cardBgTex);
      } else {
        buildLockedCodexCard(item, pet, cardW, cardH, S);
      }

      item.eventMode = 'static';
      item.interactiveChildren = false;
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
      bindPointerTap(item, () => this._onPetTap(pet, state), {
        blockTap: () => this._scroll.moved,
      });
      content.addChild(item);
      items.push(item);
    });

    // 卡片逐项入场（仅首屏可见项明显，超出视口的延迟也无碍）
    staggerIn(items, { stepDelay: 0.022, offsetY: 14, duration: 0.28 });

    // 视口与滚动范围
    const viewportH = h - startY - 16;
    const contentH = maxBottom + cardGap;
    const scrollMin = Math.min(startY, startY - (contentH - viewportH));

    if (contentH > viewportH) {
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff);
      mask.drawRect(0, startY, w, viewportH);
      mask.endFill();
      this.container.addChild(mask);
      this._listMask = mask;
      content.mask = mask;

      // 列表区统一 canvas touch 滚动（不依赖 Pixi pointerdown，避免子元素抢事件）
      this._scroll.attach({
        content: () => this._content,
        viewportTop: startY,
        viewportH,
        scrollMin,
        listTop: startY,
        moveThreshold: 2,
      });
    } else {
      this._scroll.detach();
    }
  }

  /** 列表点击：已拥有直达养成；未拥有用 toast 引导 */
  private _onPetTap(pet: PetDef, state: CodexState): void {
    if (state === 'owned') {
      SceneManager.switchTo('petDetail', { petId: pet.id } satisfies PetDetailEnterData);
      return;
    }
    const drop = BOSS_DROP_STAGE.get(pet.id);
    const where = drop
      ? `${CHAPTER_NAME[drop.chapter] ?? `第${drop.chapter}章`} · ${drop.name}`
      : null;
    if (where) {
      Platform.showToast(`未获得 · 通关「${where}」Boss 直得`);
      return;
    }
    Platform.showToast('未获得 · 可通过召唤获取（UR 仅召唤）');
  }

}
