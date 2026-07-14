/**
 * 质感行动按钮（详情升星/升级、召唤单抽/十连）。
 *
 * 底板贴图：cream / success / gold —— 一律整图 Sprite 拉满宽高，
 * 保持贴图原有胶囊/椭圆轮廓，避免九宫在矮按钮上切出异形或上下接缝。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_FAMILY_DISPLAY, FONT_SIZE, RADIUS } from './theme';
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
  /** 覆盖标题字号；默认 FONT_SIZE.lg */
  fontSize?: number;
  onTap: () => void;
}

const PLATE_PATH: Record<ActionButtonVariant, string> = {
  cream: UI_IMAGES.btnPlateCream,
  success: UI_IMAGES.btnPlateSuccess,
  gold: UI_IMAGES.btnPlateGold,
};

interface TextStyle {
  title: number;
  subtitle: number;
}

const TEXT_STYLE: Record<ActionButtonVariant, TextStyle> = {
  cream: { title: 0x5c3d24, subtitle: 0x8a6a4a },
  // Q 版金边绿钮：纯白字 + 深绿描边（对齐编队 UI 图）
  success: { title: 0xffffff, subtitle: 0xeef8e4 },
  // 胜利「下一关」橙金钮：白字 + 深橙描边
  gold: { title: 0xffffff, subtitle: 0xfff3d0 },
};

const DISABLED_TEXT: TextStyle = {
  title: COLORS.textDisabled,
  subtitle: COLORS.textDisabled,
};

function makeFallbackPlate(w: number, h: number, variant: ActionButtonVariant, disabled: boolean): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = Math.min(RADIUS.button, h / 2);
  const fill = disabled
    ? COLORS.btnDisabledBg
    : (variant === 'success'
      ? 0x5cbf4a
      : (variant === 'gold' ? 0xe8a23a : 0xf5ead2));
  const border = disabled
    ? COLORS.btnDisabledBorder
    : (variant === 'success' ? 0xe0b44a : 0xc9a45a);
  g.beginFill(0x000000, 0.1);
  g.drawRoundedRect(-w / 2 + 2, -h / 2 + 3, w, h, r);
  g.endFill();
  g.beginFill(fill, 1);
  g.lineStyle(variant === 'success' ? 5 : 4, border, 1);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  if (!disabled) {
    g.beginFill(0xffffff, variant === 'cream' ? 0.22 : 0.18);
    g.drawRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, Math.max(8, h * 0.22), r * 0.45);
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
  // cream / gold / success 结算钮：衬线体对齐 victory/defeat UI
  const displayFont = variant === 'cream' || variant === 'gold' || variant === 'success'
    ? FONT_FAMILY_DISPLAY
    : undefined;
  const title = makeText(opts.title, {
    size: opts.fontSize ?? FONT_SIZE.lg,
    bold: true,
    anchor: 0.5,
    fontFamily: displayFont,
    ...(variant === 'success'
      ? { strokeColor: 0x2f6a28, strokeWidth: 4 }
      : variant === 'gold'
        ? { strokeColor: 0xa85a18, strokeWidth: 4 }
        : {}),
  });
  const subtitle = makeText(opts.subtitle ?? '', {
    size: FONT_SIZE.sm,
    bold: true,
    anchor: 0.5,
    fontFamily: displayFont,
  });
  btn.addChild(plateHost, title, subtitle);

  let enabled = opts.enabled ?? true;

  const paint = (): void => {
    plateHost.removeChildren().forEach((c) => c.destroy());
    const tex = TextureCache.get(PLATE_PATH[variant]);
    if (tex) {
      // 整图拉伸：cream/gold/success 均为胶囊底板，保持椭圆外形一致
      const sp = new PIXI.Sprite(tex);
      sp.anchor.set(0.5);
      sp.width = width;
      sp.height = height;
      if (!enabled) sp.alpha = 0.55;
      plateHost.addChild(sp);
    } else {
      const fb = makeFallbackPlate(width, height, variant, !enabled);
      plateHost.addChild(fb);
    }

    const style = enabled ? TEXT_STYLE[variant] : DISABLED_TEXT;
    title.style.fill = style.title;
    if (enabled && (variant === 'success' || variant === 'gold')) {
      title.style.stroke = variant === 'success' ? 0x2f6a28 : 0xa85a18;
      title.style.strokeThickness = 4;
    } else {
      title.style.strokeThickness = 0;
    }
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
