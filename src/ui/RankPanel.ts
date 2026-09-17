/**
 * 通天塔总榜弹窗。盖在当前场景上，不切页。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import { PlayerData } from '@/game/PlayerData';
import { buildRankPresentation, localSelfEntry, type RankEntry } from '@/game/rankBoard';
import {
  fetchCloudTowerRank,
  readRankListCache,
  refreshCloudTowerRank,
  reportCloudTowerRankIfDirty,
  type CloudRankResult,
} from '@/game/rankCloud';
import { applyHostProfile, ensureHostProfile, HOME_GUEST_NAME, resolveHomeIdentity } from '@/game/rankHostProfile';
import { rankPrimaryCta, rankSelfSubtitle } from '@/game/rankCopy';
import { isFeatureUnlocked } from '@/game/featureGate';
import { layoutRankBoard } from '@/game/rankPageLayout';
import { markRankEntrySeen, towerRankFloor } from '@/game/rankService';
import { SceneManager } from '@/core/SceneManager';
import { mountRankPageChrome, paintRankPageOverlays } from '@/scenes/rank/rankPageView';
import { COLORS, FONT_SIZE } from './theme';
import { makeCloseButton } from './CloseButton';
import { makeModalTitlePlaque } from './NamePlaque';
import { makePanel } from './Panel';
import { makeText } from './text';
import { pressFeedback } from './motion';
import { makeWarmGoldCtaButton } from './WarmGoldCtaButton';
import { bindPointerTap } from '@/utils/bindPointerTap';

export class RankPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _panelBg!: PIXI.Graphics;
  private _plaque!: PIXI.Container;
  private _sub!: PIXI.Container;
  private _refreshLink!: PIXI.Text;
  private _closeBtn!: PIXI.Container;
  private _body!: PIXI.Container;
  private _openFlag = false;
  private _busy = false;
  private _unbindChrome: (() => void) | null = null;
  private _unbindBoard: (() => void) | null = null;
  private _cloudItems: RankEntry[] = [];
  private _cloudSelf: RankEntry | null = null;
  private _cloudReady = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9500;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('rank:open', () => this.open());
    EventBus.on('rank:close', () => this.close());
  }

  get _isOpen(): boolean {
    return this._openFlag;
  }

  set _isOpen(value: boolean) {
    this._openFlag = value;
    if (!value) this._teardown();
  }

  open(): void {
    if (this._openFlag && this.visible) return;
    TweenManager.cancelTarget(this);
    this._openFlag = true;
    this.visible = true;
    PlayerData.load();
    markRankEntrySeen();
    EventBus.emit('home:refresh');
    this._applyCache();
    this._layoutShell();
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    void this._hydrateList();
  }

  close(): void {
    if (!this._openFlag) return;
    this._isOpen = false;
    TweenManager.cancelTarget(this);
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { if (!this._openFlag) this.visible = false; },
    });
  }

  private _applyResult(res: CloudRankResult): void {
    this._cloudItems = res.items;
    this._cloudSelf = res.self;
    this._cloudReady = true;
  }

  private _applyCache(): void {
    const cached = readRankListCache();
    if (cached) {
      this._applyResult(cached);
      return;
    }
    this._cloudItems = [];
    this._cloudSelf = null;
    this._cloudReady = false;
  }

  private async _hydrateList(): Promise<void> {
    const paths = [
      UI_IMAGES.modalTitlePlaque,
      UI_IMAGES.towerBtnCta,
      UI_IMAGES.rankFrameGold,
      UI_IMAGES.rankFrameSilver,
      UI_IMAGES.rankFrameBronze,
      UI_IMAGES.rankFrameList,
      UI_IMAGES.rankPodiumGold,
      UI_IMAGES.rankPodiumSilver,
      UI_IMAGES.rankPodiumBronze,
      UI_IMAGES.rankCrownGold,
      UI_IMAGES.rankCrownSilver,
      UI_IMAGES.rankCrownBronze,
      UI_IMAGES.playerAvatarDefault,
    ];
    const warm = ensureAssets(paths).catch((e) => {
      console.warn('[Rank] 资源预热失败', e);
    });
    // 打开只拉榜；自己的成绩由破纪录 / 巡检 / 刷新按钮上报。
    void reportCloudTowerRankIfDirty(towerRankFloor());
    await Promise.all([warm, fetchCloudTowerRank(towerRankFloor()).then((res) => {
      if (this._openFlag) this._applyResult(res);
    })]);
    if (!this._openFlag) return;
    this._refresh();
    void ensureHostProfile().then(() => {
      void reportCloudTowerRankIfDirty(towerRankFloor());
    }).catch((e) => {
      console.warn('[Rank] 宿主资料获取失败', e);
    });
  }

  private _panelW(): number {
    return Game.logicWidth - 16;
  }

  private _ctaH(): number {
    return 64;
  }

  private _ctaBottomPad(): number {
    return 32;
  }

  private _panelH(): number {
    const innerW = this._panelW() - 40;
    const layout = layoutRankBoard(innerW);
    const topChrome = 128;
    const ctaBlock = 16 + this._ctaH() + this._ctaBottomPad();
    const needed = topChrome + layout.contentH + ctaBlock;
    return Math.min(needed, Game.logicHeight - 40);
  }

  private _buildShell(): void {
    this._dim = new PIXI.Graphics();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.eventMode = 'static';
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    this._panelBg = makePanel({
      width: 100,
      height: 100,
      radius: 28,
      bg: COLORS.rankPanelBg,
      bgAlpha: 1,
      border: COLORS.rankPanelBorder,
      borderWidth: 4,
      centered: true,
    });
    this._content.addChild(this._panelBg);

    this._plaque = makeModalTitlePlaque({ text: '通天塔排行', panelWidth: 720 });
    this._content.addChild(this._plaque);

    this._sub = makeText('历史最高层', {
      size: FONT_SIZE.xs, fill: COLORS.textSub, anchor: 0.5, role: 'body',
    });
    this._content.addChild(this._sub);

    this._refreshLink = makeText('刷新', {
      size: FONT_SIZE.xs, fill: COLORS.textTitle, bold: true, anchor: 0.5, role: 'body',
    });
    this._refreshLink.eventMode = 'static';
    this._refreshLink.cursor = 'pointer';
    this._refreshLink.hitArea = new PIXI.Rectangle(-36, -18, 72, 36);
    bindPointerTap(this._refreshLink, () => { void this._onManualRefresh(); }, {
      guard: () => this._openFlag && !this._busy,
    });
    pressFeedback(this._refreshLink);
    this._content.addChild(this._refreshLink);

    this._closeBtn = makeCloseButton({ onTap: () => this.close() });
    this._content.addChild(this._closeBtn);

    this._body = new PIXI.Container();
    this._content.addChild(this._body);
    this._layoutShell();
  }

  private _layoutShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    const pw = this._panelW();
    const ph = this._panelH();

    this._dim.clear();
    this._dim.beginFill(COLORS.scrim, 0.78);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();

    this._content.position.set(w / 2, h / 2);
    if (this._panelBg.parent) this._content.removeChild(this._panelBg);
    if (!this._panelBg.destroyed) this._panelBg.destroy();
    this._panelBg = makePanel({
      width: pw,
      height: ph,
      radius: 28,
      bg: COLORS.rankPanelBg,
      bgAlpha: 1,
      border: COLORS.rankPanelBorder,
      borderWidth: 4,
      centered: true,
    });
    this._content.addChildAt(this._panelBg, 0);

    this._plaque.position.set(0, -ph / 2 + 18);
    this._sub.position.set(0, -ph / 2 + 108);
    this._refreshLink.position.set(pw / 2 - 72, -ph / 2 + 108);
    this._closeBtn.position.set(pw / 2 - 36, -ph / 2 + 36);
  }

  private _refresh(): void {
    this._teardown();
    this._body.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });

    const panelH = this._panelH();
    const innerW = this._panelW() - 40;
    const layout = layoutRankBoard(innerW);
    const boardTop = -panelH / 2 + 132;
    const board = new PIXI.Container();
    board.position.set(-innerW / 2, boardTop);
    this._body.addChild(board);

    this._unbindChrome = mountRankPageChrome(board, 0, layout);

    const best = towerRankFloor();
    const identity = resolveHomeIdentity();
    // 拿到平台资料才覆盖榜上的名字头像，否则会把云端记录抹成占位名
    const profile = identity.name !== HOME_GUEST_NAME || identity.avatarUrl
      ? { name: identity.name, avatarUrl: identity.avatarUrl || '' }
      : null;
    // 云榜还没回来 / 还没上榜时，先用本地层数占住自己那一格
    const self = applyHostProfile(this._cloudSelf ?? localSelfEntry(best, true), profile);
    const items = this._cloudItems.length
      ? this._cloudItems
      : (this._cloudReady && self && self.floor > 0 ? [self] : []);
    const towerOpen = isFeatureUnlocked('tower');
    const view = buildRankPresentation({ items, self });
    this._unbindBoard = paintRankPageOverlays(board, 0, layout, {
      podium: view.podium,
      list: view.list,
      towerOpen,
    });
    const selfRank = view.podium.find((row) => row?.isSelf)?.rank
      || view.list.find((row) => row?.isSelf)?.rank
      || self?.rank
      || 0;
    if (this._sub instanceof PIXI.Text) {
      this._sub.text = rankSelfSubtitle(best, selfRank, towerOpen);
    }

    const ctaSpec = rankPrimaryCta(best, towerOpen);
    const cta = makeWarmGoldCtaButton({
      title: ctaSpec.title,
      width: 360,
      height: this._ctaH(),
      onTap: () => {
        if (ctaSpec.kind === 'story') this._goStory();
        else if (ctaSpec.kind === 'tower') this._goTower();
        else this._share();
      },
    });
    cta.position.set(0, panelH / 2 - this._ctaBottomPad() - this._ctaH() / 2);
    this._body.addChild(cta);
  }

  private _teardown(): void {
    this._unbindChrome?.();
    this._unbindChrome = null;
    this._unbindBoard?.();
    this._unbindBoard = null;
  }

  private _setRefreshLabel(text: string): void {
    this._refreshLink.text = text;
    this._refreshLink.alpha = this._busy ? 0.55 : 1;
  }

  private async _onManualRefresh(): Promise<void> {
    if (this._busy || !this._openFlag) return;
    this._busy = true;
    this._setRefreshLabel('刷新中');
    try {
      const res = await refreshCloudTowerRank(towerRankFloor());
      if (!this._openFlag) return;
      this._applyResult(res);
      this._refresh();
      Platform.showToast('已更新');
    } catch (e) {
      console.warn('[Rank] 手动刷新失败', e);
      if (this._openFlag) Platform.showToast('刷新失败，稍后再试');
    } finally {
      this._busy = false;
      if (this._openFlag) this._setRefreshLabel('刷新');
    }
  }

  private _goStory(): void {
    this.close();
    SceneManager.switchTo('title', PlayerData.titleEnter());
  }

  private _goTower(): void {
    this.close();
    SceneManager.switchTo('tower');
  }

  private _share(): void {
    const floor = towerRankFloor();
    if (floor <= 0) {
      Platform.showToast('先去爬塔再炫耀');
      return;
    }
    Platform.shareAppMessage({
      title: `我在通天塔爬到了第${floor}层`,
    });
  }
}
