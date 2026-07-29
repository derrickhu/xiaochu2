/**
 * 主线 Boss 首通进度提示（Boss 直掉灵宠由结算块展示）。
 */
const BOSS_HINTS: Readonly<Record<string, string>> = {
  stage_2_8: '第 3 章「风雷绝巅」已开放',
  stage_3_8: '第 4 章「炽土试炼」已开放',
  stage_4_8: '继续深入历练',
  stage_5_8: '注意爆发节奏，避免被拖入持久战',
  stage_6_8: '蓄力重击记得用护盾扛住',
  stage_7_8: '第 8 章「虚空之巅」在前方',
  stage_8_8: '第 9 章「锐金洞天」已开放',
  stage_9_8: '继续向后期章节推进',
  stage_10_8: 'Boss 会转形态：血条分段处留一手爆发',
  stage_11_8: '后续 Boss 会吸收克制色：备好第二种输出属性',
  stage_12_8: '反击态下少而重地打，别无脑铺 Combo',
  stage_13_8: '削攻与禁疗成常态：净化位该上编队了',
  stage_14_8: '控制链已被免控破解：靠破防与爆发硬拆',
  stage_15_8: '终章「苍虬天境」在前方',
  stage_16_8: '主线 Boss 掉落已全部完成',
};

export function battleProgressHint(stageId: string, firstClear: boolean): string | null {
  if (!firstClear) return null;
  return BOSS_HINTS[stageId] ?? null;
}
