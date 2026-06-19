/**
 * 进度条（轨道 + 填充，圆角）。返回可 setRatio 更新的句柄。
 */
import * as PIXI from 'pixi.js';
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

  track.beginFill(trackColor);
  track.drawRoundedRect(0, 0, width, height, height / 2);
  track.endFill();

  bar.setRatio = (ratio: number): void => {
    const r = Math.max(0, Math.min(1, ratio));
    fill.clear();
    fill.beginFill(r >= 1 ? fillFull : fillColor);
    fill.drawRoundedRect(0, 0, Math.max(height, width * r), height, height / 2);
    fill.endFill();
  };
  bar.setRatio(opts.ratio);
  return bar;
}
