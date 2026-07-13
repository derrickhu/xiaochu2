/**
 * 被动中文名 → 图标资源 id（与 pkg-fx/images/ui/skill/passive_*.png 对应）
 */
export const PASSIVE_ICON_ID_BY_NAME: Readonly<Record<string, string>> = {
  锐眼: 'passive_ruiyan',
  铁壁: 'passive_tiebi',
  庇心: 'passive_bixin',
  激励: 'passive_jili',
  战意: 'passive_zhanyi',
  锐意: 'passive_ruiyi',
  决死: 'passive_juesi',
  生生不息: 'passive_shengsheng',
  甘霖: 'passive_ganlin',
  普济: 'passive_puji',
  磐石: 'passive_panshi',
  厚壁: 'passive_houbi',
  不动: 'passive_budong',
  庇佑: 'passive_biyou',
  协律: 'passive_xielv',
  万众一心: 'passive_wanzhong',
  会心: 'passive_huixin',
  狂暴: 'passive_kuangbao',
  不动如山: 'passive_budongrushan',
  守护: 'passive_shouhu',
};

export function passiveIconIdFromName(name?: string): string | undefined {
  if (!name) return undefined;
  return PASSIVE_ICON_ID_BY_NAME[name];
}

/** 全部被动图标 id（预加载用） */
export const ALL_PASSIVE_ICON_IDS: readonly string[] = Object.values(PASSIVE_ICON_ID_BY_NAME);
