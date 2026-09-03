import {
  BACKEND_ANON_ID_KEY,
  BACKEND_BASE_URL,
  BACKEND_LOGIN_PATH,
  BACKEND_PULL_PATH,
  BACKEND_PUSH_PATH,
  BACKEND_REQUEST_TIMEOUT_MS,
  BACKEND_TOKEN_KEY,
} from '@/config/CloudConfig';
import { Platform } from '@/core/PlatformService';
import { didHostIdentityChange } from '@/core/hostIdentity';

export interface BackendPullResult {
  userId: string;
  platform: string;
  exists: boolean;
  schemaVersion: number;
  updatedAt: number;
  payload: Record<string, string>;
  payloadKeys: string[];
  clientFingerprint?: string;
}

export interface BackendPushPayload {
  schemaVersion: number;
  updatedAt: number;
  baseRemoteUpdatedAt: number;
  clientFingerprint: string;
  payload: Record<string, string>;
}

export interface BackendPushResult {
  userId: string;
  updatedAt: number;
  savedAt: number;
  mode: 'insert' | 'update';
  sizeBytes: number;
}

interface StoredToken {
  token: string;
  userId: string;
  platform: string;
  expiresAt: number;
}

export interface EnsureTokenResult extends StoredToken {
  previousUserId: string;
  identityChanged: boolean;
}

export class BackendError extends Error {
  readonly status: number;
  readonly code: string;
  readonly data?: unknown;

  constructor(status: number, code: string, message: string, data?: unknown) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

class BackendServiceClass {
  private stored: StoredToken | null = null;
  private loginInflight: Promise<StoredToken> | null = null;

  get available(): boolean {
    return Platform.canUseBackend;
  }

  get userId(): string {
    return this.stored?.userId || '';
  }

  async ensureToken(opts?: { refreshIdentity?: boolean }): Promise<EnsureTokenResult> {
    const previousUserId = this.stored?.userId || this.loadTokenFromStorage()?.userId || '';

    if (opts?.refreshIdentity) {
      return this.refreshIdentity(previousUserId);
    }

    if (this.stored && this.stored.expiresAt - Date.now() > 60_000) {
      if (this.isTokenForCurrentPlatform(this.stored)) {
        return this.withIdentityFlags(this.stored, previousUserId);
      }
      console.warn(`[Backend] 缓存 token 平台不匹配(${this.stored.platform}→${this.expectedPlatform()})，重新登录`);
      this.clearToken();
    }
    const cached = this.loadTokenFromStorage();
    if (cached && cached.expiresAt - Date.now() > 60_000) {
      if (this.isTokenForCurrentPlatform(cached)) {
        this.stored = cached;
        return this.withIdentityFlags(cached, previousUserId);
      }
      console.warn(`[Backend] 本地 token 平台不匹配(${cached.platform}→${this.expectedPlatform()})，重新登录`);
      this.clearToken();
    }
    const stored = await this.loginShared();
    return this.withIdentityFlags(stored, previousUserId);
  }

  pullSave(): Promise<BackendPullResult> {
    return this.callWithAuth<BackendPullResult>(BACKEND_PULL_PATH, {});
  }

  pushSave(snapshot: BackendPushPayload): Promise<BackendPushResult> {
    return this.callWithAuth<BackendPushResult>(BACKEND_PUSH_PATH, snapshot);
  }

  clearToken(): void {
    this.stored = null;
    Platform.removeStorageSync(BACKEND_TOKEN_KEY);
  }

  private withIdentityFlags(stored: StoredToken, previousUserId: string): EnsureTokenResult {
    return {
      ...stored,
      previousUserId,
      identityChanged: didHostIdentityChange(previousUserId, stored.userId),
    };
  }

  /**
   * 冷启动向宿主重新要 code。JWT 没过期也必须走，否则 Tap 换号后会继续用旧票。
   * 重新登录失败则退回未过期的本地票，避免弱网把人挡在门外。
   */
  private async refreshIdentity(previousUserId: string): Promise<EnsureTokenResult> {
    try {
      const stored = await this.loginShared();
      const result = this.withIdentityFlags(stored, previousUserId);
      if (result.identityChanged) {
        console.warn(`[Backend] 宿主账号变更 ${previousUserId} → ${stored.userId}`);
      } else {
        console.log(`[Backend] login refresh ok userId=${stored.userId}`);
      }
      return result;
    } catch (error) {
      const cached = this.stored || this.loadTokenFromStorage();
      if (cached && cached.expiresAt - Date.now() > 60_000 && this.isTokenForCurrentPlatform(cached)) {
        this.stored = cached;
        console.warn('[Backend] 刷新身份失败，沿用本地 token', error);
        return this.withIdentityFlags(cached, previousUserId);
      }
      throw error;
    }
  }

