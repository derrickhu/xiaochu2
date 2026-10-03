/**
 * 进度条（轨道 + 填充，圆角）。可选装饰外框（复用战斗血条框）。
 * 返回可 setRatio 更新的句柄。
 */
import * as PIXI from 'pixi.js';
import { TextureCache } from '@/core/TextureCache';
import { UI_IMAGES } from '@/config/Assets';
import { COLORS } from './theme';

export interface ProgressBarOpts {
  width: number;
  height: number;
  ratio: number;
  /** 填充色，默认强调金；满进度可由 setRatio 自动转绿 */
  fill?: number;
  track?: number;
  /** 满进度（>=1）时的填充色 */
  fillFull?: number;
  /**
   * 装饰外框：true = UI_IMAGES.progressFrame；
   * 传路径可覆盖。有框时 height 建议 ≥ 32。
   */
  frame?: boolean | string;
}

export interface ProgressBarHandle extends PIXI.Container {
  setRatio(ratio: number): void;
}

export function makeProgressBar(opts: ProgressBarOpts): ProgressBarHandle {
  const { width, height } = opts;
  const fillColor = opts.fill ?? COLORS.trackFill;
  const fillFull = opts.fillFull ?? COLORS.trackFillFull;
  const trackColor = opts.track ?? COLORS.trackBg;

  const bar = new PIXI.Container() as ProgressBarHandle;
  const track = new PIXI.Graphics();
  const fill = new PIXI.Graphics();
  bar.addChild(track, fill);

  const framePath = opts.frame === true
    ? UI_IMAGES.progressFrame
    : (typeof opts.frame === 'string' ? opts.frame : null);
  let insetX = 0;
  let insetY = 0;
  let innerW = width;
  let innerH = height;
  let ratio = opts.ratio;
  let framed = false;

  const paintTrack = (): void => {
    track.clear();
    const r = innerH / 2;
    track.beginFill(trackColor);
    track.drawRoundedRect(insetX, insetY, innerW, innerH, r);
    track.endFill();
  };

  const paintFill = (): void => {
    const t = Math.max(0, Math.min(1, ratio));
    fill.clear();
    const r = innerH / 2;
    const fw = Math.max(innerH, innerW * t);
    fill.beginFill(t >= 1 ? fillFull : fillColor);
    fill.drawRoundedRect(insetX, insetY, fw, innerH, r);
    fill.endFill();
  };

  const applyFrame = (tex: PIXI.Texture): void => {
    if (framed || bar.destroyed || !tex.width) return;
    framed = true;
    const frame = new PIXI.Sprite(tex);
    frame.width = width;
    frame.height = height;
    bar.addChildAt(frame, 0);
    // 与战斗血条框内槽对齐：左右约 14.5%，上下约 12%
    insetX = Math.max(36, width * 0.145);
    insetY = Math.max(5, height * 0.12);
    innerW = Math.max(8, width - insetX * 2);
    innerH = Math.max(6, height - insetY * 2);
    paintTrack();
    paintFill();
  };

  if (framePath) {
    const cached = TextureCache.get(framePath);
    if (cached?.width) {
      applyFrame(cached);
    } else {
      const unsub = TextureCache.onTextureLoaded((loaded) => {
        if (loaded !== framePath) return;
        unsub();
        const tex = TextureCache.get(framePath);
        if (tex) applyFrame(tex);
      });
      bar.once('destroyed', unsub);
      void TextureCache.load(framePath).catch(() => null);
    }
  }

  paintTrack();
  bar.setRatio = (next: number): void => {
    ratio = next;
    paintFill();
  };
  bar.setRatio(opts.ratio);
  return bar;
}
