/**
 * 首页章节通关奖励卷轴：尺寸与避让（纯数据，零渲染）
 *
 * 仙庭在 title_screen 右上。卷轴必须停在左中，右缘不得越过亭子。
 */
export const CHAPTER_REWARD_SCROLL = {
  /** 比 400 稍宽，给经验和灵宠头像留缝 */
  width: 448,
  /** 加高，宣纸更高才能把奖励做显眼 */
  height: 228,
  artW: 800,
  artH: 363,
  gapUnderPlaque: 6,
  /** 章匾半高（makeChapterTitlePlaque height 72） */
  plaqueHalf: 36,
  /** 躲开左栏（x≈48，钮 72 → 右缘 ~84） */
  leftMin: 108,
  /**
   * 仙庭左缘。卷轴右缘必须 ≤ screenW × 此值。
   */
  pavilionSafeRightRatio: 0.752,
  chromePad: 8,
  /**
   * 卷轴贴图里宣纸的相对范围。贴图下半截是空的，
   * 内容必须落在这块纸面上，否则会看起来「漂在匾外」。
   */
  paper: { x0: 0.09, x1: 0.91, y0: 0.06, y1: 0.64 },
} as const;

export function chapterRewardScrollSize(): { width: number; height: number } {
  return {
    width: CHAPTER_REWARD_SCROLL.width,
    height: CHAPTER_REWARD_SCROLL.height,
  };
}

export interface ChapterRewardScrollRect {
  x: number;
  y: number;
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 卷轴中心与包围盒。plaqueCenterY = 章匾中心 */
export function chapterRewardScrollRect(
  screenW: number,
  plaqueCenterY: number,
): ChapterRewardScrollRect {
  const { width, height } = chapterRewardScrollSize();
  const rightLimit = screenW * CHAPTER_REWARD_SCROLL.pavilionSafeRightRatio;
  let left: number = CHAPTER_REWARD_SCROLL.leftMin;
  if (left + width > rightLimit) {
    left = Math.max(8, rightLimit - width);
  }
  const x = left + width / 2;
  const top = plaqueCenterY + CHAPTER_REWARD_SCROLL.plaqueHalf + CHAPTER_REWARD_SCROLL.gapUnderPlaque;
  const y = top + height / 2;
  return {
    x,
    y,
    width,
    height,
    left,
    right: left + width,
    top,
    bottom: top + height,
  };
}

/** 卷轴自身下沿（叠层用）。地图墩子 / 左栏仍走加卷轴之前的章匾线，不要拿这个去顶布局。 */
export function chapterRewardChromeBottom(screenW: number, plaqueCenterY: number): number {
  return chapterRewardScrollRect(screenW, plaqueCenterY).bottom + CHAPTER_REWARD_SCROLL.chromePad;
}

export interface ChapterRewardPaperRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 以卷轴中心为原点的宣纸内框 */
export function chapterRewardPaperRect(scrollW: number, scrollH: number): ChapterRewardPaperRect {
  const p = CHAPTER_REWARD_SCROLL.paper;
  return {
    left: -scrollW / 2 + scrollW * p.x0,
    right: -scrollW / 2 + scrollW * p.x1,
    top: -scrollH / 2 + scrollH * p.y0,
    bottom: -scrollH / 2 + scrollH * p.y1,
  };
}

export interface ChapterRewardSlotLayout {
  x: number;
  y: number;
  pedW: number;
  pedH: number;
  icon: number;
}

export interface ChapterRewardContentLayout {
  paper: ChapterRewardPaperRect;
  title: { x: number; y: number };
  progress: { x: number; y: number; w: number; h: number };
  slots: readonly ChapterRewardSlotLayout[];
  pet: {
    x: number;
    y: number;
    ringW: number;
    ringH: number;
    bust: number;
    labelY: number;
    pillW: number;
    pillH: number;
  };
}

/** 标题 / 进度 / 三奖励 / 灵宠全部落在宣纸内 */
export function chapterRewardContentLayout(scrollW: number, scrollH: number): ChapterRewardContentLayout {
  const paper = chapterRewardPaperRect(scrollW, scrollH);
  const paperW = paper.right - paper.left;
  const paperH = paper.bottom - paper.top;
  const titleY = paper.top + paperH * 0.16;
  const rowY = paper.top + paperH * 0.58;
  const icon = Math.round(paperH * 0.46);
  const pedW = Math.round(icon * 1.55);
  const pedH = Math.round(icon * 1.12);
  const slotGap = Math.round(icon * 1.12);
  const slot0 = paper.left + paperW * 0.12;
  const slots: ChapterRewardSlotLayout[] = [0, 1, 2].map((i) => ({
    x: slot0 + i * slotGap,
    y: rowY,
    pedW,
    pedH,
    icon,
  }));
  const bust = Math.round(paperH * 0.62);
  const ringW = Math.round(bust * 1.48);
  const petX = paper.right - ringW / 2 - 8;
  const labelY = Math.min(rowY + bust * 0.48, paper.bottom - 8);
  return {
    paper,
    title: { x: paper.left + 8, y: titleY },
    progress: { x: paper.left + 176, y: titleY, w: 72, h: 24 },
    slots,
    pet: {
      x: petX,
      y: rowY - 6,
      ringW,
      ringH: Math.round(bust * 1.22),
      bust,
      labelY,
      pillW: 118,
      pillH: 24,
    },
  };
}

export function contentFitsPaper(layout: ChapterRewardContentLayout): boolean {
  const { paper, title, progress, slots, pet } = layout;
  const inside = (x: number, y: number, pad = 8) =>
    x >= paper.left - pad && x <= paper.right + pad
    && y >= paper.top - pad && y <= paper.bottom + pad;
  if (!inside(title.x, title.y)) return false;
  if (!inside(progress.x, progress.y)) return false;
  if (!slots.every((s) => inside(s.x, s.y))) return false;
  if (!inside(pet.x, pet.y)) return false;
  if (!inside(pet.x, pet.labelY)) return false;
  return true;
}
