/**
 * 主线 Boss 首通进度提示（不含收录话术，收录由结算「已进召唤池」块展示）。
 */
const BOSS_HINTS: Readonly<Record<string, string>> = {
  stage_2_6: '第 3 章「风雷绝巅」已开放',
  stage_3_6: '第 4 章「炽土试炼」已开放',
  stage_4_6: '继续深入历练',
  stage_5_7: '注意爆发节奏，避免被拖入持久战',
  stage_6_7: '蓄力重击记得用护盾扛住',
  stage_7_7: '终章「虚空之巅」在前方',
  stage_8_8: '主线收录已全部完成',
};

export function battleProgressHint(stageId: string, firstClear: boolean): string | null {
  if (!firstClear) return null;
  return BOSS_HINTS[stageId] ?? null;
}
