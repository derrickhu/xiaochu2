import { describe, expect, it } from 'vitest';
import { bumpPatch, readTapVersion } from './tap-version.mjs';

describe('bumpPatch', () => {
  it('补丁位加一', () => {
    expect(bumpPatch('1.1.1')).toBe('1.1.2');
    expect(bumpPatch('1.1.9')).toBe('1.1.10');
  });

  it('非法格式直接报', () => {
    expect(() => bumpPatch('1.1')).toThrow(/非法/);
    expect(() => bumpPatch('V1.1.1')).toThrow(/非法/);
  });
});

describe('readTapVersion', () => {
  it('优先 tapVersion，没有才退回 version', () => {
    expect(readTapVersion({ tapVersion: '1.1.1', version: '0.1.0' })).toBe('1.1.1');
    expect(readTapVersion({ version: '0.1.0' })).toBe('0.1.0');
  });
});
