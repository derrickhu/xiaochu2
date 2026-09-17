import { describe, expect, it } from 'vitest';
// @ts-expect-error 云函数是 CJS，无类型声明
import { extractTowerFloor } from '../../../cloudfunctions/petTower-api/lib/rank.js';

describe('云存档抽出通天塔层数', () => {
  it('能从 save_v2 字符串读出 bestFloor', () => {
    const payload = {
      petTower_tt_save_v2: JSON.stringify({
        version: 8,
        tower: { bestFloor: 33, runFloor: 12 },
      }),
    };
    expect(extractTowerFloor(payload)).toBe(33);
  });

  it('没有塔进度就是 0', () => {
    expect(extractTowerFloor({ petTower_tt_save_v2: '{"coins":1}' })).toBe(0);
    expect(extractTowerFloor(null)).toBe(0);
  });
});
