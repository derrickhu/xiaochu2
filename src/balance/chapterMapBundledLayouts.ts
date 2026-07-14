/**
 * 章节地图节点布局 — 打包进游戏的默认坐标（真机生效）
 *
 * 运营统一：每章固定 8 关，全章共用本套 8 点路径（对齐当前 title_screen 石径）。
 */
import type { MapPoint } from './chapterMap';

export const CHAPTER_MAP_BUNDLED_BY_COUNT: Readonly<Record<number, readonly MapPoint[]>> = {
  8: [
    { x: 0.5941, y: 0.787 },
    { x: 0.4827, y: 0.7114 },
    { x: 0.4904, y: 0.6174 },
    { x: 0.6556, y: 0.5516 },
    { x: 0.5154, y: 0.4868 },
    { x: 0.4942, y: 0.4101 },
    { x: 0.6479, y: 0.3561 },
    { x: 0.6902, y: 0.2827 },
  ],
};
