import { describe, expect, it } from 'vitest';
import { applyHostProfile, HOME_GUEST_NAME, parseHostProfile, resolveHomeIdentity } from '@/game/rankHostProfile';
import { localSelfEntry, rankAvatarPath } from '@/game/rankBoard';

describe('排行榜平台身份', () => {
  it('空串不当成资料', () => {
    expect(parseHostProfile({ name: '', avatarUrl: '' })).toBeNull();
    expect(parseHostProfile(null)).toBeNull();
  });

  it('自己这条用抖音昵称和头像，不再用灵宠名', () => {
    const self = applyHostProfile(
      localSelfEntry(1),
      { name: '裂甲玩家', avatarUrl: 'https://img/me' },
    );
    expect(self).toMatchObject({
      name: '裂甲玩家',
      avatarUrl: 'https://img/me',
      floor: 1,
      isSelf: true,
    });
    expect(rankAvatarPath(self!, 'fallback.png')).toBe('https://img/me');
  });

  it('没有平台头像才退回默认图', () => {
    const self = localSelfEntry(1);
    expect(rankAvatarPath(self!, 'fallback.png')).toBe('fallback.png');
  });

  it('首页身份有抖音资料就用，没有就占位萌新', () => {
    expect(resolveHomeIdentity(null)).toEqual({
      name: HOME_GUEST_NAME, avatarUrl: null,
    });
    expect(resolveHomeIdentity({ name: '阿白', avatarUrl: 'https://img/a' })).toEqual({
      name: '阿白', avatarUrl: 'https://img/a',
    });
  });
});
