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
      const outDir = options.dir || 'minigame';
      const bundlePath = path.resolve(outDir, 'game-bundle.js');
      if (!fs.existsSync(bundlePath)) return;
      const code = fs.readFileSync(bundlePath, 'utf8');
      const re = /systemCheck\(\)\{if\(!\w+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g;
      const patched = code.replace(re, 'systemCheck(){}');
      if (patched !== code) {
        fs.writeFileSync(bundlePath, patched, 'utf8');
        console.log('[pixi-unsafe-eval-patch] Patched systemCheck in bundle');
      }
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['@pixi/core', '@pixi/display', '@pixi/settings', '@pixi/constants', '@pixi/utils'],
  },
  publicDir: false,
  plugins: [pixiUnsafeEvalPlugin()],
  build: {
    outDir: 'minigame',
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
    emptyOutDir: false,
  },
});
