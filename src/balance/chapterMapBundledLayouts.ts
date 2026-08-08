/**
 * 章节地图节点布局 — 打包进游戏的默认坐标（真机生效）
 *
 * 运营统一：每章固定 8 关，全章共用本套 8 点路径（对齐当前 title_screen 石径）。
 */
import type { MapPoint } from './chapterMap';

export const CHAPTER_MAP_BUNDLED_BY_COUNT: Readonly<Record<number, readonly MapPoint[]>> = {
  8: [
    { x: 0.5884, y: 0.7816 },
    { x: 0.4193, y: 0.7027 },
    { x: 0.5403, y: 0.6153 },
    { x: 0.694, y: 0.544 },
    { x: 0.5192, y: 0.4965 },
    { x: 0.404, y: 0.4349 },
    { x: 0.669, y: 0.3669 },
    { x: 0.7478, y: 0.2632 },
  ],
};
