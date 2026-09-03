import { describe, expect, it } from 'vitest';
import { didHostIdentityChange } from '../hostIdentity';

describe('didHostIdentityChange', () => {
  it('本地已有账号且宿主给出另一个 id 才算换号', () => {
    expect(didHostIdentityChange('tap:old', 'tap:new')).toBe(true);
  });

  it('同一账号不算换号', () => {
    expect(didHostIdentityChange('tap:same', 'tap:same')).toBe(false);
  });

  it('首次安装本地没有 userId，不算换号', () => {
    expect(didHostIdentityChange('', 'tap:new')).toBe(false);
  });

  it('新登录没拿到 id 不算换号，避免误清档', () => {
    expect(didHostIdentityChange('tap:old', '')).toBe(false);
  });
});