  private loginShared(): Promise<StoredToken> {
    if (this.loginInflight) {
      return this.loginInflight;
    }
    this.loginInflight = this.login().finally(() => {
      this.loginInflight = null;
    });
    return this.loginInflight;
  }

  private async login(): Promise<StoredToken> {
    const body = await this.buildLoginBody();
    console.log(`[Backend] login start platform=${body.platform}`);
    const { status, data } = await this.request(BACKEND_LOGIN_PATH, body, undefined);
    const res = data as { ok?: boolean; code?: string; error?: string; data?: Partial<StoredToken> & { token?: string } };
    if (status !== 200 || !res || res.ok !== true || !res.data?.token) {
      const code = res?.code || 'LOGIN_FAIL';
      const msg = res?.error || `login failed (status=${status})`;
      console.warn(`[Backend] login fail platform=${body.platform} code=${code} msg=${msg}`);
      throw new BackendError(status, code, msg, res?.data);
    }
    const stored = {
      token: String(res.data.token),
      userId: String(res.data.userId || ''),
      platform: String(res.data.platform || body.platform),
      expiresAt: Number(res.data.expiresAt || 0),
    };
    this.stored = stored;
    Platform.setStorageSync(BACKEND_TOKEN_KEY, JSON.stringify(stored));
    console.log(`[Backend] login ok platform=${stored.platform} userId=${stored.userId}`);
    return stored;
  }

  private expectedPlatform(): string {
    return Platform.backendPlatformCode;
  }

  private isTokenForCurrentPlatform(stored: StoredToken): boolean {
    const expected = this.expectedPlatform();
    const actual = stored.platform || stored.userId.split(':')[0] || '';
    return actual === expected;
  }

  private async buildLoginBody(): Promise<{ platform: string; code?: string; anonId?: string }> {
    const platform = Platform.backendPlatformCode;
    if (platform === 'wx' || platform === 'dy' || platform === 'tap') {
      const code = await Platform.loginCode();
      if (!code) {
        const errCode = platform === 'wx' ? 'NO_WX_CODE' : platform === 'dy' ? 'NO_TT_CODE' : 'NO_TAP_CODE';
        throw new BackendError(0, errCode, `${platform} login did not return code`);
      }
      return { platform, code };
    }
    return { platform: 'anon', anonId: this.getOrCreateAnonId() };
  }

  private getOrCreateAnonId(): string {
    const existing = Platform.getStorageSync(BACKEND_ANON_ID_KEY);
    if (existing) {
      return existing;
    }
    const id = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    Platform.setStorageSync(BACKEND_ANON_ID_KEY, id);
    return id;
  }

  private async callWithAuth<T>(path: string, body: unknown): Promise<T> {
    const token = await this.ensureToken();
    const { status, data } = await this.request(path, body, token.token);
    if (status === 401) {
      this.clearToken();
      const retryToken = await this.ensureToken();
      const retry = await this.request(path, body, retryToken.token);
      return this.unwrap<T>(retry.status, retry.data);
    }
    return this.unwrap<T>(status, data);
  }

  private unwrap<T>(status: number, data: unknown): T {
    const res = data as { ok?: boolean; code?: string; error?: string; data?: T };
    if (status === 200 && res?.ok === true) {
      return res.data as T;
    }
    const code = res?.code || `HTTP_${status}`;
    const msg = res?.error || `request failed status=${status}`;
    throw new BackendError(status, code, msg, res?.data);
  }

  private async request(
    path: string,
    body: unknown,
    token: string | undefined,
  ): Promise<{ status: number; data: unknown }> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }
    const res = await Platform.request({
      url: BACKEND_BASE_URL + path,
      method: 'POST',
      data: body || {},
      headers,
      timeoutMs: BACKEND_REQUEST_TIMEOUT_MS,
    });
    return { status: res.statusCode, data: res.data };
  }

  private loadTokenFromStorage(): StoredToken | null {
    const raw = Platform.getStorageSync(BACKEND_TOKEN_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<StoredToken>;
      if (!parsed.token) {
        return null;
      }
      return {
        token: parsed.token,
        userId: parsed.userId || '',
        platform: parsed.platform || '',
        expiresAt: Number(parsed.expiresAt || 0),
      };
    } catch {
      return null;
    }
  }
}

export const BackendService = new BackendServiceClass();
