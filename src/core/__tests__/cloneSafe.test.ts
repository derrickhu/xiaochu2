import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, '../../../minigame/cloneSafe.js'), 'utf8');
const sandbox = { module: { exports: {} as Record<string, unknown> }, exports: {} };
sandbox.module.exports = sandbox.exports;
runInNewContext(source, sandbox);
const { softenClone, stripLoneSurrogates, createReentryGuard, isDevtoolsCloneNoise } = sandbox.module.exports as {
  softenClone: (data: unknown) => unknown;
  stripLoneSurrogates: (str: string) => string;
  createReentryGuard: () => (
    orig: (...args: unknown[]) => unknown,
    thisArg: unknown,
    args: ArrayLike<unknown>,
    fn: () => unknown,
  ) => unknown;
  isDevtoolsCloneNoise: (err: unknown) => boolean;
};

describe('devtools 网络日志可克隆', () => {
  it('削掉孤立代理项，合法字符对保留', () => {
    const lone = 'a\uD800b\uD83D\uDE00';
    const stripped = stripLoneSurrogates(lone);
    expect(stripped).toBe('a\uFFFDb\uD83D\uDE00');
    expect(() => structuredClone(stripped)).not.toThrow();
  });

  it('图片当文本读进来的响应，软化后还能 structured clone', () => {
    const binary = '\uD800\uDC00\uD800\u0000\uDFFF';
    const soft = softenClone({
      type: 'HTTP_RESPONSE',
      detail: {
        url: 'https://cdn.example/a.jpg',
        response: binary,
        bytes: new Uint8Array([1, 2, 3]),
      },
    }) as { detail: { response: string; bytes: string } };
    expect(soft.detail.response).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    expect(soft.detail.bytes).toBe('[Uint8Array]');
    expect(() => structuredClone(soft)).not.toThrow();
  });

  it('push 重入时走原始方法，不会和分包加载对撞爆栈', () => {
    const guard = createReentryGuard();
    const store: unknown[] = [];
    const orig = function (this: unknown, item: unknown) {
      store.push(item);
      return store.length;
    };
    const wrapped = function (this: unknown, item: { reenter?: boolean }) {
      const self = this;
      const args = arguments;
      return guard(orig, self, args, () => {
        if (item && item.reenter) wrapped.call(self, { reenter: false });
        return orig.apply(self, args as unknown as [unknown]);
      });
    };
    expect(() => wrapped.call({}, { reenter: true })).not.toThrow();
    expect(store).toEqual([{ reenter: false }, { reenter: true }]);
  });

  it('开发者工具把克隆失败塞进 message 时视为噪声', () => {
    const message = [
      'MiniProgramError',
      'An object could not be cloned.',
      'Error: An object could not be cloned.',
      '    at ide:///extensions/appservice/index.js:1:85087',
      '    at http://127.0.0.1:34118/game/__dev__/WAGame.js:1:208278',
    ].join('\n');
    expect(isDevtoolsCloneNoise({ message })).toBe(true);
    expect(isDevtoolsCloneNoise(message)).toBe(true);
    expect(isDevtoolsCloneNoise({ message: 'An object could not be cloned.' })).toBe(false);
    expect(isDevtoolsCloneNoise({ message: 'boot failed', stack: 'at ide:///extensions/appservice/index.js:1' })).toBe(false);
  });
});
