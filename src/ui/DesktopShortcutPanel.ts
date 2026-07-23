/**
 * 抖音「添加到桌面」引导弹窗（广告投放小游戏必接）
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { TweenManager, Ease } from '@/core/TweenManager';
import { EventBus } from '@/core/EventBus';
import { DesktopShortcutService } from '@/core/DesktopShortcutService';
import { Platform } from '@/core/PlatformService';
import { COLORS, FONT_SIZE, makeButton, makePanel, makeText } from '@/ui';

export class DesktopShortcutPanel extends PIXI.Container {
  private _dim!: PIXI.Graphics;
  private _content!: PIXI.Container;
  private _body!: PIXI.Text;
  private _actionSlot!: PIXI.Container;
  private _isOpen = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9490;
    this.eventMode = 'static';
    this._buildShell();
    EventBus.on('desktop-shortcut:open', () => this.open());
    EventBus.on('desktop-shortcut:close', () => this.close());
  }

  open(): void {
    // 开发者工具可预览 UI；真机仍要求宿主支持 addShortcut
    if ((!DesktopShortcutService.isAvailable && !Platform.isDevtools) || this._isOpen) return;
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
    const panelH = 300;
    const bodyPadX = 40;
    this._content.addChild(makePanel({
      width: panelW,
      height: panelH,
      bg: COLORS.panelBg,
      border: COLORS.panelBorder,
      centered: true,
    }));

    // 浅底弹窗：深墨标题，去掉金字+紫描边
    const title = makeText('添加到桌面', {
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

    const st = DesktopShortcutService.status;
    if (st?.exist && !st.needUpdate) {
      this._body.text = '桌面快捷方式已添加。\n\n下次可直接从手机桌面图标进入游戏。';
      return;
    }

    this._body.text = DesktopShortcutService.isAvailable
      ? '将「灵宠消消塔」添加到手机桌面，\n下次可从桌面图标快速进入游戏。'
      : '将「灵宠消消塔」添加到手机桌面，\n下次可从桌面图标快速进入游戏。\n\n（当前为预览环境，真机抖音可添加）';
    const btn = makeButton({
      label: DesktopShortcutService.isAvailable ? '立即添加' : '预览·知道了',
      width: 260,
      height: 52,
      variant: 'primary',
      syncGesture: true,
      onTap: () => {
        if (!DesktopShortcutService.isAvailable) {
          this.close();
          return;
        }
        DesktopShortcutService.addToDesktop({
          onSuccess: () => {
            Platform.showToast('已添加到桌面', 'success');
            this._refresh();
          },
          onFail: (msg) => {
            if (msg.includes('user cancel')) {
              Platform.showToast('已取消', 'none');
              return;
            }
            Platform.showToast('添加失败，请稍后重试', 'none');
            console.warn('[DesktopShortcutPanel]', msg);
          },
        });
      },
    });
    this._actionSlot.addChild(btn);
  }
}
