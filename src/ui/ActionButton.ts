/**
 * 质感行动按钮（详情升星/升级、召唤单抽/十连）。
 *
 * 底板贴图：cream / success / gold（平滑渐变 + 干净透明边，九宫拉伸）。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE, RADIUS } from './theme';
import { makeText } from './text';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

export type ActionButtonVariant = 'cream' | 'success' | 'gold';

export interface ActionButtonOpts {
  title: string;
  subtitle?: string;
  width: number;
  height: number;
  variant?: ActionButtonVariant;
  enabled?: boolean;
  onTap: () => void;
}

const PLATE_PATH: Record<ActionButtonVariant, string> = {
  cream: UI_IMAGES.btnPlateCream,
  success: UI_IMAGES.btnPlateSuccess,
  gold: UI_IMAGES.btnPlateGold,
};

/** 九宫左右帽 / 上下帽：奶油/翠绿/金橙同套金边云纹底板 */
const SLICE: Record<ActionButtonVariant, { lr: number; tb: number }> = {
  cream: { lr: 150, tb: 95 },
  gold: { lr: 160, tb: 90 },
  success: { lr: 150, tb: 95 },
};

interface TextStyle {
  title: number;
  subtitle: number;
}

const TEXT_STYLE: Record<ActionButtonVariant, TextStyle> = {
  cream: { title: 0x5c3d24, subtitle: 0x8a6a4a },
  success: { title: COLORS.btnText, subtitle: 0xeef8e4 },
  gold: { title: COLORS.btnText, subtitle: 0xfff3d0 },
};

const DISABLED_TEXT: TextStyle = {
  title: COLORS.textDisabled,
  subtitle: COLORS.textDisabled,
};

function makeFallbackPlate(w: number, h: number, variant: ActionButtonVariant, disabled: boolean): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = Math.min(RADIUS.button, h / 2);
  // 单色实底 + 金边，避免程序绘制上下两截色差
  const fill = disabled
    ? COLORS.btnDisabledBg
    : (variant === 'success'
      ? 0x6db85a
      : (variant === 'gold' ? 0xe8a23a : 0xf5ead2));
  const border = disabled
    ? COLORS.btnDisabledBorder
    : 0xc9a45a;
  g.beginFill(0x000000, 0.1);
  g.drawRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);
  g.endFill();
  g.beginFill(fill, 1);
  g.lineStyle(4, border, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  // 顶部细高光（单条，不造两截色块）
  if (!disabled) {
    g.beginFill(0xffffff, variant === 'cream' ? 0.22 : 0.16);
    g.drawRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, Math.max(8, h * 0.18), r * 0.45);
    g.endFill();
  }
  return g;
}

export interface ActionButtonHandle extends PIXI.Container {
  setEnabled(enabled: boolean): void;
  setLabels(title: string, subtitle?: string): void;
}

export function makeActionButton(opts: ActionButtonOpts): ActionButtonHandle {
  const { width, height, variant = 'success', onTap } = opts;
  const btn = new PIXI.Container() as ActionButtonHandle;
  const plateHost = new PIXI.Container();
  const title = makeText(opts.title, {
    size: FONT_SIZE.lg,
    bold: true,
    anchor: 0.5,
  });
  const subtitle = makeText(opts.subtitle ?? '', {
    size: FONT_SIZE.sm,
    bold: true,
    anchor: 0.5,
  });
  btn.addChild(plateHost, title, subtitle);

  let enabled = opts.enabled ?? true;

  const paint = (): void => {
    plateHost.removeChildren().forEach((c) => c.destroy());
    const tex = TextureCache.get(PLATE_PATH[variant]);
    if (tex) {
      const { lr, tb } = SLICE[variant];
      const plane = new PIXI.NineSlicePlane(tex, lr, tb, lr, tb);
      plane.width = width;
      plane.height = height;
      plane.pivot.set(width / 2, height / 2);
      if (!enabled) plane.alpha = 0.55;
      plateHost.addChild(plane);
    } else {
      const fb = makeFallbackPlate(width, height, variant, !enabled);
      plateHost.addChild(fb);
    }

    const style = enabled ? TEXT_STYLE[variant] : DISABLED_TEXT;
    title.style.fill = style.title;
    subtitle.style.fill = style.subtitle;
    const hasSub = !!subtitle.text;
    title.position.set(0, hasSub ? -16 : 0);
    subtitle.position.set(0, 20);
    subtitle.visible = hasSub;
  };

  btn.setEnabled = (v: boolean): void => {
    enabled = v;
    btn.eventMode = v ? 'static' : 'none';
    btn.cursor = v ? 'pointer' : 'default';
    paint();
  };

  btn.setLabels = (t: string, sub?: string): void => {
    title.text = t;
    subtitle.text = sub ?? '';
    paint();
  };

  bindPointerTap(btn, onTap, { guard: () => enabled });
  btn.hitArea = new PIXI.Rectangle(-width / 2, -height / 2, width, height);
  btn.interactiveChildren = false;
  pressFeedback(btn);
  btn.setEnabled(enabled);
  paint();
  return btn;
}
