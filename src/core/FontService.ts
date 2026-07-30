/**
 * 自定义字体加载（书法展示体 + 正文楷体）
 *
 * 小游戏：Platform.loadFont / loadFontFace
 * 浏览器：注入 @font-face（开发预览）
 */
import { BODY_FONT, CALLIGRAPHY_FONT, type CustomFontDef } from '@/config/Fonts';
import { loadSubpackagesForPaths } from '@/config/Subpackages';
import { Platform } from '@/core/PlatformService';

const ready = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function injectWebFontFace(def: CustomFontDef): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const id = `xiaochu2-font-${def.family}`;
  if (!document.getElementById(id)) {
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
@font-face {
  font-family: '${def.family}';
  src: url('${def.webUrl}') format('truetype');
  font-weight: normal;
  font-style: normal;
}
`;
    document.head.appendChild(style);
  }
  if (document.fonts) {
    return document.fonts
      .load(`16px ${def.family}`)
      .then(() => def.family)
      .catch(() => def.family);
  }
  return Promise.resolve(def.family);
}

async function loadOne(def: CustomFontDef, label: string): Promise<string | null> {
  const cached = ready.get(def.family);
  if (cached) return cached;
  const pending = inflight.get(def.family);
  if (pending) return pending;

  const job = (async () => {
    try {
      let family: string | null = null;
      if (Platform.isMinigame) {
        // 字体在 pkg-shop（随包分包），须先 loadSubpackage 再 loadFont
        await loadSubpackagesForPaths([def.path]);
        family = await Platform.loadFont(def.path, def.family);
      } else {
        family = await injectWebFontFace(def);
      }
      if (family) {
        ready.set(def.family, family);
        console.log(`[Font] ${label}就绪: ${family}`);
      } else {
        console.warn(`[Font] ${label}未加载`);
      }
      return family;
    } catch (e) {
      console.warn(`[Font] ${label}预热失败`, e);
      return null;
    } finally {
      inflight.delete(def.family);
    }
  })();

  inflight.set(def.family, job);
  return job;
}

export function getCalligraphyFamily(): string | null {
  return ready.get(CALLIGRAPHY_FONT.family) ?? null;
}

export function getBodyFontFamily(): string | null {
  return ready.get(BODY_FONT.family) ?? null;
}

export function warmupCalligraphyFont(): Promise<string | null> {
  return loadOne(CALLIGRAPHY_FONT, '书法体');
}

export function warmupBodyFont(): Promise<string | null> {
  return loadOne(BODY_FONT, '正文楷体');
}

/** 展示体 + 正文一并后台预热 */
export function warmupCustomFonts(): Promise<void> {
  return Promise.all([warmupCalligraphyFont(), warmupBodyFont()]).then(() => undefined);
}
