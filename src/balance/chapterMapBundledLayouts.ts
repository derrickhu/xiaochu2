/**
 * 章节地图节点布局 — 打包进游戏的默认坐标（真机生效）
 *
 * 运营统一：每章固定 8 关，全章共用本套 8 点路径（对齐当前 title_screen 石径）。
 */
import type { MapPoint } from './chapterMap';

export const CHAPTER_MAP_BUNDLED_BY_COUNT: Readonly<Record<number, readonly MapPoint[]>> = {
  8: [
    { x: 0.5557, y: 0.7945 },
    { x: 0.5307, y: 0.7092 },
    { x: 0.4059, y: 0.6315 },
    { x: 0.5672, y: 0.5732 },
    { x: 0.5711, y: 0.4803 },
    { x: 0.4443, y: 0.4068 },
    { x: 0.6191, y: 0.3604 },
    { x: 0.669, y: 0.2654 },
  ],
};
