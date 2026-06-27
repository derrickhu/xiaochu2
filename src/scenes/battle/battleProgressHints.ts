/**
 * 主线通关后的进度引导文案（收录 / 召唤池 / 历练开放）。
 */
export function battleProgressHint(stageId: string, firstClear: boolean): string | null {
  if (!firstClear) return null;
  switch (stageId) {
    case 'stage_1_8':
      return '师门五宠已在召唤池，可用灵玉召唤同行\n主线不直接收录新灵宠；通关第3章后将开放「历练」收录';
    case 'stage_3_6':
      return '「历练·锋芒试炼」已开放！\n击败历练关高级形态即可收录进召唤池';
    default:
      return null;
  }
}
