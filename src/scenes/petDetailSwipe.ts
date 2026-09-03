/**
 * 灵宠详情横滑切宠：哪些落点不该进手势。
 * 底栏升级/升星、顶栏返回都在同一块 canvas 上，华为等 ROM 轻点带横向漂移，
 * 不挡的话第一次点升级会切宠，邻页禁用按钮再把第二次点击吞掉。
 */
export function isPetDetailSwipeStartBlocked(opts: {
  y: number;
  headerBottom: number;
  dockTop: number;
  hitsTapTarget: boolean;
}): boolean {
  if (opts.hitsTapTarget) return true;
  if (opts.y < opts.headerBottom) return true;
  if (opts.y >= opts.dockTop) return true;
  return false;
}
