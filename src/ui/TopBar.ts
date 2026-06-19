/**
 * 顶栏：左返回按钮 + 居中标题 + 可选副信息。
 * Team / Codex / PetDetail 共用，消除各场景重复的顶栏三联。
 */
import * as PIXI from 'pixi.js';
import { COLORS, FONT_SIZE } from './theme';
import { makeButton } from './Button';
import { makeText } from './text';

export interface TopBarOpts {
  /** 居中标题 */
  title: string;
  /** 标题下方副信息（可空） */
  subtitle?: string;
  /** 屏幕宽（用于居中） */
  width: number;
  /** 顶栏中心 Y */
  centerY: number;
  onBack: () => void;
}

export function makeTopBar(opts: TopBarOpts): PIXI.Container {
  const bar = new PIXI.Container();

  const back = makeButton({
    label: '返回',
    width: 120,
    height: 54,
    variant: 'ghost',
    onTap: opts.onBack,
  });
  back.position.set(80, opts.centerY);
  bar.addChild(back);

  const title = makeText(opts.title, {
    size: FONT_SIZE.lg,
    fill: COLORS.textTitle,
    bold: true,
    anchor: 0.5,
  });
  title.position.set(opts.width / 2, opts.centerY);
  bar.addChild(title);

  if (opts.subtitle) {
    const sub = makeText(opts.subtitle, {
      size: FONT_SIZE.xs,
      fill: COLORS.textSub,
      anchor: 0.5,
    });
    sub.position.set(opts.width / 2, opts.centerY + 30);
    bar.addChild(sub);
  }

  return bar;
}
