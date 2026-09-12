import { describe, expect, it } from 'vitest';
import { waitMs } from '../hostTimeout';

describe('waitMs', () => {
  it('超时后一定会 resolve，不依赖单一 timer', async () => {
    const start = Date.now();
    await waitMs(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });
});
