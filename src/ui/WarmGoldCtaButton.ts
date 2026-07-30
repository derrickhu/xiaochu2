/**
 * 暖金杏渐变匾钮（通天塔「挑战第 N 层」等）
 * 底板：奶油中心 → 杏橙两端，薄金棕双边；深棕墨字。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS, FONT_SIZE } from './theme';
import { makeTitleText } from './text';
import { pressFeedback } from './motion';
import { bindPointerTap } from '@/utils/bindPointerTap';

export interface WarmGoldCtaButtonOpts {
  title: string;
  onTap: () => void;
  width?: number;
  height?: number;
  enabled?: boolean;
  /** 覆盖标题色；默认深棕墨 #4B3212 */
  fill?: number;
  fontSize?: number;
}

/** 标准显示尺寸（对齐通天塔 UI 图：略窄于里程碑、高度更扁） */
export const WARM_GOLD_CTA_SIZE = { width: 420, height: 78 } as const;

const TEXT_FILL = 0x4b3212;

function drawFallback(w: number, h: number, alpha: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  const r = Math.min(40, h / 2);
  g.beginFill(0xfdcb82, alpha);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  g.endFill();
  g.beginFill(0xfff5d7, alpha * 0.95);
  g.drawRoundedRect(-w / 2 + 8, -h / 2 + 6, w - 16, h - 12, r * 0.85);
  g.endFill();
  g.lineStyle(3, 0xb08e66, alpha);
  g.drawRoundedRect(-w / 2, -h / 2, w, h, r);
  return g;
}

export function makeWarmGoldCtaButton(opts: WarmGoldCtaButtonOpts): PIXI.Container {
  const width = opts.width ?? WARM_GOLD_CTA_SIZE.width;
  const height = opts.height ?? WARM_GOLD_CTA_SIZE.height;
  const enabled = opts.enabled ?? true;

  const btn = new PIXI.Container();
  const plate = new PIXI.Container();
  btn.addChild(plate);

  const apply = (tex: PIXI.Texture): void => {
    plate.removeChildren().forEach((c) => c.destroy());
    const sp = new PIXI.Sprite(tex);
    sp.anchor.set(0.5);
    sp.width = width;
    sp.height = height;
    sp.alpha = enabled ? 1 : 0.55;
    plate.addChild(sp);
  };

  const path = UI_IMAGES.towerBtnCta;
  const cached = TextureCache.get(path);
  if (cached) {
    apply(cached);
  } else {
    plate.addChild(drawFallback(width, height, enabled ? 1 : 0.55));
    void TextureCache.load(path).then((tex) => {
      if (!plate.destroyed) apply(tex);
    }).catch(() => null);
  }

  const title = makeTitleText(opts.title, {
    size: opts.fontSize ?? FONT_SIZE.md,
    fill: enabled ? (opts.fill ?? TEXT_FILL) : COLORS.textDisabled,
    anchor: 0.5,
  });
  try { title.updateText(true); } catch { /* noop */ }
  const maxTextW = width * 0.68;
  if (title.width > maxTextW) title.scale.set(maxTextW / title.width);
  btn.addChild(title);

  btn.eventMode = enabled ? 'static' : 'none';
  btn.cursor = enabled ? 'pointer' : 'default';
  btn.hitArea = new PIXI.Rectangle(-width / 2, -height / 2, width, height);
  btn.interactiveChildren = false;
  if (enabled) {
    bindPointerTap(btn, opts.onTap);
    pressFeedback(btn);
  }
  return btn;
}
