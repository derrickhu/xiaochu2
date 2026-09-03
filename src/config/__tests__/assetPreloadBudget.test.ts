import { describe, expect, it } from 'vitest';
import {
  BOARD_IMAGES,
  DEFERRED_PRELOAD_IMAGES,
  MAIN_PRELOAD_IMAGES,
  ORB_IMAGES,
  PET_FRAME_IMAGES,
  UI_BATTLE_IMAGES,
} from '@/config/Assets';
import {
  PET_DETAIL_SHELL_IMAGES,
  TEAM_SHELL_IMAGES,
  battlePreloadImages,
} from '@/config/assetPreload';

describe('首屏预加载预算', () => {
  it('首屏清单不含分包路径：启动会整包下载解包，一张图能拖来一个 MB 级分包', () => {
    const fromSubpackage = MAIN_PRELOAD_IMAGES.filter((p) => p.startsWith('subpackages/'));
    expect(fromSubpackage).toEqual([]);
  });

  it('首屏清单不含战斗件：棋盘/珠子/五行框只有进战斗才上屏', () => {
    const battleOnly = [
      ...Object.values(BOARD_IMAGES),
      ...Object.values(ORB_IMAGES),
      ...Object.values(PET_FRAME_IMAGES),
      UI_BATTLE_IMAGES.petStar,
    ];
    const leaked = battleOnly.filter((p) => MAIN_PRELOAD_IMAGES.includes(p));
    expect(leaked).toEqual([]);
  });

  it('延后集与首屏集不重叠，避免同一张图排两次队', () => {
    const dup = DEFERRED_PRELOAD_IMAGES.filter((p) => MAIN_PRELOAD_IMAGES.includes(p));
    expect(dup).toEqual([]);
  });

  it('延后集里的战斗件都有场景级 shell 兜底，后台没补完也不缺图', () => {
    const battleShell = battlePreloadImages('1-1', []);
    const covered = new Set([
      ...battleShell,
      ...TEAM_SHELL_IMAGES,
      ...PET_DETAIL_SHELL_IMAGES,
    ]);
    const orphan = [
      ...Object.values(BOARD_IMAGES),
      ...Object.values(ORB_IMAGES),
      ...Object.values(PET_FRAME_IMAGES),
      UI_BATTLE_IMAGES.petStar,
    ].filter((p) => !covered.has(p));
    expect(orphan).toEqual([]);
  });
});
