import { describe, expect, it, vi } from 'vitest';
import { preventHostDefault } from '@/utils/preventHostDefault';

describe('preventHostDefault', () => {
  it('联邦事件只调宿主 preventDefault', () => {
    const native = vi.fn();
    const federated = vi.fn(() => {
      throw new ReferenceError('Event is not defined');
    });
    preventHostDefault({
      nativeEvent: { preventDefault: native },
      preventDefault: federated,
    });
    expect(native).toHaveBeenCalledOnce();
    expect(federated).not.toHaveBeenCalled();
  });

  it('没有宿主事件时不碰联邦 preventDefault', () => {
    const federated = vi.fn(() => {
      throw new ReferenceError('Event is not defined');
    });
    expect(() => preventHostDefault({
      nativeEvent: {},
      preventDefault: federated,
    })).not.toThrow();
    expect(federated).not.toHaveBeenCalled();
  });

  it('普通画布事件仍拦默认行为', () => {
    const prevent = vi.fn();
    preventHostDefault({ preventDefault: prevent });
    expect(prevent).toHaveBeenCalledOnce();
  });
});
