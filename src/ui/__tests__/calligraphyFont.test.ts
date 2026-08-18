import { describe, expect, it } from 'vitest';
import { resolveBodyFontFamily, resolveCalligraphyFontFamily } from '../calligraphyFont';

describe('calligraphyFont', () => {
  it('自定义字体未加载时不把未注册 family 放进栈', () => {
    expect(resolveBodyFontFamily()).not.toMatch(/LXGWWenKai/);
    expect(resolveCalligraphyFontFamily()).not.toMatch(/MaShanZheng/);
  });
});
