/**
 * 排行榜上的「自己」：宿主平台头像 / 昵称。
 * 拿到之后随层数一起上报云榜，别人才能在榜上看到真名真头像。
 */
import { Platform } from '@/core/PlatformService';
import type { RankEntry } from './rankBoard';

const CACHE_KEY = 'xc2.rank.hostProfile';

export interface HostProfile {
  name: string;
  avatarUrl: string;
}

/** 未拿到平台资料时的首页占位 */
export const HOME_GUEST_NAME = '仙灵小萌新';

export function resolveHomeIdentity(
  profile: HostProfile | null = readCachedHostProfile(),
): { name: string; avatarUrl: string | null } {
  const name = profile?.name?.trim();
  const avatarUrl = profile?.avatarUrl?.trim();
  return {
    name: name || HOME_GUEST_NAME,
    avatarUrl: avatarUrl || null,
  };
}

/** 微信未授权时的占位昵称，不能当成真实资料落盘 */
const PLACEHOLDER_NICKS = new Set(['微信用户']);

/**
 * 平台回包里的昵称 / 头像。占位「微信用户」或两边都空则丢掉。
 * 只有头像没有昵称时仍收下头像，名字留空，展示层再退回萌新。
 */
export function acceptHostProfile(name: string, avatarUrl: string): HostProfile | null {
  const nick = name.trim();
  const avatar = avatarUrl.trim();
  if (PLACEHOLDER_NICKS.has(nick)) return null;
  const nickOk = nick.length > 0;
  const avatarOk = avatar.length >= 4;
  if (!nickOk && !avatarOk) return null;
  return {
    name: nickOk ? nick : '',
    avatarUrl: avatarOk ? avatar : '',
  };
}

export function parseHostProfile(raw: unknown): HostProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const name = String(rec.name ?? rec.nickName ?? '').trim();
  const avatarUrl = String(rec.avatarUrl ?? '').trim();
  return acceptHostProfile(name, avatarUrl);
}

export function readCachedHostProfile(): HostProfile | null {
  const raw = Platform.getStorageSync(CACHE_KEY);
  if (!raw) return null;
  try {
    return parseHostProfile(JSON.parse(String(raw)));
  } catch {
    return parseHostProfile(raw);
  }
}

export function rememberHostProfile(profile: HostProfile): void {
  Platform.setStorageSync(CACHE_KEY, JSON.stringify({
    name: profile.name,
    avatarUrl: profile.avatarUrl,
  }));
}

export function applyHostProfile(
  entry: RankEntry | null,
  profile: HostProfile | null,
): RankEntry | null {
  if (!entry || !profile) return entry;
  return {
    ...entry,
    name: profile.name || entry.name,
    avatarUrl: profile.avatarUrl || entry.avatarUrl,
  };
}

export async function ensureHostProfile(): Promise<HostProfile | null> {
  const cached = readCachedHostProfile();
  if (!Platform.isDouyin && !Platform.isWechat) return cached;
  if (Platform.isDouyin) {
    const loggedIn = await Platform.ensureLogin();
    if (!loggedIn) return cached;
  }
  const live = await Platform.getUserProfile();
  if (!live) return cached;
  const accepted = acceptHostProfile(live.nickName, live.avatarUrl);
  if (!accepted) return cached;
  const profile: HostProfile = {
    name: accepted.name || cached?.name || '',
    avatarUrl: accepted.avatarUrl || cached?.avatarUrl || '',
  };
  if (!profile.name && !profile.avatarUrl) return cached;
  rememberHostProfile(profile);
  return profile;
}
