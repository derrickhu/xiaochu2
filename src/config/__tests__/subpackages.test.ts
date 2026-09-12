import { describe, expect, it } from 'vitest';
import { buildLoadSubpackageOptions } from '../Subpackages';

describe('buildLoadSubpackageOptions', () => {
  it('同时带微信 name 和华为 subpackage', () => {
    expect(buildLoadSubpackageOptions('pkg-pet')).toEqual({
      name: 'pkg-pet',
      subpackage: 'pkg-pet',
    });
  });
});
