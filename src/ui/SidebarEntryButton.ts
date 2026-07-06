/**
 * 首页右下角「侧边栏」入口（抖音专属，平台必接）
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { SidebarService } from '@/core/SidebarService';
import { PlayerData } from '@/game/PlayerData';
import { COLORS, FONT_SIZE, makeText } from '@/ui';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { pressFeedback } from '@/ui/motion';

export class SidebarEntryButton extends PIXI.Container {
  constructor(x: number, y: number) {
    super();
    this.position.set(x, y);
    this._build();
  }

  private _build(): void {
    const iconSize = 52;
    const labelSize = FONT_SIZE.xs;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x141226, 0.78);
    bg.lineStyle(2, 0xc8b478, 0.55);
    bg.drawRoundedRect(-iconSize / 2, -iconSize / 2 - 6, iconSize, iconSize, 10);
    bg.endFill();
    this.addChild(bg);

    const fromSidebar = SidebarService.isFromSidebar();
    const hasReward = fromSidebar && !PlayerData.sidebarRewardClaimedToday;

    const icon = makeText(hasReward ? '🎁' : '📌', {
      size: 24,
      anchor: 0.5,
    });
    icon.position.set(0, -6);
    this.addChild(icon);

    if (hasReward) {
      const dot = new PIXI.Graphics();
      dot.beginFill(0xff3333);
      dot.drawCircle(iconSize / 2 - 6, -iconSize / 2 + 2, 5);
      dot.endFill();
      this.addChild(dot);
    }

    const label = makeText('侧边栏', {
      size: labelSize,
      fill: COLORS.textTitle,
      bold: true,
      anchor: 0.5,
      strokeColor: 0x140a28,
      strokeWidth: 3,
    });
    label.position.set(0, iconSize / 2 + 2);
    this.addChild(label);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new PIXI.Rectangle(-iconSize / 2 - 8, -iconSize / 2 - 10, iconSize + 16, iconSize + 34);
    bindPointerTap(this, () => EventBus.emit('sidebar:open'));
    pressFeedback(this);
  }
}
