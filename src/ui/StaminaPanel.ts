/**
 * 体力不足弹窗（全局 Overlay，EventBus 驱动）
 *
 * 走全局面板而非各场景自绘：拦截点有编队页、结算重试、下一关三处。
 * 视觉对齐签到/日常：顶匾 + 奶油金边板 + success 绿钮（makeActionButton）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { PlayerData } from '@/game/PlayerData';
import { formatCountdown } from '@/game/staminaService';
import { ECONOMY } from '@/balance/economy';
import { watchAd } from '@/game/adGate';
import { UI_IMAGES } from '@/config/Assets';
import { ensureAssets } from '@/config/Subpackages';
import {
  COLORS, FONT_SIZE,
  makeActionButton, makeCloseButton, makePanel, makeText,
  makeModalTitlePlaque, makeProgressBar,
} from '@/ui';

const PANEL_W = 560;
const PANEL_H = 520;

export class StaminaPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Container;
  private _isOpen = false;
  private _cost = 0;
  private _busy = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9600;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('stamina:open', (cost?: number) => this.open(typeof cost === 'number' ? cost : 0));
    EventBus.on('stamina:close', () => this.close());
  }

  open(cost = 0): void {
    // 关闭淡出未结束时再 open：旧 tween 的 onComplete 会把 visible 关掉，
    // 且 _isOpen 已为 true，后续点击直接 return（主页连点体力：前两次有、后面没）
    if (this._isOpen && this.visible) return;
    TweenManager.cancelTarget(this);
    this._isOpen = true;
    this._cost = cost;
    this._busy = false;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
    void this._hydrateAssets();
  }

  private async _hydrateAssets(): Promise<void> {
    await ensureAssets([
      UI_IMAGES.iconStamina,
      UI_IMAGES.modalTitlePlaque,
      UI_IMAGES.btnPlateSuccess,
      UI_IMAGES.btnPlateCream,
      UI_IMAGES.progressFrame,
    ]).catch((e) => console.warn('[Stamina] 资源预热失败', e));
    if (!this._isOpen) return;
    this._refresh();
  }

  close(): void {
    if (!this._isOpen || this._busy) return;
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

    this._content.addChild(makePanel({
      width: PANEL_W, height: PANEL_H,
      bg: COLORS.panelBg, border: COLORS.panelBorder,
      borderWidth: 3, radius: 28, centered: true,
    }));

    const plaque = makeModalTitlePlaque({ text: '体力不足', panelWidth: PANEL_W });
    plaque.position.set(0, -PANEL_H / 2 + 18);
    this._content.addChild(plaque);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(PANEL_W / 2 - 36, -PANEL_H / 2 + 36);
    this._content.addChild(closeBtn);

    this._body = new PIXI.Container();
    this._content.addChild(this._body);
  }

  private _refresh(): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));

    const cur = PlayerData.stamina;
    const max = PlayerData.staminaMax;
    const adLeft = PlayerData.staminaAdLeft;
    const s = ECONOMY.stamina;
    const need = this._cost;
    const short = Math.max(0, need - cur);
    const ratio = max > 0 ? Math.min(1, cur / max) : 0;

    // ── 仙桃图标 + 当前/上限 ──
    const heroY = -PANEL_H / 2 + 118;
    const iconSize = 72;
    const iconTex = TextureCache.get(UI_IMAGES.iconStamina);
    if (iconTex) {
      const icon = new PIXI.Sprite(iconTex);
      icon.anchor.set(0.5);
      const sc = iconSize / Math.max(iconTex.width, iconTex.height);
      icon.scale.set(sc);
      icon.position.set(-88, heroY);
      this._body.addChild(icon);
    } else {
      const ph = new PIXI.Graphics();
      ph.beginFill(0xffb07a, 0.9);
      ph.drawCircle(0, 0, iconSize / 2);
      ph.endFill();
      ph.position.set(-88, heroY);
      this._body.addChild(ph);
    }

    const stock = makeText(`${cur}`, {
      size: 44, fill: COLORS.textMain, bold: true, anchor: [0, 0.5],
      role: 'title',
    });
    stock.position.set(-40, heroY - 12);
    this._body.addChild(stock);

    const stockMax = makeText(` / ${max}`, {
      size: FONT_SIZE.md, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
    });
    stockMax.position.set(-40 + stock.width + 4, heroY - 8);
    this._body.addChild(stockMax);

    if (need > 0) {
      const needT = makeText(short > 0 ? `本关还需 ${short} 点` : '体力已够开战', {
        size: FONT_SIZE.xs,
        fill: short > 0 ? 0xc45a2a : 0x3d9a5c,
        bold: true, anchor: [0, 0.5],
      });
      needT.position.set(-40, heroY + 22);
      this._body.addChild(needT);
    }

    // ── 进度条 ──
    // 与下方信息卡必须留空：叠在一起时只会露出金框顶边+绿条，像「多了一层怪底板」
    const barW = PANEL_W - 96;
    const barH = 36;
    const barY = heroY + 52;
    const bar = makeProgressBar({
      width: barW,
      height: barH,
      ratio,
      fill: short > 0 ? 0xe8a33d : 0x5cbf4a,
      fillFull: 0x5cbf4a,
      frame: true,
    });
    bar.position.set(-barW / 2, barY);
    this._body.addChild(bar);

    // ── 恢复信息卡 ──
    const infoH = 110;
    const infoY = barY + barH + 18 + infoH / 2;
    const info = makePanel({
      width: PANEL_W - 72, height: infoH, radius: 16, centered: true,
      bg: 0xfff8ec, border: COLORS.panelBorderSoft, borderWidth: 2,
    });
    info.position.set(0, infoY);
    this._body.addChild(info);

    const mins = Math.round(s.regenSeconds / 60);
    const rows: { label: string; value: string; valueFill?: number }[] = [
      {
        label: '恢复节奏',
        value: `每 ${mins} 分钟 +1`,
      },
      {
        label: '下一点',
        value: cur >= max ? '已满' : formatCountdown(PlayerData.staminaNextPointMs),
        valueFill: cur >= max ? 0x3d9a5c : COLORS.accentDeep,
      },
      {
        label: '全部回满',
        value: cur >= max ? '—' : `约 ${formatCountdown(PlayerData.staminaFullMs)}`,
      },
    ];
    rows.forEach((row, i) => {
      const y = infoY - infoH / 2 + 22 + i * 30;
      const lab = makeText(row.label, {
        size: FONT_SIZE.xs, fill: COLORS.textSub, bold: true, anchor: [0, 0.5],
      });
      lab.position.set(-(PANEL_W - 72) / 2 + 28, y);
      this._body.addChild(lab);
      const val = makeText(row.value, {
        size: FONT_SIZE.xs,
        fill: row.valueFill ?? COLORS.textMain,
        bold: true, anchor: [1, 0.5],
      });
      val.position.set((PANEL_W - 72) / 2 - 28, y);
      this._body.addChild(val);
    });

    // ── CTA ──
    const ctaY = PANEL_H / 2 - 64;
    if (adLeft <= 0) {
      const done = makeActionButton({
        title: '今日次数已用完',
        subtitle: '等待恢复或明天再来',
        width: 400,
        height: 78,
        variant: 'cream',
        enabled: false,
        fontSize: FONT_SIZE.md,
        onTap: () => undefined,
      });
      done.position.set(0, ctaY);
      this._body.addChild(done);
      return;
    }

    const btn = makeActionButton({
      title: `看广告 +${s.adRefill} 体力`,
      subtitle: `今日剩 ${adLeft} 次`,
      width: 400,
      height: 84,
      variant: 'success',
      enabled: !this._busy,
      fontSize: FONT_SIZE.md,
      onTap: () => { void this._watchAd(); },
    });
    btn.position.set(0, ctaY);
    this._body.addChild(btn);
  }

  private async _watchAd(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    this._refresh();
    try {
      if (!await watchAd('stamina_refill', { cost: this._cost })) {
        this._refresh();
        return;
      }
      PlayerData.claimStaminaAd(false);
      Platform.showToast(`体力 +${ECONOMY.stamina.adRefill}`, 'success');
      EventBus.emit('home:refresh');
      if (this._cost > 0 && PlayerData.hasStamina(this._cost)) {
        this._busy = false;
        this.close();
        return;
      }
      this._refresh();
    } finally {
      this._busy = false;
      if (this._isOpen) this._refresh();
    }
  }
}
