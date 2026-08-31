/**
 * 货币获取途径（全局 Overlay）
 *
 * 主页货币条「+」入口：灵玉 / 灵宠币 / 体力共用一块板，按种类换列表。
 * 视觉对齐日常/体力：顶匾 + 奶油金边板 + cream 前往钮。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { ECONOMY } from '@/balance/economy';
import { ensureAssets } from '@/config/Subpackages';
import { COLORS, FONT_SIZE } from './theme';
import { makeText } from './text';
import { makeActionButton } from './ActionButton';
import { makeCloseButton } from './CloseButton';
import { makePanel } from './Panel';
import { makeModalTitlePlaque } from './NamePlaque';

export type CurrencySourceKind = 'lingyu' | 'coin' | 'stamina';

const PANEL_W = 600;
const ROW_H = 78;
const ROW_GAP = 8;
const INNER_W = PANEL_W - 48;

type SourceGo =
  | { kind: 'scene'; scene: string }
  | { kind: 'overlay'; event: string; arg?: unknown };

interface CurrencySource {
  title: string;
  hint: string;
  icon: string;
  go?: SourceGo;
  actionLabel?: string;
}

const TITLE: Record<CurrencySourceKind, string> = {
  lingyu: '灵玉获取',
  coin: '灵宠币获取',
  stamina: '体力获取',
};

function sourceList(kind: CurrencySourceKind): CurrencySource[] {
  if (kind === 'stamina') {
    const regenMin = Math.round(ECONOMY.stamina.regenSeconds / 60);
    return [
      {
        title: '看广告回体',
        hint: `每次恢复 ${ECONOMY.stamina.adRefill} 点，有每日次数`,
        icon: UI_IMAGES.iconStamina,
        go: { kind: 'overlay', event: 'stamina:open', arg: 0 },
        actionLabel: '回体',
      },
      {
        title: '自然恢复',
        hint: `每 ${regenMin} 分钟恢复 1 点，满瓶即停`,
        icon: UI_IMAGES.iconStamina,
      },
      {
        title: '每日签到',
        hint: '签到常附带体力补给',
        icon: UI_IMAGES.railCheckin,
        go: { kind: 'overlay', event: 'checkin:open' },
      },
      {
        title: '每日任务',
        hint: '部分任务与活跃宝箱会给体力',
        icon: UI_IMAGES.railDaily,
        go: { kind: 'overlay', event: 'daily-quest:open' },
      },
    ];
  }

  if (kind === 'coin') {
    return [
      {
        title: '主线闯关',
        hint: '每关通关都掉灵宠币，主力来源',
        icon: UI_IMAGES.navHome,
        go: { kind: 'scene', scene: 'title' },
      },
      {
        title: '每日任务',
        hint: '日常与活跃宝箱会发灵宠币',
        icon: UI_IMAGES.railDaily,
        go: { kind: 'overlay', event: 'daily-quest:open' },
      },
      {
        title: '每日签到',
        hint: '连续签到发放灵宠币',
        icon: UI_IMAGES.railCheckin,
        go: { kind: 'overlay', event: 'checkin:open' },
      },
      {
        title: '秘境探索',
        hint: '通关额外掉落灵宠币',
        icon: UI_IMAGES.navRealm,
        go: { kind: 'scene', scene: 'realm' },
      },
      {
        title: '通天塔',
        hint: '爬塔得印记，商店印记页可兑灵宠币',
        icon: UI_IMAGES.railTower,
        go: { kind: 'scene', scene: 'tower' },
      },
    ];
  }

  return [
    {
      title: '主线闯关',
      hint: '关卡首通得灵玉，Boss 关更多',
      icon: UI_IMAGES.navHome,
      go: { kind: 'scene', scene: 'title' },
    },
    {
      title: '每日任务',
      hint: '完成日常可领灵玉，活跃度宝箱也有',
      icon: UI_IMAGES.railDaily,
      go: { kind: 'overlay', event: 'daily-quest:open' },
    },
    {
      title: '每日签到',
      hint: '连续签到发放灵玉与十连券',
      icon: UI_IMAGES.railCheckin,
      go: { kind: 'overlay', event: 'checkin:open' },
    },
    {
      title: '灵宠图鉴',
      hint: '收集灵宠可领图鉴灵玉奖励',
      icon: UI_IMAGES.navPet,
      go: { kind: 'scene', scene: 'codex' },
    },
    {
      title: '秘境探索',
      hint: '通关额外掉落灵玉，难度越高越多',
      icon: UI_IMAGES.navRealm,
      go: { kind: 'scene', scene: 'realm' },
    },
    {
      title: '通天塔',
      hint: '里程碑给灵玉，印记也可在商店兑换',
      icon: UI_IMAGES.railTower,
      go: { kind: 'scene', scene: 'tower' },
    },
  ];
}

export class CurrencySourcePanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Container;
  private _isOpen = false;
  private _kind: CurrencySourceKind = 'lingyu';
  private _panelH = 520;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9550;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('currency-source:open', (kind?: CurrencySourceKind) => {
      this.open(kind ?? 'lingyu');
    });
    EventBus.on('currency-source:close', () => this.close());
    EventBus.on('lingyu-source:open', () => this.open('lingyu'));
  }

  open(kind: CurrencySourceKind): void {
    TweenManager.cancelTarget(this);
    this._kind = kind;
    this._isOpen = true;
    this.visible = true;
    this._rebuildFrame();
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    void this._hydrateAssets();
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    TweenManager.cancelTarget(this);
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { if (!this._isOpen) this.visible = false; },
    });
  }

  private async _hydrateAssets(): Promise<void> {
    const paths = [
      UI_IMAGES.iconLingyu, UI_IMAGES.iconCoin, UI_IMAGES.iconStamina,
      UI_IMAGES.modalTitlePlaque, UI_IMAGES.btnPlateCream, UI_IMAGES.btnPlateSuccess,
      ...sourceList(this._kind).map((s) => s.icon),
    ];
    await ensureAssets(paths).catch((e) => console.warn('[CurrencySource] 资源预热失败', e));
    if (!this._isOpen) return;
    this._refresh();
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._dim = new PIXI.Graphics();
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.position.set(w / 2, h / 2);
    this._content.eventMode = 'static';
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    this._body = new PIXI.Container();
    this._content.addChild(this._body);
  }

  private _rebuildFrame(): void {
    this._content.removeChildren().forEach((c) => {
      if (c !== this._body) c.destroy({ children: true });
    });
    const sources = sourceList(this._kind);
    this._panelH = 92 + sources.length * (ROW_H + ROW_GAP) + 28;

    this._content.addChild(makePanel({
      width: PANEL_W, height: this._panelH,
      bg: COLORS.panelBg, border: COLORS.panelBorder,
      borderWidth: 3, radius: 28, centered: true,
    }));

    const plaque = makeModalTitlePlaque({ text: TITLE[this._kind], panelWidth: PANEL_W });
    plaque.position.set(0, -this._panelH / 2 + 18);
    this._content.addChild(plaque);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(PANEL_W / 2 - 36, -this._panelH / 2 + 36);
    this._content.addChild(closeBtn);

    this._content.addChild(this._body);
  }

  private _refresh(): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sources = sourceList(this._kind);
    let y = -this._panelH / 2 + 88;
    for (const src of sources) {
      this._body.addChild(this._makeRow(src, y));
      y += ROW_H + ROW_GAP;
    }
  }

  private _makeRow(src: CurrencySource, y: number): PIXI.Container {
    const row = new PIXI.Container();
    row.position.set(0, y + ROW_H / 2);

    row.addChild(makePanel({
      width: INNER_W, height: ROW_H, radius: 14, centered: true,
      bg: 0xf7f3e9, bgAlpha: 0.96, border: COLORS.panelBorderSoft, borderWidth: 1.5,
    }));

    const iconSize = 48;
    const iconX = -INNER_W / 2 + 36;
    const tex = TextureCache.get(src.icon);
    if (tex) {
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      const sc = iconSize / Math.max(tex.width, tex.height);
      sp.scale.set(sc);
      sp.position.set(iconX, 0);
      row.addChild(sp);
    } else {
      const ph = new PIXI.Graphics();
      ph.beginFill(0xc9a45a, 0.35);
      ph.drawCircle(0, 0, iconSize / 2);
      ph.endFill();
      ph.position.set(iconX, 0);
      row.addChild(ph);
    }

    const title = makeText(src.title, {
      size: FONT_SIZE.sm, fill: COLORS.textMain, bold: false, anchor: [0, 0.5], role: 'title',
    });
    title.position.set(iconX + 32, -14);
    row.addChild(title);

    const hint = makeText(src.hint, {
      size: FONT_SIZE.xxs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5], role: 'body',
    });
    hint.position.set(iconX + 32, 14);
    const hintMax = INNER_W - 200;
    try { hint.updateText(true); } catch { /* noop */ }
    if (hint.width > hintMax) hint.scale.set(hintMax / hint.width);
    row.addChild(hint);

    if (src.go) {
      const btn = makeActionButton({
        title: src.actionLabel ?? '前往',
        width: 112,
        height: 48,
        variant: src.go.kind === 'overlay' && src.go.event === 'stamina:open' ? 'success' : 'cream',
        fontSize: FONT_SIZE.sm,
        onTap: () => this._go(src.go!),
      });
      btn.position.set(INNER_W / 2 - 72, 0);
      row.addChild(btn);
    } else {
      const auto = makeText('自动', {
        size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: 0.5, role: 'body',
      });
      auto.position.set(INNER_W / 2 - 72, 0);
      row.addChild(auto);
    }
    return row;
  }

  private _go(go: SourceGo): void {
    this.close();
    if (go.kind === 'overlay') {
      EventBus.emit(go.event, go.arg);
      return;
    }
    if (SceneManager.current?.name === go.scene) return;
    SceneManager.switchTo(go.scene);
  }
}
