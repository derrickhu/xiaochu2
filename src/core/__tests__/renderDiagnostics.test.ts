import { describe, expect, it } from 'vitest';
import { describeError, describeRenderFailure } from '@/core/renderDiagnostics';

/** 被 destroy 过的 texture：对象还在，baseTexture 已被摘掉 */
const deadTexture = { baseTexture: null };
const liveTexture = { baseTexture: { valid: true } };

class FakeSprite {
  children: unknown[] = [];

  constructor(public _texture: unknown) {}
}

class FakeText {
  children: unknown[] = [];

  text = '载入中……请稍候';

  constructor(public _texture: unknown) {}
}

class FakeGraphics {
  children: unknown[] = [];

  geometry: { batches: unknown[] };

  constructor(batches: unknown[]) {
    this.geometry = { batches };
  }
}

class FakeContainer {
  constructor(public children: unknown[]) {}
}

describe('describeRenderFailure', () => {
  it('全树健康时报 none', () => {
    const stage = new FakeContainer([new FakeSprite(liveTexture)]);
    expect(describeRenderFailure(stage)).toContain('deadTex=none');
  });

  it('揪出持有空 baseTexture 的 Sprite', () => {
    const stage = new FakeContainer([
      new FakeSprite(liveTexture),
      new FakeSprite(deadTexture),
    ]);
    expect(describeRenderFailure(stage)).toContain('FakeSprite@texture');
  });

  it('Text 会带上文字内容，便于认出是哪一个', () => {
    const stage = new FakeContainer([new FakeText(deadTexture)]);
    const out = describeRenderFailure(stage);
    expect(out).toContain('FakeText');
    expect(out).toContain('载入中');
  });

  it('Graphics 的 fill/line texture 藏在 geometry.batches 里也能查出', () => {
    const stage = new FakeContainer([
      new FakeGraphics([{ style: { texture: deadTexture } }]),
    ]);
    expect(describeRenderFailure(stage)).toContain('FakeGraphics@geometry');
  });

  it('Graphics 的 batch 健康时不误报', () => {
    const stage = new FakeContainer([
      new FakeGraphics([{ style: { texture: liveTexture } }]),
    ]);
    expect(describeRenderFailure(stage)).toContain('deadTex=none');
  });

  it('深层嵌套也能找到', () => {
    const stage = new FakeContainer([
      new FakeContainer([new FakeContainer([new FakeSprite(deadTexture)])]),
    ]);
    expect(describeRenderFailure(stage)).toContain('FakeSprite@texture');
  });

  it('始终附带共享底图状态', () => {
    const out = describeRenderFailure(new FakeContainer([]));
    expect(out).toContain('WHITE=');
    expect(out).toContain('EMPTY=');
  });

  it('循环引用不会把取证本身挂死', () => {
    const loop: any = new FakeContainer([]);
    loop.children.push(loop);
    expect(() => describeRenderFailure(loop)).not.toThrow();
  });
});

describe('describeError', () => {
  it('优先取 toString，JSC 只在那里给出取空的表达式', () => {
    const jscStyle = {
      name: 'TypeError',
      message: 'Type error',
      toString: () => "TypeError: null is not an object (evaluating 'u._batchEnabled')",
    };
    expect(describeError(jscStyle)).toContain("evaluating 'u._batchEnabled'");
  });

  it('带上 stack 头两帧', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at first\n  at second\n  at third';
    const out = describeError(err);
    expect(out).toContain('first');
    expect(out).not.toContain('third');
  });

  it('非 Error 值也不炸', () => {
    expect(() => describeError(null)).not.toThrow();
    expect(() => describeError('炸了')).not.toThrow();
  });
});
