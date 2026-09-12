import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { wrapHuaweiCjsTree } from './wrap-huawei-cjs.mjs';

const temps = [];

afterEach(() => {
  while (temps.length) {
    fs.rmSync(temps.pop(), { recursive: true, force: true });
  }
});

describe('wrapHuaweiCjsTree', () => {
  it('给带 module.exports 的文件套 wrapper，不碰 game-bundle', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'huawei-cjs-'));
    temps.push(root);
    fs.writeFileSync(path.join(root, 'runtime.js'), 'module.exports = { ok: 1 };\n');
    fs.writeFileSync(path.join(root, 'game-bundle.js'), 'module.exports = { skip: 1 };\n');
    const stats = wrapHuaweiCjsTree(root);
    expect(stats.wrapped).toBe(1);
    const runtime = fs.readFileSync(path.join(root, 'runtime.js'), 'utf8');
    expect(runtime).toContain('xiaochu2-huawei-cjs');
    expect(runtime).toContain('module.exports = { ok: 1 }');
    expect(fs.readFileSync(path.join(root, 'game-bundle.js'), 'utf8')).toBe('module.exports = { skip: 1 };\n');
  });

  it('已经包过的文件不再包第二次', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'huawei-cjs-'));
    temps.push(root);
    fs.writeFileSync(path.join(root, 'runtime.js'), 'module.exports = { ok: 1 };\n');
    wrapHuaweiCjsTree(root);
    const once = fs.readFileSync(path.join(root, 'runtime.js'), 'utf8');
    const again = wrapHuaweiCjsTree(root);
    expect(again.wrapped).toBe(0);
    expect(fs.readFileSync(path.join(root, 'runtime.js'), 'utf8')).toBe(once);
  });
});
