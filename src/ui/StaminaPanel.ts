/**
 * 体力不足弹窗（全局 Overlay，EventBus 驱动）
 *
 * 走全局面板而非各场景自绘：拦截点有编队页、结算重试、下一关三处，
 * 逐个场景实现一遍会立刻走形。任何地方 `EventBus.emit('stamina:open', cost)` 即可。
 *
 * 面板同时是 IAA 位：广告回体是本作最主要的激励视频入口之一（日 3 次）。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { PlayerData } from '@/game/PlayerData';
import { formatCountdown } from '@/game/staminaService';
import { ECONOMY } from '@/balance/economy';
import { watchAd } from '@/game/adGate';
import { COLORS, FONT_SIZE, makeButton, makeCloseButton, makePanel, makeText } from '@/ui';

export class StaminaPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Text;
  private _actionSlot!: PIXI.Container;
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
    if (this._isOpen) return;
    this._isOpen = true;
    this._cost = cost;
    this.visible = true;
    this._refresh();
    this.alpha = 0;
    TweenManager.to({ target: this, props: { alpha: 1 }, duration: 0.2, ease: Ease.easeOutQuad });
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    TweenManager.to({
      target: this,
      props: { alpha: 0 },
      duration: 0.15,
      ease: Ease.easeInQuad,
      onComplete: () => { this.visible = false; },
    });
  }

  private _buildShell(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;

    this._dim = new PIXI.Graphics();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.position.set(w / 2, h / 2 - 24);
    this._content.eventMode = 'static';
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    const panelW = Math.min(w * 0.78, 560);
    const panelH = 360;
    const bodyPadX = 40;
    this._content.addChild(makePanel({
      width: panelW, height: panelH,
      bg: COLORS.panelBg, border: COLORS.panelBorder, centered: true,
    }));

    const title = makeText('体力不足', {
      size: FONT_SIZE.lg, fill: COLORS.textMain, bold: true, anchor: 0.5,
    });
    title.position.set(0, -panelH / 2 + 40);
    this._content.addChild(title);

    this._body = makeText('', {
      size: FONT_SIZE.sm,
      fill: COLORS.textMain,
      anchor: [0, 0],
      wordWrapWidth: panelW - bodyPadX * 2,
      align: 'left',
    });
    this._body.style.lineHeight = Math.round(FONT_SIZE.sm * 1.55);
    this._body.position.set(-panelW / 2 + bodyPadX, -panelH / 2 + 84);
    this._content.addChild(this._body);

    this._actionSlot = new PIXI.Container();
    this._actionSlot.position.set(0, panelH / 2 - 62);
    this._content.addChild(this._actionSlot);

    const closeBtn = makeCloseButton({ onTap: () => this.close() });
    closeBtn.position.set(panelW / 2 - 28, -panelH / 2 + 28);
    this._content.addChild(closeBtn);
  }

  private _refresh(): void {
    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._dim.clear();
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._actionSlot.removeChildren();

    const cur = PlayerData.stamina;
    const max = PlayerData.staminaMax;
    const adLeft = PlayerData.staminaAdLeft;
    const s = ECONOMY.stamina;
    const lines = [
      `当前体力 ${cur}/${max}${this._cost > 0 ? `，本关需要 ${this._cost}` : ''}`,
      `每 ${Math.round(s.regenSeconds / 60)} 分钟恢复 1 点，下一点还需 ${formatCountdown(PlayerData.staminaNextPointMs)}`,
      cur < max ? `完全恢复约 ${formatCountdown(PlayerData.staminaFullMs)}` : '已满',
    ];
    this._body.text = lines.join('\n');

    if (adLeft <= 0) {
      this._body.text += '\n\n今日广告回体次数已用完，等待自然恢复或明天再来。';
      return;
    }

    const btn = makeButton({
      label: `看广告 +${s.adRefill} 体力（今日剩 ${adLeft} 次）`,
      width: 380,
      height: 56,
      variant: 'success',
      onTap: () => { void this._watchAd(); },
    });
    this._actionSlot.addChild(btn);
  }

  private async _watchAd(): Promise<void> {
    if (this._busy) return;
    this._busy = true;
    try {
      if (!await watchAd('stamina_refill', { cost: this._cost })) {
        this._refresh();
        return;
      }
      PlayerData.claimStaminaAd(false);
      Platform.showToast(`体力 +${ECONOMY.stamina.adRefill}`, 'success');
      EventBus.emit('home:refresh');
      if (this._cost > 0 && PlayerData.hasStamina(this._cost)) {
        this.close();
        return;
      }
      this._refresh();
    } finally {
      this._busy = false;
    }
  }
}
