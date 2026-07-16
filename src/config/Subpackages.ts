/**
 * 小游戏分包配置与按需加载（微信 wx.loadSubpackage / 抖音 tt.loadSubpackage 通用）。
 *
 * 资源路径前缀与 scripts/organize-subpackages.mjs 目录结构一致。
 */
import { CdnAssetService } from '@/core/CdnAssetService';
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';

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

/** 与 minigame/game.json subpackages[].name / subPackages[].name 一致 */
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
  const api = Platform.api;
  const loadPkg = api?.loadSubpackage;
  if (!loadPkg) {
    loaded.add(name);
    return Promise.resolve();
  }
  const promise = new Promise<void>((resolve, reject) => {
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
    loadPkg.call(api, {
      name: PLATFORM_SUBPACKAGE_NAME[name],
      success: () => {
        loaded.add(name);
        finish(resolve);
      },
      fail: (err: unknown) => {
        console.error(`[Subpackage] 加载失败 ${PLATFORM_SUBPACKAGE_NAME[name]}`, err);
        finish(() => reject(err));
      },
    });
  }).finally(() => {
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
    loadSubpackagesForPaths(paths),
  ]);
  await TextureCache.preload(paths);
}

/** 音频分包（BGM 播放前调用） */
export async function ensureAudioSubpackage(): Promise<void> {
  await loadSubpackage('audio');
}
