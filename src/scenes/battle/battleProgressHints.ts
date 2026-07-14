/**
 * 主线 Boss 首通进度提示（Boss 直掉灵宠由结算块展示）。
 */
const BOSS_HINTS: Readonly<Record<string, string>> = {
  stage_2_8: '第 3 章「风雷绝巅」已开放',
  stage_3_8: '第 4 章「炽土试炼」已开放',
  stage_4_8: '继续深入历练',
  stage_5_8: '注意爆发节奏，避免被拖入持久战',
  stage_6_8: '蓄力重击记得用护盾扛住',
  stage_7_8: '终章「虚空之巅」在前方',
  stage_8_8: '主线 Boss 掉落已全部完成',
};

export function battleProgressHint(stageId: string, firstClear: boolean): string | null {
  if (!firstClear) return null;
  return BOSS_HINTS[stageId] ?? null;
}
