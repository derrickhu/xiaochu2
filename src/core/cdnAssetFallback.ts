/**
 * CDN 路径兜底（华为等无 downloadFile / 无 FS 的宿主）
 * 纯函数，便于单测。
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function normalizeLogicalAssetPath(path: string): string {
  return path.replace(/^\/+/, '').replace(/^minigame\//, '');
}

export function mimeFromAssetPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'aac') return 'audio/mp4';
  if (ext === 'ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(n >> 18) & 63];
    out += BASE64_ALPHABET[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[n & 63] : '=';
  }
  return out;
}

export function arrayBufferToDataUrl(buf: ArrayBuffer, mime: string): string {
  return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
}

export function buildCdnUrl(baseUrl: string, filePrefix: string, logicalPath: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const prefix = filePrefix.replace(/^\/+|\/+$/g, '');
  const file = normalizeLogicalAssetPath(logicalPath);
  return `${base}/${prefix}/${file}`;
}

/** 华为 / 部分 JSB 读包内文件时，相对路径对不上，多试几个前缀 */
export function packagePathCandidates(logicalPath: string): string[] {
  const p = normalizeLogicalAssetPath(logicalPath);
  return [p, `/${p}`, `usr/${p}`];
}

export function resolveUserDataPath(api: { env?: { USER_DATA_PATH?: string; userDataPath?: string } } | null | undefined): string {
  return String(api?.env?.USER_DATA_PATH || api?.env?.userDataPath || '');
}

export function imageLoadTimeoutMs(src: string): number {
  if (/^https?:\/\//i.test(src) || src.startsWith('data:')) return 15000;
  return 6000;
}

/**
 * 华为没有 downloadFile 时的加载顺序：
 * 已有内存/磁盘缓存优先；否则 https 直链（createImage 能吃网图），最后才是包内路径。
 */
export function cdnLoadCandidates(input: {
  preferRemote: boolean;
  logicalPath: string;
  remoteUrl: string | null;
  memorySrc: string | null;
  cachePath: string | null;
}): string[] {
  if (input.memorySrc) return [input.memorySrc];
  if (input.cachePath) return [input.cachePath];
  const out: string[] = [];
  if (input.preferRemote && input.remoteUrl) out.push(input.remoteUrl);
  out.push(input.logicalPath);
  if (!input.preferRemote && input.remoteUrl) out.push(input.remoteUrl);
  return [...new Set(out.filter(Boolean))];
}

/**
 * 华为分包资源（pkg-battle 等）官方分类是「随包」，但真机要等 loadSubpackage。
 * 等不到就用 CDN https，避免战斗 HUD 整页缺图。
 */
export function huaweiBundledLoadCandidates(logicalPath: string, remoteUrl: string | null): string[] {
  const local = normalizeLogicalAssetPath(logicalPath);
  return [...new Set([local, remoteUrl].filter(Boolean) as string[])];
}

export function coerceToArrayBuffer(data: unknown): ArrayBuffer | null {
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    const copy = new Uint8Array(view.byteLength);
    copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    return copy.buffer;
  }
  if (typeof data === 'string' && data.length > 0) {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out.buffer;
  }
  return null;
}
