/**
 * 把小游戏宿主的 Image 补齐成 Pixi 认得的 HTMLImageElement 契约。
 *
 * Pixi 判断一张图能不能用，全靠 complete / naturalWidth 这两个标准属性，三处都卡：
 *   1. ImageResource 构造：!source.complete 就把 _width/_height 清零 → baseTexture.valid=false
 *   2. ImageResource.load：complete 为假就改挂自己的 onload，而图早就 load 完了，
 *      这个回调永远不会再触发 → update() 永不执行
 *   3. BaseImageResource.upload：!source.complete || naturalWidth===0 直接 return false
 *      → 纹理压根不上传 GPU
 * 微信/抖音的 createImage() 实现了这两个属性，所以那两端一直没事；
 * Tap Android 的宿主 Image 没有，于是图片全部加载成功但一张都上不了屏。
 */

interface ShimState {
  loaded: boolean;
}

const SHIM_FLAG = '__domContractShim';
const SHIM_STATE = '__domContractState';

/** 宿主是否已按标准实现，无需接管 */
function hasNativeContract(img: any): boolean {
  return typeof img.complete === 'boolean' && typeof img.naturalWidth === 'number';
}

/**
 * 补齐 complete / naturalWidth / naturalHeight 三个只读属性。
 *
 * 必须原地改造、返回同一个对象：Pixi 用 `source instanceof HTMLImageElement` 做分支，
 * 换成包装对象会让 instanceof 失效，反而走进更糟的路径。
 *
 * 绝不能碰 onload / onerror：宿主可能在赋值那一刻就把回调登记进原生侧，
 * 用 defineProperty 覆盖 setter 会让它永远收不到回调，图片加载直接挂死。
 * loaded 状态改由加载方在自己的 onload 里调 markImageLoaded 落地。
 *
 * @returns 传入的同一个 img；宿主对象不可扩展时原样返回（此时 shim 无效）
 */
export function shimImageDomContract(img: any): any {
  if (!img || typeof img !== 'object') return img;
  if (img[SHIM_FLAG]) return img;
  if (hasNativeContract(img)) return img;

  const state: ShimState = { loaded: false };

  try {
    Object.defineProperty(img, 'complete', {
      get: () => state.loaded,
      configurable: true,
    });
    Object.defineProperty(img, 'naturalWidth', {
      get: () => (state.loaded ? img.width || 0 : 0),
      configurable: true,
    });
    Object.defineProperty(img, 'naturalHeight', {
      get: () => (state.loaded ? img.height || 0 : 0),
      configurable: true,
    });
    Object.defineProperty(img, SHIM_STATE, {
      value: state,
      configurable: true,
    });
    Object.defineProperty(img, SHIM_FLAG, {
      value: true,
      configurable: true,
    });
  } catch {
    // 宿主 Image 不可扩展，这条路走不通，交给调用方按 shimApplied 兜底
    return img;
  }

  return img;
}

/** 加载方拿到宿主 onload 后调一次，complete / naturalWidth 才会转正 */
export function markImageLoaded(img: any): void {
  const state = img?.[SHIM_STATE] as ShimState | undefined;
  if (state) state.loaded = true;
}

/** shim 是否真的挂上了（宿主对象可能拒绝 defineProperty） */
export function isImageShimApplied(img: any): boolean {
  return !!(img && img[SHIM_FLAG]);
}

/** 纹理能否被 Pixi 上传，等价于 BaseImageResource.upload 的前置判断 */
export function isImageUploadable(img: any): boolean {
  if (!img) return false;
  return !!img.complete && (img.naturalWidth || img.width || 0) > 0;
}
