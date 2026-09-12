import { describe, expect, it } from 'vitest';
import { isHuaweiAnonUpgrade, parseHuaweiLoginData, readHuaweiAppId } from '../huaweiAccount';

describe('huaweiAccount', () => {
  it('从 gameLoginWithReal 回包取出 playerId', () => {
    const parsed = parseHuaweiLoginData({
      playerId: 'hwPlayer001',
      displayName: '小瓜',
      ts: '1710000000',
      gameAuthSign: 'sign',
    });
    expect(parsed).toEqual({
      playerId: 'hwPlayer001',
      displayName: '小瓜',
      ts: '1710000000',
      gameAuthSign: 'sign',
    });
  });

  it('缺 playerId 或太短则丢掉', () => {
    expect(parseHuaweiLoginData({})).toBeNull();
    expect(parseHuaweiLoginData({ playerId: 'ab' })).toBeNull();
    expect(parseHuaweiLoginData(null)).toBeNull();
  });

  it('识别匿名号升级', () => {
    expect(isHuaweiAnonUpgrade('hw:anon_xxx12345', 'hw:realPlayer')).toBe(true);
    expect(isHuaweiAnonUpgrade('hw:realA', 'hw:realB')).toBe(false);
  });

  it('未配置时回落到系统信息里的 appId', () => {
    expect(readHuaweiAppId({
      getSystemInfoSync: () => ({ appId: '123456789' }),
    })).toBe('123456789');
  });
});
