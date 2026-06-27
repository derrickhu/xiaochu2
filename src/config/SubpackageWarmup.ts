/**
 * 首页 idle 时后台预热常用分包，避免首次点「灵宠 / 战斗」才下载 pkg-pet 等。
 * 对齐 xiao_chu 启动阶段并行 loadSubpackage，但不阻塞首屏。
 */
import { loadSubpackage, type SubpackageName } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';

/** 灵宠 / 场景 UI / 战斗敌人 / 特效（audio 在 main 已拉） */
const COMMON_WARMUP: readonly SubpackageName[] = [
  'pet',
  'scene',
  'enemy',
  'enemyCr',
  'fx',
];

let started = false;

/** 幂等：仅小游戏环境执行一次，fire-and-forget */
export function warmupCommonSubpackages(): void {
  if (started || !Platform.isMinigame) return;
  started = true;
  for (const name of COMMON_WARMUP) {
    void loadSubpackage(name).catch((err) => {
      console.warn(`[Warmup] 分包 ${name} 预热失败`, err);
    });
  }
  console.log('[Warmup] 已开始后台预热常用分包');
}
