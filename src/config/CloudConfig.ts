/**
 * 统一 HTTP 后端 / 经分 / 云同步配置（CloudBase HTTP 访问服务）
 *
 * 多游戏复用时只需改 GAME_KEY；客户端存档 key、后端路径前缀、经分 game_key 均由此派生。
 */
export const GAME_KEY = 'petTower';

/** CloudBase HTTP 访问服务根域名（不含路径） */
export const BACKEND_BASE_URL = 'https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com';

/** 本游戏 API 挂载前缀（cloudfunctions/${GAME_KEY}-api） */
export const BACKEND_PATH_PREFIX = `/${GAME_KEY}-api`;

export const BACKEND_LOGIN_PATH = `${BACKEND_PATH_PREFIX}/login`;
export const BACKEND_PULL_PATH = `${BACKEND_PATH_PREFIX}/save/pull`;
export const BACKEND_PUSH_PATH = `${BACKEND_PATH_PREFIX}/save/push`;
export const BACKEND_HEALTH_PATH = `${BACKEND_PATH_PREFIX}/health`;

/** 经分批量上报（多游戏共用云函数，按 game_key 区分） */
export const ANALYTICS_INGEST_PATH = '/analytics-ingest/track';
export const ANALYTICS_ENDPOINT = `${BACKEND_BASE_URL}${ANALYTICS_INGEST_PATH}`;

export const BACKEND_REQUEST_TIMEOUT_MS = 10000;

export const BACKEND_TOKEN_KEY = `${GAME_KEY}_token`;
export const BACKEND_ANON_ID_KEY = `${GAME_KEY}_anon_id`;

/** 本地存档 key（与 GAME_KEY 绑定） */
export const SAVE_KEY = `${GAME_KEY}_save_v2`;
export const LEGACY_SAVE_KEY = `${GAME_KEY}_save_v1`;
/** 开发期旧项目名存档，仅迁移用 */
export const DEV_LEGACY_SAVE_KEYS = ['xiaochu2_save_v2', 'xiaochu2_save_v1'] as const;

export const CLOUD_SYNC_SCHEMA_VERSION = 1;
export const CLOUD_SYNC_META_KEY = `${GAME_KEY}_cloud_meta`;

/** 参与云同步的本地 storage key（value 为原始 JSON 字符串） */
export const CLOUD_SYNC_ALLOWLIST = [SAVE_KEY] as const;

export const CLOUD_SYNC_EXCLUDE_KEYS = [
  BACKEND_TOKEN_KEY,
  BACKEND_ANON_ID_KEY,
] as const;

export const CLOUD_SYNC_STARTUP_TIMEOUT_MS = 2500;
export const CLOUD_SYNC_DEBOUNCE_MS = 1500;
export const CLOUD_SYNC_BASE_DELAY_MS = 1500;
export const CLOUD_SYNC_MAX_BACKOFF_MS = 30000;
export const CLOUD_SYNC_MAX_FAIL_COUNT = 5;
export const CLOUD_SYNC_RETRY_INTERVAL_MS = 60000;
export const CLOUD_SYNC_LOG_THRESHOLD = 3;

export type CloudSyncKey = typeof CLOUD_SYNC_ALLOWLIST[number];
