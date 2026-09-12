/**
 * 跨宿主本地存储。微信/抖音/Tap 是 (key, value)；
 * 华为 qg 多为 { key, value }，真机还常常没有 StorageSync。
 * 无原生存储时退回适配器覆盖前的宿主 localStorage。
 */

export type HostLocalStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

declare const GameGlobal: { __hostLocalStorage?: HostLocalStorage } | undefined;

const memory = new Map<string, string>();
let loggedVia = '';

function logVia(via: string): void {
  if (loggedVia === via) return;
  loggedVia = via;
  console.log(`[Platform] storage via=${via}`);
}

export function resolveHostLocalStorage(): HostLocalStorage | null {
  try {
    if (typeof GameGlobal !== 'undefined' && GameGlobal?.__hostLocalStorage
      && typeof GameGlobal.__hostLocalStorage.getItem === 'function') {
      return GameGlobal.__hostLocalStorage;
    }
  } catch { /* */ }
  try {
    if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') {
      return localStorage;
    }
  } catch { /* */ }
  return null;
}

function unwrapValue(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw === '' ? null : raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (typeof rec.data === 'string') return rec.data || null;
    if (typeof rec.value === 'string') return rec.value || null;
  }
  return null;
}

export function readHostStorage(
  api: any,
  key: string,
  hostLs: HostLocalStorage | null = resolveHostLocalStorage(),
): string | null {
  if (typeof api?.getStorageSync === 'function') {
    try {
      const wxStyle = unwrapValue(api.getStorageSync(key));
      if (wxStyle != null) {
        logVia('native-sync');
        return wxStyle;
      }
    } catch { /* */ }
    try {
      const qgStyle = unwrapValue(api.getStorageSync({ key }));
      if (qgStyle != null) {
        logVia('qg-sync');
        return qgStyle;
      }
    } catch { /* */ }
  }
  if (hostLs) {
    try {
      const cached = hostLs.getItem(key);
      if (cached) {
        logVia('localStorage');
        return cached;
      }
    } catch { /* */ }
  }
  const mem = memory.get(key);
  if (mem != null) {
    logVia('memory');
    return mem;
  }
  return null;
}

export function writeHostStorage(
  api: any,
  key: string,
  value: string,
  hostLs: HostLocalStorage | null = resolveHostLocalStorage(),
): void {
  memory.set(key, value);
  let nativeOk = false;
  if (typeof api?.setStorageSync === 'function') {
    try {
      api.setStorageSync(key, value);
      nativeOk = true;
    } catch {
      try {
        api.setStorageSync({ key, value });
        nativeOk = true;
      } catch {
        try {
          api.setStorageSync({ key, data: value });
          nativeOk = true;
        } catch { /* */ }
      }
    }
  }
  let lsOk = false;
  if (hostLs) {
    try {
      hostLs.setItem(key, value);
      lsOk = true;
    } catch { /* */ }
  }
  if (nativeOk && lsOk) logVia('native+localStorage');
  else if (nativeOk) logVia('native-sync');
  else if (lsOk) logVia('localStorage');
  else logVia('memory');
}

export function removeHostStorage(
  api: any,
  key: string,
  hostLs: HostLocalStorage | null = resolveHostLocalStorage(),
): void {
  memory.delete(key);
  if (typeof api?.removeStorageSync === 'function') {
    try { api.removeStorageSync(key); } catch { /* */ }
    try { api.removeStorageSync({ key }); } catch { /* */ }
  }
  if (typeof api?.deleteStorageSync === 'function') {
    try { api.deleteStorageSync({ key }); } catch { /* */ }
    try { api.deleteStorageSync(key); } catch { /* */ }
  }
  if (hostLs) {
    try { hostLs.removeItem(key); } catch { /* */ }
  }
}
