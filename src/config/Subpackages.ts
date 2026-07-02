/**
 * 微信小游戏分包配置与按需加载。
 *
 * 资源路径前缀与 scripts/organize-subpackages.mjs 目录结构一致。
 */
import { TextureCache } from '@/core/TextureCache';
import { Platform } from '@/core/PlatformService';

export const SUBPACKAGE_ROOT = {
  pet: 'subpackages/pkg-pet',
  enemy: 'subpackages/pkg-enemy',
  enemyCr: 'subpackages/pkg-enemy-cr',
  scene: 'subpackages/pkg-scene',
  fx: 'subpackages/pkg-fx',
  audio: 'subpackages/pkg-audio',
} as const;

export type SubpackageName = keyof typeof SUBPACKAGE_ROOT;

/** 与 minigame/game.json subpackages[].name 一致 */
const WX_SUBPACKAGE_NAME: Record<SubpackageName, string> = {
  pet: 'pkg-pet',
  enemy: 'pkg-enemy',
  enemyCr: 'pkg-enemy-cr',
  scene: 'pkg-scene',
  fx: 'pkg-fx',
  audio: 'pkg-audio',
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
  const wxApi = (globalThis as { wx?: WechatMinigame.Wx }).wx;
  const loadPkg = wxApi?.loadSubpackage;
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
      const err = new Error(`[Subpackage] 加载超时 ${WX_SUBPACKAGE_NAME[name]}`);
      console.error(err.message);
      finish(() => reject(err));
    }, 45000);
    loadPkg.call(wxApi, {
      name: WX_SUBPACKAGE_NAME[name],
      success: () => {
        loaded.add(name);
        finish(resolve);
      },
      fail: (err) => {
        console.error(`[Subpackage] 加载失败 ${WX_SUBPACKAGE_NAME[name]}`, err);
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

/** 先加载分包，再预加载纹理（场景入口统一调用） */
export async function ensureAssets(paths: readonly string[]): Promise<void> {
  await loadSubpackagesForPaths(paths);
  await TextureCache.preload(paths);
}

/** 音频分包（BGM 播放前调用） */
export async function ensureAudioSubpackage(): Promise<void> {
  await loadSubpackage('audio');
}
