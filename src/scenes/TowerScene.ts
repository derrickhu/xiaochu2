/**
 * 通天塔（布局方案 A：塔为舞台）
 *
 * 顶栏：返回 + 居中匾「通天塔」
 * 匾下资源行：传承入口 | 重置 · 印记
 * 中央宝塔 + 五行环（无侧栏遮挡）
 * 塔下：层数浮标 + 起手血条 → 本轮信息横条 → 矮里程碑 → CTA
 *
 * 与主线差异：HP / 技能 CD 跨层继承；战败回落存档点，需消耗每日重置续爬。
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { UI } from '@/balance/ui';
import { formatReward } from '@/balance/rewards';
import {
  buildTowerStage,
  TOWER, TOWER_MILESTONE_REWARD, towerStageId,
} from '@/balance/tower';
import { describeOwnedBlesses } from '@/balance/towerBless';
import { TOWER_LEGACY_NODES } from '@/balance/towerLegacy';
import { TOWER_FLOOR_KINDS, type TowerFloorKind } from '@/balance/towerPath';
import { showTowerLegacyPanel } from './tower/TowerLegacyPanel';
import { showTowerSkipDialog } from './tower/TowerSkipDialog';
import { showTowerResetDialog } from './tower/TowerResetDialog';
import { showTowerPathPicker } from './tower/TowerPathPicker';
import { BACKGROUND_IMAGES, UI_IMAGES } from '@/config/Assets';
import { PlayerData } from '@/game/PlayerData';
import { grantReward } from '@/game/rewardGrant';
import { watchAd } from '@/game/adGate';
import type { BattleContext } from '@/game/battleContext';
import {
  COLORS, FONT_SIZE, BOTTOM_NAV_RESERVE,
  buildBottomNav, makeBackButton, makeCoverBackground,
  makePanel, makeSceneTitlePlaque, makeText,
  makeWarmGoldCtaButton, WARM_GOLD_CTA_SIZE, pressFeedback,
} from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import type { TeamEnterData } from './TeamScene';
import { analytics } from '@/analytics';

const MILESTONE_PREVIEW = 4;
/** 状态条 / 里程碑左右边距一致，横向占满内容区 */
const TOWER_SIDE_PAD = 20;
/** 匾下方资源行（传承 / 重置 / 印记）行高 */
const RESOURCE_ROW_H = 34;
const CTA_BTN_W = WARM_GOLD_CTA_SIZE.width;
const CTA_BTN_H = WARM_GOLD_CTA_SIZE.height;
/** 主按钮与直登/重置说明的间距 */
const CTA_HINT_GAP = 8;
/** 说明行占位，含浅色底托；整块算进 CTA 簇，避免掉进底栏云纹 */
const CTA_HINT_H = 32;
const CTA_CLUSTER_H = CTA_BTN_H + CTA_HINT_GAP + CTA_HINT_H;
/** 字号加大后条/板略增高，塔区靠上方弹性压缩保持不挤 */
const META_STRIP_H = 58;
/** 层数 + 起手文案 + 血条三段纵向排布，避免重叠 */
const FLOOR_HUD_H = 88;
const MILESTONE_H = 138;
const META_TEXT_SIZE = 18;
const MILESTONE_TITLE_SIZE = 22;
const MILESTONE_TAG_SIZE = 16;
const MILESTONE_CIRCLE_R = 30;
/** 层标六角相对圆心下移；与板底留白一起算，避免贴边 */
const MILESTONE_TAG_GAP = 14;
const MILESTONE_TAG_H = 22;
const MILESTONE_BOTTOM_PAD = 14;

export class TowerScene implements Scene {
  readonly name = 'tower';
  readonly container = new PIXI.Container();

