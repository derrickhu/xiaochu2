import { describe, expect, it } from 'vitest';
import { chapterMapChromeInset } from '../chapterMap';

describe('chapterMapChromeInset', () => {
  it('章匾压到终点 Boss 时加大 inset，头顶让出匾下沿', () => {
    const inset = chapterMapChromeInset({
      topNodeY: 280,
      scale: 1.21,
      offsetY: 0,
      chromeBottom: 248,
      artRise: 128,
      minInset: 32,
    });
    expect(inset).toBeGreaterThan(32);
    const artTop = 0 + (280 - 128) * 1.21 + inset;
    expect(artTop).toBeGreaterThanOrEqual(248);
  });

  it('9:16 且已有空隙时不小于保底 inset', () => {
    expect(chapterMapChromeInset({
      topNodeY: 351,
      scale: 1,
      offsetY: 0,
      chromeBottom: 160,
      artRise: 128,
      minInset: 32,
    })).toBe(32);
  });
});
