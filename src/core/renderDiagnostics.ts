/**
 * 渲染崩溃现场取证。
 *
 * Pixi 只在 baseTexture 上读 _batchEnabled（BatchRenderer 读 element._texture.baseTexture，
 * GraphicsGeometry 读 style.texture.baseTexture）。报 "null is not an object" 只有一种成因：
 * 某个 Texture 被 destroy 过——Texture.destroy() 会把 baseTexture 置 null——却还挂在
 * 显示树上参与渲染。光看堆栈定位不到是谁，这里把持有者直接扫出来。
 */
import * as PIXI from 'pixi.js';

const MAX_HITS = 8;
const MAX_DEPTH = 16;

interface DeadHit {
  owner: string;
  where: string;
}

/** texture 存在但 baseTexture 已被摘掉 —— 正是会崩 _batchEnabled 的形态 */
function isDeadTexture(tex: any): boolean {
  return !!tex && !tex.baseTexture;
}

function ownerName(obj: any): string {
  const base = obj?.constructor?.name || 'Unknown';
  const named = obj?.name ? `#${obj.name}` : '';
  const text = typeof obj?.text === 'string' ? `"${String(obj.text).slice(0, 10)}"` : '';
  return `${base}${named}${text}`;
}

function scan(obj: any, hits: DeadHit[], depth: number): void {
  if (!obj || depth > MAX_DEPTH || hits.length >= MAX_HITS) return;

  if (isDeadTexture(obj._texture)) {
    hits.push({ owner: ownerName(obj), where: 'texture' });
  }

  // Graphics：填充/描边的 texture 藏在 geometry 的 batch 里
  const batches = obj?.geometry?.batches;
  if (Array.isArray(batches)) {
    for (const batch of batches) {
      if (isDeadTexture(batch?._texture) || isDeadTexture(batch?.style?.texture)) {
        hits.push({ owner: ownerName(obj), where: 'geometry' });
        break;
      }
    }
  }

  const children = obj.children;
  if (Array.isArray(children)) {
    for (const child of children) scan(child, hits, depth + 1);
  }
}

/** Pixi 的两张共享底图是 Graphics 填充的依赖，坏了会让整棵树画不出来 */
function sharedTextureState(): string {
  let white = 'WHITE=?';
  let empty = 'EMPTY=?';
  try {
    const t = (PIXI.Texture as any).WHITE;
    white = `WHITE=${t?.baseTexture ? (t.baseTexture.valid ? 'valid' : 'invalid') : 'null'}`;
  } catch { /* getter 本身炸了也算信息 */ }
  try {
    const t = (PIXI.Texture as any).EMPTY;
    empty = `EMPTY=${t?.baseTexture ? 'ok' : 'null'}`;
  } catch { /* */ }
  return `${white} ${empty}`;
}

/** 一行摘要，塞进启动诊断弹窗用 */
export function describeRenderFailure(stage: any): string {
  const hits: DeadHit[] = [];
  try {
    scan(stage, hits, 0);
  } catch { /* 取证本身不能再抛 */ }

  const shared = sharedTextureState();
  if (!hits.length) return `deadTex=none ${shared}`;
  return `deadTex=${hits.map((h) => `${h.owner}@${h.where}`).join(',')} ${shared}`;
}

/**
 * JSC 把 "null is not an object (evaluating 'u._batchEnabled')" 这句放在 toString()，
 * e.message 只给 "Type error"。取两者里信息量大的那个。
 */
export function describeError(e: unknown): string {
  const err = e as { name?: string; message?: string; stack?: string } | null;
  const asString = String(e);
  const composed = `${err?.name || 'Error'}: ${err?.message || ''}`;
  const head = asString.length >= composed.length ? asString : composed;
  const stack = err?.stack ? ` @${String(err.stack).split('\n').slice(0, 2).join(' ')}` : '';
  return `${head}${stack}`.slice(0, 220);
}

