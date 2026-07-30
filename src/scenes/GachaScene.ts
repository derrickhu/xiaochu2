/**
 * 抽卡场景：灵玉单抽 / 十连，按 gachaRate 出货，保底进度可见，召唤台演出揭示。
 *
 * 数值与落库全部走 PlayerData（单一真源）；本场景只负责演出与交互。
 * 揭示时间轴解耦在 gacha/gachaRevealSequence.ts；场景只构建结构 + 编排。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { Platform } from '@/core/PlatformService';
import { TextureCache } from '@/core/TextureCache';
import { gachaPreloadImages, gachaPetAvatarEntries, ensurePetAvatars } from '@/config/assetPreload';
import { ensureAssets } from '@/config/Subpackages';
import { UI, ELEMENT_NAME } from '@/balance/ui';
import { PETS, PET_MAP } from '@/balance/pets';
import type { Element } from '@/balance/combat';
import { getRarity } from '@/balance/rarity';
import { CURRENT_BANNER, featuredPetRate } from '@/balance/gachaBanner';
import { ECONOMY } from '@/balance/economy';
import { analytics } from '@/analytics';
import { PlayerData } from '@/game/PlayerData';
import { type PullOutcome } from '@/game/gacha/Gacha';
import { gachaPoolPets } from '@/game/playerGacha';
import { adUsesLeft, adUsesLeftText, watchAd } from '@/game/adGate';
import { reportQuest } from '@/game/dailyQuestTracker';
import {
  BACKGROUND_IMAGES, UI_IMAGES, UI_FX_IMAGES, skillIconImage,
} from '@/config/Assets';
import {
  COLORS, FONT_SIZE,
  makeBackButton, makeButton, makeCoverBackground, makePanel, makeText, makePageTitlePlaque,
  makeModalTitlePlaque, makeCurrencyLabel, makeProgressBar, makeActionButton,
  SceneFx, type ActionButtonHandle,
} from '@/ui';
import { GachaRevealSequence } from './gacha/gachaRevealSequence';
import { buildGachaCompareCard, pickFeaturedOutcome } from './gacha/gachaCompareCard';
import {
  buildGachaResultCard, multiResultCardSize, singleResultCardSize,
  RESULT_CARD_UNDER_HANG,
} from './gacha/gachaResultCard';
import {
  buildGachaShardChip, buildGachaShardResult,
  multiShardChipSize, singleShardResultSize,
} from './gacha/gachaShardResult';
import { SceneEnterSeq } from '@/utils/sceneEnterSeq';
import { bindPointerTap } from '@/utils/bindPointerTap';

export class GachaScene implements Scene {
  readonly name = 'gacha';
  readonly container = new PIXI.Container();

  /** 主页面内容层（element 切换 / 抽卡后局部重建；onExit 整页重建避免二次进入脏状态） */
  private _page = new PIXI.Container();

  /** 当前选中的五行筛选；null = 全局池（默认） */
  private _elementFilter: Element | null = null;
  /** 结果浮层当前的特效宿主（由 update 驱动） */
  private _fx: SceneFx | null = null;
  private _reveal: GachaRevealSequence | null = null;
  /** 上次抽卡数量，用于「再抽一次」 */
  private _lastCount: 1 | 10 = 1;
  /** 主界面抽卡按钮（结果浮层打开时需禁用，避免误触底层十连） */
  private _singlePullBtn: ActionButtonHandle | null = null;
  private _tenPullBtn: ActionButtonHandle | null = null;
  private _freePullBtn: ActionButtonHandle | null = null;
  private _freePulling = false;
  private readonly _enterSeq = new SceneEnterSeq();

  onEnter(): void {
    Game.setMaxFPS(UI.fps.idle);
    PlayerData.load();
    const token = this._enterSeq.next();
    this._ensurePage();
    this._build();
    void Game.warmScenePresent();
    void this._hydrateShell(token);
  }

  private async _hydrateShell(token: number): Promise<void> {
    await ensureAssets(gachaPreloadImages()).catch((e) => {
      console.warn('[Gacha] 壳层资源加载失败', e);
    });
    await ensurePetAvatars(gachaPetAvatarEntries()).catch((e) => {
      console.warn('[Gacha] 头像预热失败', e);
    });
    if (!this._enterSeq.stillValid(token)) return;
    if (SceneManager.current?.name !== 'gacha') return;
    this._ensurePage();
    this._build();
  }

  /** 保证 _page 挂载到 container 且未销毁 */
  private _ensurePage(): void {
    if (this._page.destroyed) this._page = new PIXI.Container();
    if (this._page.parent !== this.container) {
      this.container.addChild(this._page);
    }
  }

  onExit(): void {
    this._enterSeq.cancel();
    this._teardownResults();
    this.container.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._page = new PIXI.Container();
  }

  update(dt: number): void {
    this._fx?.update(dt);
  }

  private _build(): void {
    if (SceneManager.current?.name !== 'gacha') return;
    this._ensurePage();
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._page.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 砸金蛋主视觉背景（对齐原型）
    this._page.addChild(makeCoverBackground(BACKGROUND_IMAGES.gachaEgg, w, h));

    const back = makeBackButton({
      onTap: () => SceneManager.switchTo('title'),
    });
    back.position.set(80, Game.safeHeaderCenterY);
    this._page.addChild(back);

    const titleY = Game.safeHeaderCenterY;
    const plaqueH = this._buildTitlePlaque(w, titleY, '灵宠召唤');

    // 灵玉：居中放在标题匾下方（不再右对齐挤顶栏）
    const balance = makeCurrencyLabel('lingyu', PlayerData.lingyu);
    const balPadX = 18;
    const balH = 48;
    const balW = Math.max(120, Math.ceil(balance.width) + balPadX * 2);
    const balBg = new PIXI.Container();
    balBg.addChild(makePanel({
      width: balW, height: balH, radius: balH / 2, centered: true,
      bg: COLORS.panelBg, bgAlpha: 0.92, border: COLORS.panelBorderSoft, borderWidth: 2,
    }));
    // IconLabel 原点在左缘垂直中心 → 整组水平居中于胶囊
    balance.position.set(-Math.ceil(balance.width) / 2, 0);
    balBg.addChild(balance);
    const balY = titleY + plaqueH / 2 + 10 + balH / 2;
    balBg.position.set(w / 2, balY);
    this._page.addChild(balBg);

    // 保底区接在灵玉胶囊下方，避免与标题叠压
    this._buildPity(w, balY + balH / 2 + 18);

    // 对齐原型：偏金标题字 + 深棕轻阴影（非纯白）
    const tip = makeText('敲碎金蛋，召唤仙灵', {
      size: FONT_SIZE.lg,
      fill: COLORS.gachaEggTip,
      bold: true,
      anchor: 0.5,
      dropShadow: { color: 0x5a3a12, blur: 3, distance: 2, alpha: 0.55 },
    });
    tip.position.set(w / 2, h - 270);
    this._page.addChild(tip);

    // 金蛋热区：点击 = 单抽
    const eggHit = new PIXI.Graphics();
    eggHit.beginFill(0xffffff, 0.001);
    eggHit.drawEllipse(0, 0, 170, 210);
    eggHit.endFill();
    eggHit.position.set(w / 2, h * 0.48);
    eggHit.eventMode = 'static';
    eggHit.cursor = 'pointer';
    bindPointerTap(eggHit, () => this._doPull(1));
    this._page.addChild(eggHit);

    this._buildPullButtons(w, h);
  }

  /**
   * 保底进度：对齐 UI 原型截图
   * - 正文冷静炭灰（非土黄粗墨）
   * - SSR 稀有紫、剩余次数亮橙，同行同字号，无描边
   * - 底注浅灰细字含 UR 提示
   */
  private _buildPity(w: number, y: number): void {
    const pity = ECONOMY.gacha.pitySSR;
    const cur = Math.min(pity, PlayerData.gachaSinceHigh);
    const remain = Math.max(0, pity - cur);
    const ssrColor = getRarity(3).color;
    const body = COLORS.gachaPityText;
    const fontSize = FONT_SIZE.sm;

    const row = new PIXI.Container();
    const prefix = makeText('距离 ', {
      size: fontSize, fill: body, bold: true, anchor: [0, 0.5],
    });
    const ssr = makeText('SSR', {
      size: fontSize, fill: ssrColor, bold: true, anchor: [0, 0.5],
    });
    const mid = makeText(' 灵宠必出还差 ', {
      size: fontSize, fill: body, bold: true, anchor: [0, 0.5],
    });
    const num = makeText(`${remain}`, {
      size: fontSize, fill: COLORS.gachaPityRemain, bold: true, anchor: [0, 0.5],
    });
    const suffix = makeText(' 抽', {
      size: fontSize, fill: body, bold: true, anchor: [0, 0.5],
    });
    let x = 0;
    for (const t of [prefix, ssr, mid, num, suffix]) {
      t.position.set(x, 0);
      row.addChild(t);
      x += t.width;
    }
    row.position.set(w / 2 - x / 2, y);
    this._page.addChild(row);

    const barW = 560;
    const barH = 40;
    const bar = makeProgressBar({
      width: barW, height: barH, ratio: cur / pity, frame: true,
    });
    bar.position.set(w / 2 - barW / 2, y + 26);
    this._page.addChild(bar);

    // 底注文案必须落在进度框主体宽度内，避免「溢出花边」
    const urRemain = Math.max(0, ECONOMY.gacha.pityUR - PlayerData.gachaSinceUr);
    // 进度框左右约 14.5% 花边，可读区约 71%
    const noteMaxW = Math.floor(barW * 0.68);
    const addNote = (str: string, dy: number, fill: number): void => {
      const note = makeText(str, {
        size: FONT_SIZE.xs, fill, bold: false, anchor: 0.5,
      });
      try { note.updateText(true); } catch { /* noop */ }
      if (note.width > noteMaxW) note.scale.set(noteMaxW / note.width);
      note.position.set(w / 2, y + dy);
      this._page.addChild(note);
    };
    addNote(`十连必出 SR 或以上 · UR 天井还差 ${urRemain} 抽`, 80, COLORS.textSub);
    const up = PET_MAP.get(CURRENT_BANNER.featuredUr);
    if (up) {
      const urCount = PETS.filter((p) => p.rarity === 4).length;
      const rate = featuredPetRate(up.id, getRarity(4).gachaRate, urCount);
      const pct = (rate * 100).toFixed(1);
      addNote(`本期 UP：${up.name} ${pct}% · 另 2 只 SSR 同步提升`, 108, getRarity(4).color);
    }
  }

  /** @returns 匾高度，供下方灵玉/保底区排布 */
  private _buildTitlePlaque(w: number, centerY: number, label: string): number {
    const plaque = makePageTitlePlaque({ text: label, screenWidth: w });
    plaque.position.set(w / 2, centerY);
    this._page.addChild(plaque);
    return plaque.plaqueH ?? 104;
  }

  private _buildPullButtons(w: number, h: number): void {
    const g = ECONOMY.gacha;
    // 贴近底板约 2.1:1，减少纵向压扁
    const btnW = 320;
    const btnH = 148;
    const gap = 16;
    const y = h - 140;

    this._singlePullBtn = makeActionButton({
      title: '单抽',
      subtitle: `${g.singleCost} 灵玉`,
      width: btnW,
      height: btnH,
      variant: 'gold',
      enabled: PlayerData.lingyu >= g.singleCost,
      onTap: () => this._doPull(1),
    });
    this._singlePullBtn.position.set(w / 2 - btnW / 2 - gap / 2, y);
    this._page.addChild(this._singlePullBtn);

    this._tenPullBtn = makeActionButton({
      title: '十连',
      subtitle: this._tenPullSubtitle(),
      width: btnW,
      height: btnH,
      variant: 'cream',
      enabled: this._canTenPull,
      onTap: () => this._doPull(10),
    });
    this._tenPullBtn.position.set(w / 2 + btnW / 2 + gap / 2, y);
    this._page.addChild(this._tenPullBtn);

    this._buildFreePullChip(w, y - btnH / 2 - 52);
  }

  /**
   * 广告免费单抽（IAA，日 1 次）：抽卡页是留存最强的回访钩子，
   * 「今天还有一次免费」比任何签到提示都更能把人拉回来。
   * 出货口径与付费单抽完全一致（同一 pullOne，保底计数照走），否则免费抽会变成体感更差的假福利。
   */
  private _buildFreePullChip(w: number, y: number): void {
    if (adUsesLeft('free_gacha_pull') <= 0) return;
    // 成功态底板金边吃掉上下内边距，双行文案需要更高胶囊才不贴底
    this._freePullBtn = makeActionButton({
      title: '看广告免费单抽',
      subtitle: adUsesLeftText('free_gacha_pull'),
      width: 360,
      height: 84,
      variant: 'success',
      fontSize: 22,
      onTap: () => { void this._doFreePull(); },
    });
    this._freePullBtn.position.set(w / 2, y);
    this._page.addChild(this._freePullBtn);
  }

  private async _doFreePull(): Promise<void> {
    if (this._freePulling) return;
    this._freePulling = true;
    try {
      if (!await watchAd('free_gacha_pull')) return;
      this._doPull(1, { free: true });
      if (adUsesLeft('free_gacha_pull') <= 0) {
        this._freePullBtn?.destroy();
        this._freePullBtn = null;
      } else {
        this._freePullBtn?.setLabels('看广告免费单抽', adUsesLeftText('free_gacha_pull'));
      }
    } finally {
      this._freePulling = false;
    }
  }

  /** 十连券优先于灵玉：券是签到发的定向奖励，留在背包里没有别的出口 */
  private get _canTenPull(): boolean {
    return PlayerData.tickets > 0 || PlayerData.lingyu >= ECONOMY.gacha.tenCost;
  }

  private _tenPullSubtitle(): string {
    return PlayerData.tickets > 0
      ? `十连券 ×${PlayerData.tickets}`
      : `${ECONOMY.gacha.tenCost} 灵玉`;
  }

  /** 结果浮层期间禁用主界面抽卡按钮（灵玉已扣但按钮 enabled 未刷新，会误触十连） */
  private _setMainPullButtonsEnabled(enabled: boolean): void {
    const g = ECONOMY.gacha;
    this._singlePullBtn?.setEnabled(enabled && PlayerData.lingyu >= g.singleCost);
    this._tenPullBtn?.setEnabled(enabled && this._canTenPull);
  }

  private _activePoolElement(): Element | undefined {
    return this._elementFilter ?? undefined;
  }

  private _doPull(count: 1 | 10, opts?: { free?: boolean }): void {
    const el = this._activePoolElement();
    if (PlayerData.gachaPoolIds(el).length === 0) {
      Platform.showToast(el ? `${ELEMENT_NAME[el]}系暂无可召唤生物` : '召唤池为空');
      return;
    }
    let list: PullOutcome[] | null;
    let byTicket = false;
    if (count === 1) {
      const o = opts?.free
        ? PlayerData.pullGachaFree(Math.random, el)
        : PlayerData.pullGachaSingle(Math.random, el);
      list = o ? [o] : null;
    } else if (PlayerData.tickets > 0) {
      list = PlayerData.pullGachaTenByTicket(Math.random, el);
      byTicket = !!list;
    } else {
      list = PlayerData.pullGachaTen(Math.random, el);
    }
    if (!list) {
      Platform.showToast('灵玉不足');
      return;
    }
    if (byTicket) Platform.showToast('已使用十连券 ×1');
    reportQuest('gachaPull', count);
    analytics.trackFountainDraw({
      drawType: count === 10 ? 'ten' : 'single',
      cost: byTicket || opts?.free
        ? 0
        : count === 10 ? ECONOMY.gacha.tenCost : ECONOMY.gacha.singleCost,
      element: el,
      // SSR 及以上（rarity tier 3/4）计入高稀有出货
      highRarityCount: list.filter((o) => o.rarity >= 3).length,
    });
    this._lastCount = count;
    void this._showResults(list);
  }

  // ── 结果浮层 + 揭示演出 ──

  private _teardownResults(): void {
    this._reveal?.destroy();
    this._reveal = null;
    this._fx?.destroy();
    this._fx = null;
    this._page.visible = true;
  }

  private async _showResults(outcomes: PullOutcome[]): Promise<void> {
    // 对比区技能圆标在 pkg-fx：出货后再 ensure，避免量产技只显示首字占位
    const skillPaths = outcomes
      .map((o) => PET_MAP.get(o.petId)?.skillId)
      .filter((id): id is string => !!id)
      .map((id) => skillIconImage(id));
    if (skillPaths.length > 0) {
      await ensureAssets(skillPaths).catch((e) => {
        console.warn('[GachaScene] 技能图标预热失败', e);
      });
    }

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._teardownResults();
    this._setMainPullButtonsEnabled(false);
    // 隐藏主界面（保底条/UP/金蛋按钮），避免透出打乱结果页
    this._page.visible = false;

    const overlay = new PIXI.Container();
    this.container.addChild(overlay);

    // 仍用砸蛋山水底，但遮罩加厚，金蛋不再抢戏
    overlay.addChild(makeCoverBackground(BACKGROUND_IMAGES.gachaEgg, w, h));
    const allDuplicate = outcomes.every((o) => o.duplicate);
    const scrim = new PIXI.Graphics();
    // 纯碎片：遮罩略浅，弱化「砸蛋大庆」感
    scrim.beginFill(0x1a2a24, allDuplicate ? 0.42 : 0.55);
    scrim.drawRect(0, 0, w, h);
    scrim.endFill();
    scrim.eventMode = 'static';
    scrim.hitArea = new PIXI.Rectangle(0, 0, w, h);
    bindPointerTap(scrim, () => {});
    overlay.addChild(scrim);

    const stage = new PIXI.Container();
    overlay.addChild(stage);
    const fxBack = new PIXI.Container();
    const cardsLayer = new PIXI.Container();
    const fxFront = new PIXI.Container();

    // ── V2：标题下紧贴主视觉 → 对比区 → 底栏等宽贴图钮 ──
    const btnH = 80;
    const btnBottomPad = Math.max(14, Game.safeBottom + 8);
    const btnCenterY = h - btnBottomPad - btnH / 2;
    const btnTop = btnCenterY - btnH / 2;

    const gapCompareToBtn = 8;
    /** 主视觉与对比区间距 */
    const gapCardToCompare = 4;

    const featured = pickFeaturedOutcome(outcomes);
    let compareH = 0;
    let compareRoot: PIXI.Container | null = null;
    if (featured) {
      const compare = buildGachaCompareCard({
        w,
        bottomY: btnTop - gapCompareToBtn,
        outcome: featured,
        onDeployed: () => {
          Platform.showToast(`${PET_MAP.get(featured.petId)?.name ?? ''} 已上阵`);
          compareRoot?.destroy({ children: true });
          compareRoot = null;
        },
      });
      if (compare) {
        compareH = compare.height;
        compareRoot = compare.root;
        compareRoot.visible = false;
        overlay.addChild(compareRoot);
      }
    }

    const heading = makeModalTitlePlaque({
      text: allDuplicate
        ? '碎片转化'
        : (outcomes.length > 1 ? '十连结果' : '召唤结果'),
      // 加宽中段 + xxl，避免四字标题被花边夹窄后强制缩字
      panelWidth: Math.min(680, w - 40),
      size: 'xxl',
      height: 132,
    });
    const headingY = Game.safeTop + 40;
    heading.position.set(w / 2, headingY);

    let cardsTop = headingY + (heading.plaqueH ?? 96) * 0.5 + 2;
    if (allDuplicate) {
      const sub = makeText('—— 重复召唤 ——', {
        size: FONT_SIZE.sm,
        fill: COLORS.textSub,
        bold: true,
        anchor: 0.5,
      });
      sub.position.set(w / 2, cardsTop + 10);
      stage.addChild(sub);
      cardsTop += 28;
    }
    const cardsBottom = compareH > 0
      ? btnTop - gapCompareToBtn - compareH - gapCardToCompare
      : btnTop - 12;

    stage.addChild(fxBack, heading, cardsLayer, fxFront);

    const cards = this._buildResultCards(outcomes, cardsTop, cardsBottom);
    cards.forEach((c) => cardsLayer.addChild(c));

    // 底栏按钮先建好，演出结束再显示
    const footer = this._buildResultButtons(overlay, btnCenterY, () => {
      this._teardownResults();
      this._page.visible = true;
      overlay.destroy({ children: true });
      this._build();
    });
    footer.visible = false;

    this._fx = new SceneFx();
    this._fx.build(overlay, w, h, stage);
    const fx = this._fx;

    const skipBtn = makeButton({
      label: '跳过', width: 110, height: 48, variant: 'ghost',
      onTap: () => this._reveal?.skip(),
    });
    skipBtn.position.set(Math.min(w - 90, Game.contentRightX(20)), Game.safeHeaderCenterY);
    overlay.addChild(skipBtn);

    const centerY = cards.length === 1
      ? cards[0].y
      : (cardsTop + cardsBottom) / 2;
    this._reveal = new GachaRevealSequence({
      w, h, centerY, outcomes,
      handles: { fxBack, fxFront, cards, heading },
      textures: {
        pillar: TextureCache.get(UI_FX_IMAGES.lightPillar),
        circle: TextureCache.get(UI_FX_IMAGES.summonCircle),
        starburst: TextureCache.get(UI_FX_IMAGES.starburst),
        aura: TextureCache.get(UI_FX_IMAGES.auraRing),
        spark: TextureCache.get(UI_FX_IMAGES.particleSpark),
        rays: TextureCache.get(UI_FX_IMAGES.gachaRays),
        petal: TextureCache.get(UI_FX_IMAGES.gachaPetal),
      },
      flash: (color, peak, dur) => fx.flash(color, peak, dur),
      shake: (lvl) => { if (lvl === 'heavy') fx.shakeHeavy(); else if (lvl === 'medium') fx.shakeMedium(); else fx.shakeLight(); },
      burst: (x, y, color, strong) => fx.burst({
        x, y, color, count: strong ? 26 : 12,
        speed: strong ? 460 : 300, life: strong ? 0.9 : 0.6,
        gravity: 240, size: strong ? 46 : 28, endScale: 0.1,
        texture: TextureCache.get(UI_FX_IMAGES.particleSpark) ?? undefined,
        blendMode: PIXI.BLEND_MODES.ADD,
      }),
      vibrate: (p) => Platform.vibrateShort(p),
      onDone: () => {
        skipBtn.visible = false;
        if (compareRoot) compareRoot.visible = true;
        footer.visible = true;
      },
    });
    this._reveal.play();
  }

  /** 结果底栏：奶油 / 翠绿等宽等高贴图钮（对齐 V2） */
  private _buildResultButtons(
    overlay: PIXI.Container,
    centerY: number,
    onClose: () => void,
  ): PIXI.Container {
    const w = Game.logicWidth;
    const g = ECONOMY.gacha;
    const el = this._activePoolElement();
    const affordable = this._lastCount === 10
      ? this._canTenPull
      : PlayerData.lingyu >= g.singleCost;
    const canRepull = affordable && PlayerData.gachaPoolIds(el).length > 0;

    const wrap = new PIXI.Container();
    // 两侧严格同尺寸，避免 cream 贴图视觉偏矮
    const btnW = 300;
    const btnH = 80;
    const gap = 18;

    const again = makeActionButton({
      title: `再抽 ${this._lastCount === 10 ? '十连' : '单抽'}`,
      width: btnW, height: btnH, variant: 'cream', enabled: canRepull,
      fontSize: FONT_SIZE.md,
      onTap: () => {
        this._teardownResults();
        this._page.visible = true;
        overlay.destroy({ children: true });
        this._doPull(this._lastCount);
      },
    });
    again.position.set(w / 2 - (btnW + gap) / 2, centerY);
    wrap.addChild(again);

    const confirm = makeActionButton({
      title: '确定', width: btnW, height: btnH, variant: 'success',
      fontSize: FONT_SIZE.md,
      onTap: onClose,
    });
    confirm.position.set(w / 2 + (btnW + gap) / 2, centerY);
    wrap.addChild(confirm);

    overlay.addChild(wrap);
    return wrap;
  }

  /**
   * 结果主视觉：
   * - 单抽新宠 → 大金框；单抽重复 → 碎片转化英雄区
   * - 十连：新宠大金框格，重复用小碎晶格（有新宠时整宠仍占主视觉权重）
   */
  private _buildResultCards(
    outcomes: PullOutcome[],
    topY: number,
    bottomY: number,
  ): PIXI.Container[] {
    const w = Game.logicWidth;
    const multi = outcomes.length > 1;
    const areaH = Math.max(220, bottomY - topY);

    if (!multi) {
      const o = outcomes[0];
      if (o.duplicate) {
        const { w: sw, h: sh } = singleShardResultSize(areaH, Math.min(520, w - 40));
        const card = buildGachaShardResult(o, sw, sh);
        card.position.set(w / 2, topY + areaH / 2);
        return [card];
      }
      const { cardW, cardH } = singleResultCardSize(
        areaH, Math.min(560, w - 24), RESULT_CARD_UNDER_HANG,
      );
      const card = buildGachaResultCard(o, cardW, cardH);
      const hang = RESULT_CARD_UNDER_HANG;
      const topCy = topY + cardH / 2;
      const botCy = bottomY - hang - cardH / 2;
      card.position.set(w / 2, Math.max(topCy, botCy));
      return [card];
    }

    const gap = 12;
    const cols = 5;
    const rows = Math.ceil(outcomes.length / cols);
    // 混抽时格宽取整宠卡；纯碎片时用碎晶格
    const petSize = multiResultCardSize();
    const shardSize = multiShardChipSize();
    const cardW = Math.max(petSize.cardW, shardSize.w);
    const cardH = Math.max(petSize.cardH, shardSize.h);
    const rowW = cols * cardW + (cols - 1) * gap;
    const left = w / 2 - rowW / 2;
    const gridH = rows * cardH + (rows - 1) * gap;
    const startY = topY + Math.max(0, (areaH - gridH) / 2);

    return outcomes.map((o, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const card = o.duplicate
        ? buildGachaShardChip(o, shardSize.w, shardSize.h)
        : buildGachaResultCard(o, petSize.cardW, petSize.cardH);
      const cy = startY + row * (cardH + gap) + cardH / 2;
      card.position.set(left + col * (cardW + gap) + cardW / 2, cy);
      return card;
    });
  }
}
