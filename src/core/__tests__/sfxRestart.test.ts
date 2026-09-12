import { describe, expect, it } from 'vitest';
import { shouldRestartPooledSfx } from '@/core/SfxManager';

describe('shouldRestartPooledSfx', () => {
  it('实例从没播过 → 不用 stop/seek（华为会各刷一条 no music 警告）', () => {
    expect(shouldRestartPooledSfx(undefined, 1000)).toBe(false);
    expect(shouldRestartPooledSfx(0, 1000)).toBe(false);
  });

  it('刚播过 → 掐掉重来', () => {
    expect(shouldRestartPooledSfx(1000, 1200)).toBe(true);
  });

  it('早就放完 → 直接 play，不必 stop/seek', () => {
    expect(shouldRestartPooledSfx(1000, 1000 + 2000)).toBe(false);
  });
});
