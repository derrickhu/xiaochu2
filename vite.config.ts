import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version: string };

/**
 * Vite 插件：构建后替换 bundle 中所有 ShaderSystem 的 systemCheck 方法体，
 * 使其不再抛出 unsafe-eval 错误。
 * 原因：@pixi/unsafe-eval 的 selfInstall() 副作用代码可能被 tree-shaking 移除，
 * 且 @pixi/core 可能在 bundle 中出现多个副本，prototype patch 只能覆盖其中一个。
 * （方案验证自 game2D_huahua）
 */
function pixiUnsafeEvalPlugin(): Plugin {
  return {
    name: 'pixi-unsafe-eval-patch',
    writeBundle(options) {
      const outDir = options.dir || BUNDLE_DIR;
      const bundlePath = path.resolve(outDir, 'game-bundle.js');
      if (!fs.existsSync(bundlePath)) return;
      const code = fs.readFileSync(bundlePath, 'utf8');
      const replacements: Array<[RegExp, string, string]> = [
        [
          /systemCheck\(\)\{if\(!\w+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g,
          'systemCheck(){}',
          'systemCheck',
        ],
        // core-js bind：用 Function() 拼包装函数，Tap 上等于调用不存在的 eval
        [
          /Function\("binder","return function \("\+\w+\(\w+,","\)\+"\)\{ return binder\.apply\(this,arguments\); \}"\)/g,
          '(function(binder){return function(){return binder.apply(this,arguments)}})',
          'bind-Function',
        ],
        // Pixi unsafeEvalSupported() 探测，改成恒 false，走静态 uniform setter
        [
          /new Function\("param1","param2","param3","return param1\[param2\] === param3;"\)\(\{a:"b"\},"a","b"\)===!0/g,
          '!1',
          'unsafeEvalSupported',
        ],
        // qs/get-intrinsic 初始化会写 "%eval%":eval，Tap 上这个标识符直接 ReferenceError
        [
          /"%eval%":eval/g,
          '"%eval%":void 0',
          'get-intrinsic-eval',
        ],
        // get-intrinsic 用 Function("...constructor") 探测，JSC 会报 Can't find variable: eval
        [
          /function\((\w+)\)\{try\{return (\w+)\('"use strict"; return \('\+\1\+"\)\.constructor;"\)\(\)\}catch\{\}\}/g,
          'function($1){}',
          'getEvalledConstructor',
        ],
        // 剩余 new Function(...)：改成空函数工厂，避免 JSC 走 eval
        [
          /new Function\(/g,
          '(function(){return function(){}})(',
          'new-Function',
        ],
      ];
      let patched = code;
      const applied: string[] = [];
      for (const [re, to, name] of replacements) {
        const next = patched.replace(re, to);
        if (next !== patched) applied.push(name);
        patched = next;
      }
      if (process.env.VITE_PLATFORM === 'taptap') {
        const strictIife = '(function(){"use strict";';
        if (patched.startsWith(strictIife)) {
          patched = `(function(){var eval=function(){return void 0};${patched.slice(strictIife.length)}`;
          applied.push('tap-local-eval');
        }
      }
      if (patched !== code) {
        fs.writeFileSync(bundlePath, patched, 'utf8');
        console.log(`[pixi-unsafe-eval-patch] Patched ${applied.join(', ')}`);
      }
      if (patched.includes('"%eval%":eval')) {
        throw new Error('[pixi-unsafe-eval-patch] bundle 仍含 "%eval%":eval，禁止出包');
      }
      const leftover = path.resolve(__dirname, 'minigame/game-bundle.js');
      if (fs.existsSync(leftover)) {
        fs.rmSync(leftover);
        console.log('[pixi-unsafe-eval-patch] 已删除 minigame/game-bundle.js（旧产物，扫码开错目录会中毒）');
      }
    },
  };
}

const isTap = process.env.VITE_PLATFORM === 'taptap';
const BUNDLE_DIR = isTap ? '.bundle-taptap' : '.bundle';

/**
 * 只在 `vite build --watch` 里组装。一次性 build 由 npm script 在 organize 之后跑 CLI，
 * 避免 writeBundle 先拷未整理的树、随后又整目录删掉。
 *
 * 改 TS：writeBundle → 增量 assemble。
 * 改 minigame/platform：目录监听 → 只 assemble，不重打 JS。
 */
function assemblePlatformsPlugin(): Plugin {
  let stopWatch: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();

  const target = () => (isTap ? 'taptap' : (process.env.XIAOCHU2_PLATFORM ?? 'all'));

  const enqueue = (reason: string) => {
    queue = queue
      .then(async () => {
        const { assembleAll } = await import('./scripts/build-platform.mjs');
        console.log(`[build-platform] watch assemble (${reason})`);
        assembleAll(target());
      })
      .catch((err: unknown) => {
        console.error('[build-platform]', err instanceof Error ? err.message : err);
      });
    return queue;
  };

  return {
    name: 'assemble-platforms',
    async buildStart() {
      if (!this.meta.watchMode || stopWatch) return;
      const { watchContentTrees } = await import('./scripts/build-platform.mjs');
      stopWatch = watchContentTrees(() => {
        void enqueue('assets');
      });
    },
    async writeBundle() {
      if (!this.meta.watchMode) return;
      await enqueue('bundle');
    },
    closeWatcher() {
      stopWatch?.();
      stopWatch = undefined;
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    'import.meta.env.VITE_PLATFORM': JSON.stringify(process.env.VITE_PLATFORM || ''),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['@pixi/core', '@pixi/display', '@pixi/settings', '@pixi/constants', '@pixi/utils'],
  },
  publicDir: false,
  plugins: [pixiUnsafeEvalPlugin(), assemblePlatformsPlugin()],
  build: {
    outDir: BUNDLE_DIR,
    assetsInlineLimit: 0,
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      formats: ['iife'],
      name: 'Xiaochu2',
      fileName: () => 'game-bundle.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: 'esbuild',
    emptyOutDir: true,
  },
});
