/**
 * 小游戏分包配置与按需加载（微信 wx.loadSubpackage / 抖音 tt.loadSubpackage 通用）。
 *
 * 资源路径前缀与 scripts/organize-subpackages.mjs 目录结构一致。
 */
import { CdnAssetService } from '@/core/CdnAssetService';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';
import { waitMs } from '@/utils/hostTimeout';

export const SUBPACKAGE_ROOT = {
  pet: 'subpackages/pkg-pet',
  enemy: 'subpackages/pkg-enemy',
  enemyCr: 'subpackages/pkg-enemy-cr',
  scene: 'subpackages/pkg-scene',
  shop: 'subpackages/pkg-shop',
  fx: 'subpackages/pkg-fx',
  audio: 'subpackages/pkg-audio',
  /** 战斗 HUD 贴图（主包 4MB 上限，从主包迁出） */
  battle: 'subpackages/pkg-battle',
} as const;

export type SubpackageName = keyof typeof SUBPACKAGE_ROOT;

/** 与 platform/<端>/game.json 里 subpackages、subPackages 的 name 一致 */
const PLATFORM_SUBPACKAGE_NAME: Record<SubpackageName, string> = {
  pet: 'pkg-pet',
  enemy: 'pkg-enemy',
  enemyCr: 'pkg-enemy-cr',
  scene: 'pkg-scene',
  shop: 'pkg-shop',
  fx: 'pkg-fx',
  audio: 'pkg-audio',
  battle: 'pkg-battle',
};

const NAME_BY_PREFIX = (Object.entries(SUBPACKAGE_ROOT) as [SubpackageName, string][])
  .map(([name, root]) => ({ name, prefix: `${root}/` }));

const loaded = new Set<SubpackageName>();
const inflight = new Map<SubpackageName, Promise<void>>();

/** 华为官方字段是 subpackage，微信/抖音是 name。两边都带上。 */
export function buildLoadSubpackageOptions(pkgName: string): Record<string, string> {
  return { name: pkgName, subpackage: pkgName };
}

function waitHuaweiSubpackage(name: SubpackageName): Promise<void> {
  const pkgName = PLATFORM_SUBPACKAGE_NAME[name];
  return new Promise((resolve) => {
    let done = false;
    const finish = (why: string): void => {
      if (done) return;
      done = true;
      loaded.add(name);
      console.log(`[Subpackage] 华为 ${pkgName} ${why}`);
      resolve();
    };
    const api = Platform.api;
    const loadPkg = api?.loadSubpackage;
    if (typeof loadPkg !== 'function') {
      finish('no-api');
      return;
    }
    try {
      loadPkg.call(api, {
        ...buildLoadSubpackageOptions(pkgName),
        success: () => finish('ok'),
        fail: (err: unknown) => {
          console.warn(`[Subpackage] 华为失败 ${pkgName}`, err);
          finish('fail-continue');
        },
      });
    } catch (e) {
      console.warn(`[Subpackage] 华为异常 ${pkgName}`, e);
      finish('throw-continue');
      return;
    }
    void waitMs(2500).then(() => finish('timeout-continue'));
  });
}

/** 由资源路径反查所属分包（主包资源返回 null） */
export function subpackageForPath(assetPath: string): SubpackageName | null {
  for (const { name, prefix } of NAME_BY_PREFIX) {
    if (assetPath.startsWith(prefix)) return name;
  }
  return null;
}

/** 加载单个分包（非小游戏环境 no-op） */
export function loadSubpackage(name: SubpackageName): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  const pending = inflight.get(name);
  if (pending) return pending;
  if (!Platform.isMinigame) {
    loaded.add(name);
    return Promise.resolve();
  }
  // 华为：qg.loadSubpackage 常常不回调。最多等 2.5s，避免再卡 splash；
  // 成功前不能标 loaded，否则战斗 HUD 会去读还没挂上的分包。
  if (Platform.isHuawei) {
    const promise = waitHuaweiSubpackage(name).finally(() => {
      inflight.delete(name);
    });
    inflight.set(name, promise);
    return promise;
  }
  const api = Platform.api;
  const loadPkg = api?.loadSubpackage;
  if (!loadPkg) {
    loaded.add(name);
    return Promise.resolve();
  }

  const start = (): Promise<void> => new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      const err = new Error(`[Subpackage] 加载超时 ${PLATFORM_SUBPACKAGE_NAME[name]}`);
      console.error(err.message);
      finish(() => reject(err));
    }, 45000);
    const pkgName = PLATFORM_SUBPACKAGE_NAME[name];
    try {
      loadPkg.call(api, {
        ...buildLoadSubpackageOptions(pkgName),
        success: () => {
          loaded.add(name);
          finish(resolve);
        },
        fail: (err: unknown) => {
          console.error(`[Subpackage] 加载失败 ${pkgName}`, err);
          finish(() => reject(err));
        },
      });
    } catch (e) {
      finish(() => reject(e));
    }
  });

  const promise = start().finally(() => {
    inflight.delete(name);
  });
  inflight.set(name, promise);
  return promise;
}

/** 按资源路径集合加载所需分包 */
export async function loadSubpackagesForPaths(paths: readonly string[]): Promise<void> {
  const names = new Set<SubpackageName>();
  for (const p of paths) {
    const pkg = subpackageForPath(p);
    if (pkg) names.add(pkg);
  }
  await Promise.all([...names].map(loadSubpackage));
}

/**
 * 场景入口统一拉资源：CDN 预下载（带超时）+ 本地分包 + 纹理解码。
 * CDN miss 不卡死；超时后 TextureCache 仍会后台补齐并发 texture:loaded。
 */
export async function ensureAssets(paths: readonly string[]): Promise<void> {
  await Promise.all([
    CdnAssetService.preloadPaths(paths).catch((e) => {
      console.warn('[ensureAssets] CDN 预热失败', e);
    }),
    // 分包失败不得拖死后续纹理解码（真机 CDN 立绘仍可走 download）
    loadSubpackagesForPaths(paths).catch((e) => {
      console.warn('[ensureAssets] 分包加载失败', e);
    }),
  ]);
  await TextureCache.preload(paths);
}

/** 音频分包（BGM 播放前调用） */
export async function ensureAudioSubpackage(): Promise<void> {
  await loadSubpackage('audio');
}