  /** 每次重建/离场自增，异步浮层回调据此判断结果是否已过期 */
  private _buildSeq = 0;

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    EventBus.on('safearea:updated', this._onSafeArea);
    this._build();
    void TextureCache.preload([
      BACKGROUND_IMAGES.tower,
      UI_IMAGES.towerPagoda,
      UI_IMAGES.towerMetaStripBg,
      UI_IMAGES.towerBtnCta,
      UI_IMAGES.sceneTitlePlaque,
      UI_IMAGES.btnBack,
      UI_IMAGES.iconLingyu,
      UI_IMAGES.iconShard,
      UI_IMAGES.towerCurrencySeal,
    ]);
    void Game.warmScenePresent();
  }

  onExit(): void {
    EventBus.off('safearea:updated', this._onSafeArea);
    this._buildSeq++;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
  }

  private _onSafeArea = (): void => {
    if (SceneManager.current?.name === 'tower') this._build();
  };

  private _build(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._buildSeq++;
    this.container.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    this.container.addChild(makeCoverBackground(BACKGROUND_IMAGES.tower, w, h));

    const headerBand = new PIXI.Graphics();
    headerBand.beginFill(0xfff8ec, 0.28);
    headerBand.drawRect(0, 0, w, Game.safeTop + 70);
    headerBand.endFill();
    this.container.addChild(headerBand);

    const back = makeBackButton({ onTap: () => SceneManager.switchTo('title', PlayerData.titleEnter()) });
    back.position.set(72, Game.safeHeaderCenterY);
    this.container.addChild(back);

    const plaque = makeSceneTitlePlaque({ text: '通天塔', screenWidth: w });
    plaque.position.set(w / 2, Game.safeHeaderCenterY);
    this.container.addChild(plaque);

    this._buildResourceRow(w, Game.safeTop + 22);

    // 自下而上：CTA → 矮里程碑 → 本轮横条 → 层数/血条 → 塔舞台
    const contentTop = Game.safeTop + 72;
    const contentBottom = h - BOTTOM_NAV_RESERVE - 20;
    const ctaTop = contentBottom - CTA_CLUSTER_H;
    const milestoneTop = ctaTop - 10 - MILESTONE_H;
    const metaTop = milestoneTop - 6 - META_STRIP_H;
    const floorHudTop = metaTop - 4 - FLOOR_HUD_H;
    const stageH = Math.max(340, floorHudTop - contentTop);

    this._buildStage(w, contentTop, stageH);
    this._buildFloorHud(w, floorHudTop, FLOOR_HUD_H);
    this._buildMetaStrip(w, metaTop, META_STRIP_H);
    this._buildMilestone(w, milestoneTop, MILESTONE_H);
    this._buildCta(w, ctaTop);
    buildBottomNav(this.container, w, h, 'tower');
  }

  /**
   * 资源行：匾下方独立一行，左传承入口 / 右重置 + 印记。
   *
   * 不和匾挤同一行：匾居中固定占 380 宽（右缘 565），右侧又必须避开胶囊
   * （contentRightX≈554），750 设计宽下两者必然重叠。挪到胶囊下方后整屏宽可用。
   * 印记数字只在这里出现一次，传承入口不再重复同一个 towerCoins。
   * 印记点进商店「印记」页，不在塔里另开兑换。
   */
  private _buildResourceRow(w: number, y: number): void {
    const cy = y + RESOURCE_ROW_H / 2;
    this._buildLegacyEntry(TOWER_SIDE_PAD, y);

    const chip = new PIXI.Container();
    const label = makeText(`印记 ${PlayerData.towerCoins}`, {
      size: FONT_SIZE.xs, fill: 0x5c4033, bold: true, anchor: [0, 0.5], role: 'body',
    });
    try { label.updateText(true); } catch { /* noop */ }
    const padX = 10;
    const iconS = 20;
    const chipH = 28;
    const chipW = padX + iconS + 6 + label.width + padX;
    const bg = new PIXI.Graphics();
    bg.beginFill(0xfff3d8, 0.96);
    bg.lineStyle(1.6, 0xb08a52, 1);
    bg.drawRoundedRect(0, -chipH / 2, chipW, chipH, chipH / 2);
    bg.endFill();
    chip.addChild(bg);

    const icon = new PIXI.Sprite(TextureCache.get(UI_IMAGES.towerCurrencySeal) ?? PIXI.Texture.EMPTY);
    icon.anchor.set(0.5);
    if (icon.texture.width > 1) {
      icon.scale.set(iconS / Math.max(icon.texture.width, icon.texture.height));
    }
    icon.position.set(padX + iconS / 2, 0);
    chip.addChild(icon);
    label.position.set(padX + iconS + 6, 0);
    chip.addChild(label);

    const chipLeft = w - TOWER_SIDE_PAD - chipW;
    chip.position.set(chipLeft, cy);
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.hitArea = new PIXI.Rectangle(0, -chipH / 2, chipW, chipH);
    pressFeedback(chip);
    bindPointerTap(chip, () => SceneManager.switchTo('shop', { tab: 'honor', from: 'tower' }));
    this.container.addChild(chip);

    const left = PlayerData.towerResetsLeft;
    const resetChip = new PIXI.Container();
    const resetLabel = makeText(left > 0 ? `重置 ${left}次 ›` : '重置 已用完', {
      size: FONT_SIZE.xs,
      fill: left > 0 ? 0x5c4033 : COLORS.textDisabled,
      bold: true, anchor: [0, 0.5], role: 'body',
    });
    try { resetLabel.updateText(true); } catch { /* noop */ }
    const resetPad = 10;
    const resetH = 28;
    const resetW = resetPad * 2 + resetLabel.width;
    const resetBg = new PIXI.Graphics();
    resetBg.beginFill(0xfff3d8, left > 0 ? 0.96 : 0.7);
    resetBg.lineStyle(1.6, left > 0 ? 0xb08a52 : 0xc4b49a, 1);
    resetBg.drawRoundedRect(0, -resetH / 2, resetW, resetH, resetH / 2);
    resetBg.endFill();
    resetChip.addChild(resetBg);
    resetLabel.position.set(resetPad, 0);
    resetChip.addChild(resetLabel);
    resetChip.position.set(chipLeft - 12 - resetW, cy);
    resetChip.eventMode = 'static';
    resetChip.cursor = left > 0 ? 'pointer' : 'default';
    resetChip.hitArea = new PIXI.Rectangle(0, -resetH / 2, resetW, resetH);
    if (left > 0) {
      pressFeedback(resetChip);
      bindPointerTap(resetChip, () => void this._offerReset());
    } else {
      bindPointerTap(resetChip, () => Platform.showToast('今日重置次数已用完'));
    }
    this.container.addChild(resetChip);
  }

  /**
   * 传承入口挂在资源行左端：它是跨轮的长线目标，不该和「本轮状态」混在一起。
   * 数字交给同行右侧的印记胶囊，这里只做入口，避免同屏两处显示同一个 towerCoins。
   * 有可负担的升级时点一下金点，避免玩家攒了一堆印记却不知道能花。
   */
  private _buildLegacyEntry(x: number, y: number): void {
    const btn = new PIXI.Container();
    const label = makeText('传承 ›', {
      size: FONT_SIZE.sm, fill: 0x7a5520, bold: false, anchor: 0.5, role: 'title',
    });
    try { label.updateText(true); } catch { /* noop */ }
    const bw = Math.max(108, Math.ceil(label.width) + 28);
    const bh = RESOURCE_ROW_H;
    btn.position.set(x, y);
    this.container.addChild(btn);

    const bg = new PIXI.Graphics();
    bg.beginFill(0xfff3d8, 0.96);
    bg.lineStyle(2, 0xb08a52, 1);
    bg.drawRoundedRect(0, 0, bw, bh, bh / 2);
    bg.endFill();
    btn.addChild(bg);
    label.position.set(bw / 2, bh / 2);
    btn.addChild(label);

    const affordable = TOWER_LEGACY_NODES.some((n) => {
      const cost = PlayerData.towerLegacyCost(n.id);
      return cost != null && PlayerData.towerCoins >= cost;
    });
    if (affordable) {
      const dot = new PIXI.Graphics();
      dot.beginFill(0xe04a3c, 1);
      dot.lineStyle(1.5, 0xfff3d8, 1);
      dot.drawCircle(bw - 6, 6, 6);
      dot.endFill();
      btn.addChild(dot);
    }

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.hitArea = new PIXI.Rectangle(0, 0, bw, bh);
    pressFeedback(btn);
    bindPointerTap(btn, () => showTowerLegacyPanel(this.container, () => this._build()));
  }

  private _buildStage(w: number, y: number, stageH: number): void {
    const stage = new PIXI.Container();
    stage.position.set(0, y);
    this.container.addChild(stage);

    // 五行塔略偏上，底边留在舞台内，避免压住下方「第 N 层」
    const towerH = Math.min(Math.round(stageH * 0.98), 720);
    const towerW = Math.round(towerH * (911 / 1278));
    const towerX = w * 0.5;
    const towerY = stageH * 0.47;
    this._mountSprite(stage, UI_IMAGES.towerPagoda, towerX, towerY, towerW, towerH);
  }

  /** 塔下浮标：层数（书法）→ 起手文案（文楷）→ 血条，纵向留白防叠 */
  private _buildFloorHud(w: number, y: number, h: number): void {
    const tower = PlayerData.tower;
    const hud = new PIXI.Container();
    hud.position.set(0, y);
    this.container.addChild(hud);

    const floorTitle = tower.runEnded
      ? `将从第 ${PlayerData.towerCheckpointFloor()} 层重来`
      : `第 ${tower.runFloor} 层`;
    const floorText = makeText(floorTitle, {
      size: FONT_SIZE.lg, fill: 0x5c4033, bold: false, anchor: 0.5, role: 'title',
    });
    try { floorText.updateText(true); } catch { /* noop */ }
    floorText.position.set(w / 2, Math.max(18, floorText.height * 0.52));
    hud.addChild(floorText);

    const hpRatio = tower.runEnded ? 0 : Math.max(0, Math.min(1, tower.runHpPct));
    const hpPct = Math.round(hpRatio * 100);
    const barW = Math.min(220, w - 160);
    const barH = 14;
    const barY = h - barH - 4;

    const hpLabel = makeText(
      tower.runEnded ? '本轮已中断' : `起手 ${hpPct}%`,
      { size: FONT_SIZE.xs, fill: 0x5c4033, bold: true, anchor: 0.5, role: 'body' },
    );
    try { hpLabel.updateText(true); } catch { /* noop */ }
    // 夹在层数与血条之间：上离层数 ≥6，下离血条 ≥8
    const minCy = floorText.y + floorText.height / 2 + 6 + hpLabel.height / 2;
    const maxCy = barY - 8 - hpLabel.height / 2;
    hpLabel.position.set(w / 2, Math.min(maxCy, Math.max(minCy, (minCy + maxCy) / 2)));
    hud.addChild(hpLabel);

    this._drawStatusHpBar(hud, (w - barW) / 2, barY, barW, barH, hpRatio);
  }

  /**
   * 本轮信息横条：独立底图四格分界 + 最高 / 存档 / 机缘 / 回血。
   * 机缘可点开列表；其余只读。
   */
  private _buildMetaStrip(w: number, y: number, stripH: number): void {
    const tower = PlayerData.tower;
    const stripW = w - TOWER_SIDE_PAD * 2;
    const strip = new PIXI.Container();
    strip.position.set(TOWER_SIDE_PAD, y);
    this.container.addChild(strip);

    this._mountSprite(strip, UI_IMAGES.towerMetaStripBg, stripW / 2, stripH / 2, stripW, stripH);

    const owned = describeOwnedBlesses(PlayerData.towerBlesses);
    const blessTotal = owned.reduce((sum, o) => sum + o.stacks, 0);
    const blessLabel = blessTotal > 0 ? `本轮机缘 ${blessTotal}›` : '本轮机缘';
    const healPct = Math.round(TOWER.healPctPerFloor * 100);
    const guardPct = Math.round(TOWER.healPctPerGuard * 100);

    const checkpoint = PlayerData.towerCheckpointFloor();
    const parts: Array<{ text: string; fill: number; tap?: () => void }> = [
      { text: `最高 ${tower.bestFloor}`, fill: 0x5c4033 },
      { text: `战败回到\n第${checkpoint}层`, fill: 0x5c4033 },
      {
        text: blessLabel,
        fill: blessTotal > 0 ? 0x7a5520 : 0x8a6a4a,
        tap: blessTotal > 0 ? () => this._showBlessList(owned) : undefined,
      },
      // 末格两行，放大后仍落在格内
      { text: `每层回${healPct}%\n守关${guardPct}%`, fill: 0x5c4033 },
    ];

    const cols = parts.length;
    const colW = stripW / cols;
    const cellPad = 6;
    for (let i = 0; i < cols; i++) {
      const part = parts[i];
      const maxW = colW - cellPad * 2;
      const label = makeText(part.text, {
        size: META_TEXT_SIZE, fill: part.fill, bold: true, anchor: 0.5,
        align: 'center',
        wordWrapWidth: maxW,
        role: 'body',
      });
      try { label.updateText(true); } catch { /* noop */ }
      const maxH = stripH - 10;
      if (label.width > maxW) label.scale.set(maxW / label.width);
      if (label.height > maxH) label.scale.set(label.scale.x * (maxH / label.height));
      label.position.set(colW * i + colW / 2, stripH / 2);
      strip.addChild(label);

      if (part.tap) {
        label.eventMode = 'static';
        label.cursor = 'pointer';
        label.hitArea = new PIXI.Rectangle(-colW / 2 + 4, -stripH / 2, colW - 8, stripH);
        pressFeedback(label);
        bindPointerTap(label, part.tap);
      }
    }
  }

  private _showBlessList(
    owned: ReturnType<typeof describeOwnedBlesses>,
  ): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const root = new PIXI.Container();
    this.container.addChild(root);

    const scrim = new PIXI.Graphics();
    scrim.beginFill(0x000000, 0.55);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
    root.addChild(scrim);
    bindPointerTap(scrim, () => root.destroy({ children: true }));

    const panelW = Math.min(420, w - 80);
    const lineH = 40;
    const panelH = Math.min(h - 160, 96 + owned.length * lineH + 16);
    const panel = new PIXI.Container();
    panel.position.set(w / 2, h / 2);
    root.addChild(panel);
    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 16,
      bg: 0xfffaf0, bgAlpha: 0.98, border: 0xb08a52, borderWidth: 2,
      centered: true,
    }));

    const title = makeText('本轮机缘', {
      size: FONT_SIZE.md, fill: 0x5c4033, bold: true, anchor: 0.5, role: 'title',
    });
    title.position.set(0, -panelH / 2 + 26);
    panel.addChild(title);

    const sub = makeText('重置后全部清空', {
      size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5,
    });
    sub.position.set(0, -panelH / 2 + 48);
    panel.addChild(sub);

    let y = -panelH / 2 + 72;
    for (const o of owned) {
      const name = makeText(
        o.stacks > 1 ? `${o.def.name} ×${o.stacks}` : o.def.name,
        { size: FONT_SIZE.xs, fill: 0x7a5520, bold: true, anchor: [0, 0.5] },
      );
      name.position.set(-panelW / 2 + 20, y + lineH / 2);
      panel.addChild(name);

      const desc = makeText(o.text, {
        size: 13, fill: 0x6b5b50, bold: true, anchor: [1, 0.5],
      });
      desc.position.set(panelW / 2 - 20, y + lineH / 2);
      const maxDescW = panelW - 60 - name.width;
      if (desc.width > maxDescW) desc.scale.set(maxDescW / desc.width);
      panel.addChild(desc);

      y += lineH;
      if (y > panelH / 2 - 36) {
        const left = owned.length - (owned.indexOf(o) + 1);
        if (left > 0) {
          const more = makeText(`还有 ${left} 条…`, {
            size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5,
          });
          more.position.set(0, y + 8);
          panel.addChild(more);
        }
        break;
      }
    }
  }

  /** 状态卡血条：胶囊绿条 + 末端金菱 */
  private _drawStatusHpBar(
    parent: PIXI.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    ratio: number,
  ): void {
    const g = new PIXI.Graphics();
    const r = h / 2;
    g.beginFill(0xfaf8f2, 1);
    g.lineStyle(1.5, 0xc4b8a0, 1);
    g.drawRoundedRect(x, y, w, h, r);
    g.endFill();

    const t = Math.max(0, Math.min(1, ratio));
    if (t > 0.001) {
      const fw = Math.max(h, w * t);
      g.beginFill(0x6dbf7a, 1);
      g.drawRoundedRect(x, y, fw, h, r);
      g.endFill();
      // 末端高亮一点，近似渐变
      g.beginFill(0xa8d59d, 0.55);
      g.drawRoundedRect(x + fw - h, y + 1, h - 1, h - 2, r - 1);
      g.endFill();

      const dx = x + fw;
      const dy = y + h / 2;
      const d = new PIXI.Graphics();
      d.beginFill(0xf0d060, 1);
      d.lineStyle(1, 0xc9a45a, 1);
      d.moveTo(dx, dy - 7);
      d.lineTo(dx + 7, dy);
      d.lineTo(dx, dy + 7);
      d.lineTo(dx - 7, dy);
      d.closePath();
      d.endFill();
      parent.addChild(g);
      parent.addChild(d);
      return;
    }
    parent.addChild(g);
  }

  /**
   * 里程碑横条（方案 A）：横向占满，四列均分，列间虚线分界。
   * 已领 / 待领 / 未达成 三态保留。
   */
  private _buildMilestone(w: number, y: number, panelH: number): void {
    const tower = PlayerData.tower;
    const panelW = w - TOWER_SIDE_PAD * 2;
    const panel = new PIXI.Container();
    panel.position.set(TOWER_SIDE_PAD, y);
    this.container.addChild(panel);

    panel.addChild(makePanel({
      width: panelW, height: panelH, radius: 12,
      bg: 0xfdf6e9, bgAlpha: 0.96,
      border: 0xb08a52, borderWidth: 2,
      centered: false,
    }));
    this._diamond(panel, 10, 10, 0xb08a52);
    this._diamond(panel, panelW - 10, 10, 0xb08a52);
    this._diamond(panel, 10, panelH - 10, 0xb08a52);
    this._diamond(panel, panelW - 10, panelH - 10, 0xb08a52);

    const title = makeText('里程碑', {
      size: MILESTONE_TITLE_SIZE, fill: 0x5c4033, bold: false, anchor: 0.5,
      role: 'title',
    });
    title.position.set(panelW / 2, 16);
    panel.addChild(title);
    try { title.updateText(true); } catch { /* noop */ }

    const deco = new PIXI.Graphics();
    deco.lineStyle(1.4, 0xb08a52, 0.8);
    const ly = title.y;
    const tw = title.width;
    deco.moveTo(22, ly);
    deco.lineTo(panelW / 2 - tw / 2 - 12, ly);
    deco.moveTo(panelW / 2 + tw / 2 + 12, ly);
    deco.lineTo(panelW - 22, ly);
    panel.addChild(deco);

    const colW = panelW / MILESTONE_PREVIEW;
    // 列间虚线分界（对齐方案 A）
    const dividers = new PIXI.Graphics();
    const dashH = 3;
    const dashGap = 4;
    const y0 = 32;
    const y1 = panelH - 10;
    for (let i = 1; i < MILESTONE_PREVIEW; i++) {
      const dx = colW * i;
      for (let yy = y0; yy < y1; yy += dashH + dashGap) {
        dividers.lineStyle(1.5, 0xb08a52, 0.55);
        dividers.moveTo(dx, yy);
        dividers.lineTo(dx, Math.min(yy + dashH, y1));
      }
    }
    panel.addChild(dividers);

    const firstFloor = Math.max(
      TOWER.milestoneEvery,
      (Math.floor(tower.bestFloor / TOWER.milestoneEvery) - 1) * TOWER.milestoneEvery,
    );
    const circleR = MILESTONE_CIRCLE_R;
    // 以「层标底边 + 底边距」反推圆心，四列同一高度，不贴底框
    const tagReach = circleR + MILESTONE_TAG_GAP + MILESTONE_TAG_H / 2;
    const cy = panelH - MILESTONE_BOTTOM_PAD - tagReach;

    for (let i = 0; i < MILESTONE_PREVIEW; i++) {
      const floor = firstFloor + i * TOWER.milestoneEvery;
      const claimed = PlayerData.isTowerMilestoneClaimed(floor);
      const reached = tower.bestFloor >= floor;
      const claimable = reached && !claimed;
      const state: 'claimed' | 'claimable' | 'locked' = claimed
        ? 'claimed'
        : (claimable ? 'claimable' : 'locked');
      const x = colW * i + colW / 2;
      this._mountMilestoneSlot(panel, x, cy, circleR, floor, state);
    }
  }

  /**
   * 里程碑槽三态（对齐 tower_milestone_states_design_v1）：
   * 未达成=灰奖励+锁角标；可领取=金光晕+彩奖励+「待领」；已领取=灰勾+「已领」。
   */
  private _mountMilestoneSlot(
    parent: PIXI.Container,
    x: number,
    y: number,
    r: number,
    floor: number,
    state: 'claimed' | 'claimable' | 'locked',
  ): void {
    const root = new PIXI.Container();
    root.position.set(x, y);
    parent.addChild(root);

    if (state === 'claimable') {
      const halo = new PIXI.Graphics();
      halo.beginFill(0xffd24a, 0.22);
      halo.drawCircle(0, 0, r + 14);
      halo.endFill();
      halo.beginFill(0xffe08a, 0.45);
      halo.drawCircle(0, 0, r + 7);
      halo.endFill();
      root.addChild(halo);
      this._drawClaimSparkles(root, r + 10);
    }

    const ring = new PIXI.Graphics();
    if (state === 'claimable') {
      ring.beginFill(0xfff6d8, 1);
      ring.lineStyle(3, 0xe0b44a, 1);
      ring.drawCircle(0, 0, r);
      ring.endFill();
    } else if (state === 'claimed') {
      ring.beginFill(0xe4f0dc, 1);
      ring.lineStyle(2, COLORS.btnSuccessBorder, 0.75);
      ring.drawCircle(0, 0, r);
      ring.endFill();
    } else {
      // 未达成：虚线冷圈，和「已领」绿勾拉开
      ring.beginFill(0xf4f0ea, 1);
      ring.lineStyle(2, 0xb8b0a4, 0.7);
      ring.drawCircle(0, 0, r);
      ring.endFill();
      ring.lineStyle(1.4, 0x9a948c, 0.55);
      for (let a = 0; a < Math.PI * 2; a += 0.42) {
        ring.arc(0, 0, r + 3, a, a + 0.2);
      }
    }
    root.addChild(ring);

    const icon = Math.round(r * 0.88);
    if (state === 'claimed') {
      this._drawCheckMark(root, r * 0.72);
    } else if (state === 'claimable') {
      this._mountSprite(root, UI_IMAGES.iconLingyu, -r * 0.28, -2, icon, icon);
      this._mountSprite(root, UI_IMAGES.iconShard, r * 0.3, 3, Math.round(icon * 0.9), Math.round(icon * 0.9));
    } else {
      // 未达成：奖励图标降饱和发灰
      this._mountSprite(root, UI_IMAGES.iconLingyu, -r * 0.28, -2, icon, icon, {
        tint: 0x9a9a9a, alpha: 0.72,
      });
      this._mountSprite(root, UI_IMAGES.iconShard, r * 0.3, 3, Math.round(icon * 0.9), Math.round(icon * 0.9), {
        tint: 0x9a9a9a, alpha: 0.72,
      });
      this._drawLockBadge(root, r * 0.62, r * 0.58);
    }

    const tagLabel = state === 'claimed'
      ? '已领'
      : (state === 'claimable' ? '待领' : '未达');
    const tagFill = state === 'claimed'
      ? 0xd8f0d0
      : (state === 'claimable' ? 0xffe9a0 : 0xe8e4dc);
    const tagBorder = state === 'claimed'
      ? COLORS.btnSuccessBorder
      : (state === 'claimable' ? 0xd4a84a : 0xb0aaa0);
    const tagTextFill = state === 'claimed'
      ? COLORS.textPositive
      : (state === 'claimable' ? 0x5c3d24 : COLORS.textDisabled);
    const tagW = Math.round(r * (state === 'claimable' ? 1.55 : 1.45));
    const tagH = MILESTONE_TAG_H;
    const tagY = r + MILESTONE_TAG_GAP;
    root.addChild(this._drawHexTag(0, tagY, tagW, tagH, tagFill, tagBorder));
    const tagText = makeText(tagLabel, {
      size: state === 'claimable' ? MILESTONE_TAG_SIZE + 1 : MILESTONE_TAG_SIZE,
      fill: tagTextFill, bold: true, anchor: 0.5, role: 'body',
    });
    tagText.position.set(0, tagY);
    root.addChild(tagText);

    if (state === 'claimable') {
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.hitArea = new PIXI.Rectangle(-r - 8, -r - 10, (r + 8) * 2, r * 2 + tagH + 28);
      pressFeedback(root);
      bindPointerTap(root, () => {
        if (!PlayerData.claimTowerMilestone(floor)) return;
        grantReward(TOWER_MILESTONE_REWARD);
        Platform.showToast(`领取成功 · ${formatReward(TOWER_MILESTONE_REWARD)}`, 'success');
        this._build();
      });
    }
  }

  /** 可领取槽外圈碎金点 */
  private _drawClaimSparkles(parent: PIXI.Container, radius: number): void {
    const g = new PIXI.Graphics();
    const dots: Array<[number, number, number]> = [
      [-0.85, -0.55, 2.2], [0.9, -0.4, 1.8], [-0.2, -0.95, 1.6],
      [0.55, 0.75, 1.7], [-0.7, 0.65, 1.5], [0.15, 0.92, 1.4],
    ];
    for (const [nx, ny, s] of dots) {
      g.beginFill(0xfff3c8, 0.95);
      g.drawCircle(nx * radius, ny * radius, s);
      g.endFill();
    }
    parent.addChild(g);
  }

  /** 未达成右下角小锁 */
  private _drawLockBadge(parent: PIXI.Container, x: number, y: number): void {
    const g = new PIXI.Graphics();
    g.beginFill(0x7a6248, 1);
    g.lineStyle(1.2, 0xf0e6d4, 0.9);
    g.drawCircle(x, y, 10);
    g.endFill();
    g.lineStyle(2.4, 0xf5efe6, 1);
    g.arc(x, y - 3.2, 3.6, Math.PI * 1.05, -0.05);
    g.beginFill(0xf5efe6, 1);
    g.drawRoundedRect(x - 4.2, y - 1.5, 8.4, 6.5, 1.6);
    g.endFill();
    g.beginFill(0x7a6248, 1);
    g.drawCircle(x, y + 1.2, 1.3);
    g.endFill();
    parent.addChild(g);
  }

  /** 已领取灰勾 */
  private _drawCheckMark(parent: PIXI.Container, size: number): void {
    const g = new PIXI.Graphics();
    g.lineStyle(5.5, COLORS.textPositive, 1);
    g.moveTo(-size * 0.38, size * 0.02);
    g.lineTo(-size * 0.08, size * 0.32);
    g.lineTo(size * 0.4, -size * 0.3);
    parent.addChild(g);
  }

  /** 横向六角标签（圆角矩形切角近似） */
  private _drawHexTag(
    x: number,
    y: number,
    w: number,
    h: number,
    fill: number,
    border: number,
  ): PIXI.Graphics {
    const g = new PIXI.Graphics();
    const hw = w / 2;
    const hh = h / 2;
    const cut = Math.min(8, hw * 0.35);
    g.beginFill(fill, 1);
    g.lineStyle(1.5, border, 1);
    g.moveTo(x - hw + cut, y - hh);
    g.lineTo(x + hw - cut, y - hh);
    g.lineTo(x + hw, y);
    g.lineTo(x + hw - cut, y + hh);
    g.lineTo(x - hw + cut, y + hh);
    g.lineTo(x - hw, y);
    g.closePath();
    g.endFill();
    return g;
  }

  private _buildCta(w: number, y: number): void {
    const tower = PlayerData.tower;

    if (!tower.runEnded) {
      // 文案对齐原型：挑战第37层（无空格）
      const btn = makeWarmGoldCtaButton({
        title: `挑战第${tower.runFloor}层`,
        width: CTA_BTN_W,
        height: CTA_BTN_H,
        onTap: () => void this._challenge(tower.runFloor),
      });
      btn.position.set(w / 2, y + CTA_BTN_H / 2);
      this.container.addChild(btn);
      this._buildSkipHint(w, y + CTA_BTN_H + CTA_HINT_GAP + CTA_HINT_H / 2);
      return;
    }

    const canReset = PlayerData.towerResetsLeft > 0;
    const needsAd = PlayerData.towerResetNeedsAd;
    const title = canReset
      ? (needsAd ? '看广告重置' : '免费重置')
      : '今日次数已用完';
    const btn = makeWarmGoldCtaButton({
      title,
      width: CTA_BTN_W,
      height: CTA_BTN_H,
      enabled: canReset,
      onTap: () => void this._offerReset(),
    });
    btn.position.set(w / 2, y + CTA_BTN_H / 2);
    this.container.addChild(btn);

    if (canReset) {
      const start = PlayerData.towerCheckpointFloor();
      const reroll = Math.max(0, start - 1) + PlayerData.towerLegacy.startBlesses;
      const sub = makeText(
        `从第 ${start} 层满血重来 · 随机补发 ${reroll} 道机缘`,
        { size: FONT_SIZE.xxs, fill: 0x8a6a4a, bold: true, anchor: 0.5 },
      );
      sub.position.set(w / 2, y + CTA_BTN_H + CTA_HINT_GAP + CTA_HINT_H / 2);
      this.container.addChild(sub);
    }
  }

  /**
   * 直登入口。只在当前层明显低于主线进度时出现，所以早早开塔、一路爬上来的玩家
   * 根本看不到它 —— 它补的是「推了很久主线才第一次进塔」的入场摩擦。
   */
  private _buildSkipHint(w: number, y: number): void {
    const target = PlayerData.towerSkipTarget;
    if (target == null) return;

    const label = makeText(`实力已远超本层 · 直登第 ${target} 层`, {
      size: FONT_SIZE.xxs, fill: COLORS.textTitle, bold: true, anchor: 0.5,
    });
    try { label.updateText(true); } catch { /* noop */ }

    const padX = 16;
    const chipW = Math.ceil(label.width) + padX * 2;
    const chipH = CTA_HINT_H;
    const chip = new PIXI.Container();
    chip.position.set(w / 2, y);
    const bg = new PIXI.Graphics();
    bg.beginFill(COLORS.panelBg, 0.94);
    bg.lineStyle(1.5, COLORS.panelBorder, 0.9);
    bg.drawRoundedRect(-chipW / 2, -chipH / 2, chipW, chipH, chipH / 2);
    bg.endFill();
    chip.addChild(bg);
    chip.addChild(label);
    chip.eventMode = 'static';
    chip.cursor = 'pointer';
    chip.hitArea = new PIXI.Rectangle(-chipW / 2 - 8, -chipH / 2 - 6, chipW + 16, chipH + 12);
    pressFeedback(chip);
    bindPointerTap(chip, () => void this._skipToEntry(target));
    this.container.addChild(chip);
  }

  private async _skipToEntry(target: number): Promise<void> {
    const from = PlayerData.tower.runFloor;
    const seq = this._buildSeq;
    if (!await showTowerSkipDialog(this.container, from, target)) return;
    if (seq !== this._buildSeq) return;
    const landed = PlayerData.towerSkipToEntryFloor();
    if (landed == null) return;
    analytics.track('tower_skip', { from, to: landed });
    Platform.showToast(`已直登第 ${landed} 层`, 'success');
    this._build();
  }

  /**
   * 择路 → 进战斗 / 就地结算。
   * 非战斗路径已在浮层内推进层数，回来只需重建本页。
   */
  private async _challenge(floor: number): Promise<void> {
    if (PlayerData.team.length === 0) {
      Platform.showToast('至少上阵 1 只灵宠');
      return;
    }
    // 择路是异步的，期间玩家可能已经离开本页
    const seq = this._buildSeq;
    const choice = await showTowerPathPicker(this.container, floor);
    if (seq !== this._buildSeq || !choice) return;
    if (!choice.needsBattle) {
      this._build();
      return;
    }
    this._enterFloorBattle(floor, choice.kind);
  }

  private _enterFloorBattle(floor: number, kind: TowerFloorKind): void {
    const def = TOWER_FLOOR_KINDS[kind];
    buildTowerStage(floor, {
      difficultyMult: def.difficultyMult,
      extraWaves: def.extraWaves,
      kind,
    });
    const context: BattleContext = { kind: 'tower', floor };
    analytics.track('tower_floor_start', {
      floor,
      best_floor: PlayerData.tower.bestFloor,
      hp_pct: Math.round(PlayerData.tower.runHpPct * 100),
      path: kind,
    });
    Platform.vibrateShort('medium');
    SceneManager.switchTo('team', {
      stageId: towerStageId(floor),
      context,
      backScene: 'tower',
    } satisfies TeamEnterData);
  }

  private async _offerReset(): Promise<void> {
    if (PlayerData.towerResetsLeft <= 0) {
      Platform.showToast('今日重置次数已用完');
      return;
    }
    const start = PlayerData.towerCheckpointFloor();
    const seq = this._buildSeq;
    const ok = await showTowerResetDialog(this.container, {
      startFloor: start,
      reroll: Math.max(0, start - 1) + PlayerData.towerLegacy.startBlesses,
      needsAd: PlayerData.towerResetNeedsAd,
      midRun: !PlayerData.towerRunEnded,
      left: PlayerData.towerResetsLeft,
      total: TOWER.dailyResets + PlayerData.towerLegacy.bonusFreeResets,
    });
    if (!ok || seq !== this._buildSeq) return;
    await this._reset(PlayerData.towerResetNeedsAd);
  }

  private async _reset(needsAd: boolean): Promise<void> {
    // 次数上限由 TOWER.dailyResets 代管，故本位在 AD_PLACEMENTS 里标 gatedElsewhere
    if (needsAd && !await watchAd('tower_reset', { floor: PlayerData.tower.runFloor })) return;
    if (!PlayerData.towerReset()) {
      Platform.showToast('今日重置次数已用完');
      return;
    }
    analytics.track('tower_reset', { by_ad: needsAd, floor: PlayerData.tower.runFloor });
    Platform.showToast(`已重置 · 从第 ${PlayerData.tower.runFloor} 层重来`, 'success');
    this._build();
  }

  private _diamond(parent: PIXI.Container, x: number, y: number, color: number): void {
    const g = new PIXI.Graphics();
    g.beginFill(color, 0.9);
    g.moveTo(x, y - 5);
    g.lineTo(x + 5, y);
    g.lineTo(x, y + 5);
    g.lineTo(x - 5, y);
    g.closePath();
    g.endFill();
    parent.addChild(g);
  }

  private _mountSprite(
    parent: PIXI.Container,
    path: string,
    x: number,
    y: number,
    w: number,
    h?: number,
    opts?: { tint?: number; alpha?: number },
  ): void {
    const slot = new PIXI.Container();
    slot.position.set(x, y);
    parent.addChild(slot);
    const apply = (tex: PIXI.Texture): void => {
      slot.removeChildren().forEach((c) => c.destroy());
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      if (h != null) {
        sp.width = w;
        sp.height = h;
      } else {
        const scale = w / Math.max(tex.width, tex.height);
        sp.scale.set(scale);
      }
      if (opts?.tint != null) sp.tint = opts.tint;
      if (opts?.alpha != null) sp.alpha = opts.alpha;
      slot.addChild(sp);
    };
    const cached = TextureCache.get(path);
    if (cached) {
      apply(cached);
      return;
    }
    void TextureCache.load(path).then((tex) => {
      if (!slot.destroyed) apply(tex);
    }).catch(() => null);
  }
}
