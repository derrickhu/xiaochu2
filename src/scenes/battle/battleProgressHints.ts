/**
 * 主线通关后的进度引导文案（收录 / 召唤池 / 下章开放）。
 */
const BOSS_HINTS: Readonly<Record<string, string>> = {
  stage_1_5: '星辉灵鹿已收录进召唤池！\nR 档灵宠开局即可召唤，章节 Boss 收录 SR 及以上',
  stage_2_6: '灵鹿医者已收录！第 3 章「风雷绝巅」已开放\n继续推进，召唤池会持续扩张',
  stage_3_6: '归墟玄龟已收录！第 4 章「炽土试炼」已开放\nBoss 会逐步教新挑战，记得看本章目标',
  stage_4_6: '玄影天鹏已收录！顽石封印挑战已掌握，继续深入历练',
  stage_5_7: '金羽仙鹤已收录！自疗拖战需爆发抢血，别被拖入持久战',
  stage_6_7: '厚土娘娘已收录！蓄力重击记得用护盾扛住',
  stage_7_7: '裂隙甲虫已收录！禁心关考验续航，终章虚空之巅在前方',
  stage_8_8: '天外魔君已收录！封火挑战已掌握，主线收录已全部完成，继续养成与召唤吧',
};

export function battleProgressHint(stageId: string, firstClear: boolean): string | null {
  if (!firstClear) return null;
  return BOSS_HINTS[stageId] ?? null;
}
