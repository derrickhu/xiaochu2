/**
 * 顶栏：左返回按钮 + 居中名匾标题 + 可选副信息。
 * Team / Codex / PetDetail 共用；标题匾走全局 makeNamePlaque。
 */
import * as PIXI from 'pixi.js';
import { COLORS, FONT_SIZE } from './theme';
import { makeBackButton } from './BackButton';
import { makeText } from './text';
import { makeChapterTitlePlaque } from './NamePlaque';

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
  /**
   * 名匾固定宽度；不传则随标题自适应。
   * 页面级标题（如「灵宠」）可传 420~480。
   */
  plaqueWidth?: number;
}

export function makeTopBar(opts: TopBarOpts): PIXI.Container {
  const bar = new PIXI.Container();

  const back = makeBackButton({ onTap: opts.onBack });
  back.position.set(80, opts.centerY);
  bar.addChild(back);

  // 与主屏关卡匾同一块，不再用奶油尖角短匾
  const plaque = makeChapterTitlePlaque({
    text: opts.title,
    screenWidth: opts.width,
  });
  plaque.position.set(opts.width / 2, opts.centerY);
  bar.addChild(plaque);

  if (opts.subtitle) {
    const sub = makeText(opts.subtitle, {
      size: FONT_SIZE.xs,
      fill: COLORS.textSub,
      anchor: 0.5,
    });
    sub.position.set(opts.width / 2, opts.centerY + 34);
    bar.addChild(sub);
  }

  return bar;
}
