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
import { PETS, type PetDef } from '@/balance/pets';
import { STAGES } from '@/balance/stages';
import { CHAPTER_NAME } from '@/balance/stages';
import {
  BACKGROUND_IMAGES, CODEX_PRELOAD_IMAGES, UI_IMAGES,
} from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import {
  COLORS, FONT_SIZE,
  makeButton, makeCoverBackground, makeIconLabel, makeText,
} from '@/ui';
import { ScrollListController } from '@/ui/ScrollList';
import type { PetDetailEnterData } from './PetDetailScene';
import { buildAbilityPanel } from './abilityCard';
import { buildLockedCodexCard, buildOwnedCodexCard } from './codexCards';

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
  private _scroll = new ScrollListController();

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
    this._scroll.detach();
    this._content = null;
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._scroll.detach();
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
        buildOwnedCodexCard(item, pet, cardW, cardH, S, cardBgTex);
      } else {
        buildLockedCodexCard(item, pet, cardW, cardH, S, state);
      }

      item.eventMode = 'static';
      item.interactiveChildren = false;
      item.cursor = 'pointer';
      item.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);
      item.on('pointertap', () => { if (!this._scroll.moved) this._showAbilityCard(pet, state); });
      content.addChild(item);
    });

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

}
