/**
 * 抖音侧边栏复访引导弹窗（平台必接）
 *
 * 引导用户 tt.navigateToScene({ scene: 'sidebar' })，从侧边栏返回后可领每日奖励。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { SidebarService } from '@/core/SidebarService';
import { PlayerData } from '@/game/PlayerData';
import { ECONOMY } from '@/balance/economy';
import { Platform } from '@/core/PlatformService';
import { COLORS, FONT_SIZE, makeButton, makePanel, makeText } from '@/ui';

export class SidebarPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Text;
  private _actionSlot!: PIXI.Container;
  private _isOpen = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9500;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('sidebar:open', () => this.open());
    EventBus.on('sidebar:close', () => this.close());
  }

  open(): void {
    // 开发者工具可预览 UI；真机仅抖音侧边栏场景
    if ((!Platform.isDouyin && !Platform.isDevtools) || this._isOpen) return;
    this._isOpen = true;
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
    this._dim.beginFill(0x000000, 0.62);
    this._dim.drawRect(0, 0, w, h);
    this._dim.endFill();
    this._dim.eventMode = 'static';
    this._dim.on('pointertap', () => this.close());
    this.addChild(this._dim);

    this._content = new PIXI.Container();
    this._content.position.set(w / 2, h / 2 - 24);
    this._content.eventMode = 'static';
    this._content.on('pointertap', (e) => e.stopPropagation());
    this.addChild(this._content);

    const panelW = Math.min(w * 0.78, 560);
    const panelH = 340;
    const bodyPadX = 40;
    this._content.addChild(makePanel({
      width: panelW,
      height: panelH,
      bg: COLORS.panelBg,
      border: COLORS.panelBorder,
      centered: true,
    }));

    // 浅底弹窗：深墨标题，去掉金字+紫描边
    const title = makeText('侧边栏复访奖励', {
      size: FONT_SIZE.lg,
      fill: COLORS.textMain,
      bold: true,
      anchor: 0.5,
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

    const closeBtn = makeText('✕', {
      size: FONT_SIZE.lg,
      fill: COLORS.textSub,
      anchor: 0.5,
    });
    closeBtn.position.set(panelW / 2 - 28, -panelH / 2 + 28);
    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.on('pointertap', () => this.close());
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

    const fromSidebar = SidebarService.isFromSidebar();
    const claimed = PlayerData.sidebarRewardClaimedToday;
    const canClaim = fromSidebar && !claimed;
    const reward = ECONOMY.sidebar.lingyuReward;

    if (canClaim) {
      this._body.text = `你从侧边栏进入了游戏！\n\n奖励：灵玉 +${reward}`;
      const btn = makeButton({
        label: '领取奖励',
        width: 240,
        height: 52,
        variant: 'success',
        onTap: () => {
          if (PlayerData.claimSidebarReward()) {
            Platform.showToast(`灵玉 +${reward}`, 'success');
            this.close();
          }
        },
      });
      this._actionSlot.addChild(btn);
      return;
    }

    if (claimed) {
      this._body.text = '今日奖励已领取，明天再来吧~\n\n每天从抖音首页侧边栏进入游戏，\n即可领取灵玉奖励。';
      return;
    }

    this._body.text = [
      '1. 点击下方按钮前往侧边栏',
      '2. 在侧边栏找到本游戏并进入',
      '3. 返回后即可领取灵玉奖励',
    ].join('\n');
    const goBtn = makeButton({
      label: '去首页侧边栏',
      width: 260,
      height: 52,
      variant: 'primary',
      onTap: () => {
        SidebarService.navigateToSidebar();
        this.close();
      },
    });
    this._actionSlot.addChild(goBtn);
  }
}
