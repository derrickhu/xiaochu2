import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  Platform: {
    isMinigame: true,
    isHuawei: true,
    api: {
      loadSubpackage: vi.fn(),
    },
  },
  waitMs: vi.fn(() => new Promise<void>(() => { /* 单测里只靠 success 结束 */ })),
}));

vi.mock('@/core/PlatformService', () => ({ Platform: hoisted.Platform }));
vi.mock('@/utils/hostTimeout', () => ({ waitMs: hoisted.waitMs }));

import { loadSubpackage } from '../Subpackages';

describe('华为 loadSubpackage', () => {
  beforeEach(() => {
    hoisted.Platform.api.loadSubpackage.mockReset();
    hoisted.waitMs.mockImplementation(() => new Promise(() => {}));
  });

  it('success 到来后才放行，方便随后读包内图', async () => {
    hoisted.Platform.api.loadSubpackage.mockImplementation((opts: { success?: () => void }) => {
      opts.success?.();
    });
    const started = Date.now();
    await loadSubpackage('battle');
    expect(Date.now() - started).toBeLessThan(50);
    expect(hoisted.Platform.api.loadSubpackage).toHaveBeenCalled();
  });

  it('原生不回调时靠超时放行，不把启动卡死', async () => {
    hoisted.Platform.api.loadSubpackage.mockImplementation(() => {
      // 故意不调 success / fail
    });
    hoisted.waitMs.mockImplementation(() => Promise.resolve());
    const started = Date.now();
    await loadSubpackage('fx');
    expect(Date.now() - started).toBeLessThan(50);
  });
});
