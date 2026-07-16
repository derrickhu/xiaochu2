/**
 * CDN 资源配置（腾讯云 CloudBase / COS）
 *
 * - 同一份配置同时服务运行时与 scripts/upload_cdn.js（脚本用正则+vm 解析本对象字面量）。
 * - 游戏代码继续使用 minigame 根目录下的逻辑路径，如 `subpackages/pkg-pet/images/...`。
 * - 云端对象键必须以 gameKey 为前缀，与 xiao_chu 的 `xiaochu/assets_cdn` 隔离。
 *
 * 注意：filePrefix 须与 BASE_GAME_KEY 对齐（当前 `petTower/assets_cdn`），勿写入存档用的 scoped key。
 */

export interface CdnConfig {
  enabled: boolean;
  appId: string;
  cloudEnv: string;
  /**
   * 云存储 bucket 标识，用于拼 cloud:// fileID。
   * 形如 `xxxx-env-id-1250000000`；也可在 scripts/.cdn_secret 中用 CDN_CLOUD_BUCKET 覆盖。
   */
  cloudBucket: string;
  baseUrl: string;
  /** 云端目录前缀：`{BASE_GAME_KEY}/assets_cdn` */
  filePrefix: string;
  cacheRootName: string;
  downloadRetry: number;
  downloadTimeoutMs: number;
  cdnDirs: readonly string[];
  bundledDirs: readonly string[];
  ignoreFiles: readonly string[];
}

export const CDN_CONFIG: CdnConfig = {
  enabled: true,
  appId: 'wx53b03390106eff65',
  cloudEnv: 'rosa-env-d7grf78r5dbd37323',
  cloudBucket: '726f-rosa-env-d7grf78r5dbd37323-1414200063',
  baseUrl: 'https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la',
  filePrefix: 'petTower/assets_cdn',
  cacheRootName: 'cdn_cache_v1',
  downloadRetry: 2,
  downloadTimeoutMs: 30000,
  /** 大体积立绘 / 场景底图 / 音频走 CDN（上传后可由 packOptions.ignore 瘦包） */
  cdnDirs: [
    'subpackages/pkg-pet/images',
    'subpackages/pkg-enemy/images',
    'subpackages/pkg-enemy-cr/images',
    'subpackages/pkg-scene/images/bg',
    'subpackages/pkg-audio/audio',
  ],
  /** 主包 UI / 棋盘珠 / 战斗 HUD / 特效等首屏与操作强依赖资源留包内 */
  bundledDirs: [
    'images',
    'subpackages/pkg-battle',
    'subpackages/pkg-fx',
    'subpackages/pkg-shop',
  ],
  ignoreFiles: ['game.js', '.DS_Store', 'Thumbs.db'],
};
