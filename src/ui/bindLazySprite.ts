/**
 * 通用懒加载贴图绑定（真机 CDN / 分包必备）
 *
 * - 同步 cache 命中立刻上图；否则占位并后台 ensure → load
 * - 订阅 texture:loaded，避免「先失败后下好」UI 不刷新
 * - 返回 cancel，场景销毁 / 重建时必须调用
 */
import * as PIXI from 'pixi.js';
import { ensureAssets } from '@/config/Subpackages';
import { TextureCache } from '@/core/TextureCache';

export interface BindLazySpriteOpts {
  /** 单路径或候选路径（按序尝试） */
  path: string | readonly string[];
  /** loadFirst 成功后写入的别名 key（如 canonical 头像路径） */
  aliasTo?: string;
  /**
   * 绑定前先 ensureAssets（CDN 预下载 + 分包 + 纹理解码）。
   * 点击打开的弹层 / 详情秀场建议 true。
   */
  ensure?: boolean;
  placeholder?: PIXI.Texture;
  onApplied?: (tex: PIXI.Texture) => void;
}

function asPathList(path: string | readonly string[]): string[] {
  return typeof path === 'string' ? [path] : [...path];
}

/**
 * 把逻辑路径异步挂到 Sprite 上。返回取消函数。
 */
export function bindLazySprite(
  sprite: PIXI.Sprite,
  opts: BindLazySpriteOpts,
): () => void {
  let cancelled = false;
  const paths = asPathList(opts.path);
  const watch = new Set(paths);
  if (opts.aliasTo) watch.add(opts.aliasTo);

  if (opts.placeholder) sprite.texture = opts.placeholder;

  const apply = (tex: PIXI.Texture): void => {
    if (cancelled || sprite.destroyed || !tex?.width) return;
    sprite.texture = tex;
    opts.onApplied?.(tex);
  };

  const tryCache = (): boolean => {
    const tex = opts.aliasTo
      ? (TextureCache.get(opts.aliasTo) ?? TextureCache.getFirst(paths))
      : TextureCache.getFirst(paths);
    if (tex?.width) {
      apply(tex);
      return true;
    }
    return false;
  };

  const unsub = TextureCache.onTextureLoaded((loadedPath) => {
    if (cancelled || !watch.has(loadedPath)) return;
    tryCache();
  });

  const kick = async (): Promise<void> => {
    // 已有解码纹理：立刻上图，ensure 只后台补齐（避免真机「已有图仍空一帧再刷」）
    if (tryCache()) {
      if (opts.ensure) {
        void ensureAssets(paths).catch((e) => {
          console.warn('[bindLazySprite] ensureAssets 失败', paths[0], e);
        });
      }
      return;
    }

    if (opts.ensure) {
      await ensureAssets(paths).catch((e) => {
        console.warn('[bindLazySprite] ensureAssets 失败', paths[0], e);
      });
      if (cancelled || sprite.destroyed) return;
      if (tryCache()) return;
    }

    const tex = await TextureCache.loadFirst(paths, opts.aliasTo).catch(() => null);
    if (tex) apply(tex);
  };
  void kick();

  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * 贴图未就绪时先留 fallback，解码完成后把节点挂上。
 * 调用方不要再为了等图把整页拆掉重建。
 */
export function showWhenTexture(
  parent: PIXI.Container,
  path: string,
  create: (tex: PIXI.Texture) => PIXI.DisplayObject,
  fallback?: PIXI.DisplayObject,
  /** 插入层级。底板传 0，避免晚到的图盖住已经画上的内容。 */
  index?: number,
): void {
  const place = (node: PIXI.DisplayObject): void => {
    if (index === undefined) parent.addChild(node);
    else parent.addChildAt(node, Math.min(index, parent.children.length));
  };
  const apply = (tex: PIXI.Texture): void => {
    if (parent.destroyed || !tex.width) return;
    if (fallback && !fallback.destroyed) fallback.visible = false;
    place(create(tex));
  };
  const cached = TextureCache.get(path);
  if (cached?.width) {
    apply(cached);
    return;
  }
  if (fallback) place(fallback);
  const unsub = TextureCache.onTextureLoaded((loaded) => {
    if (loaded !== path) return;
    unsub();
    const tex = TextureCache.get(path);
    if (tex) apply(tex);
  });
  parent.once('destroyed', unsub);
  void TextureCache.load(path).catch(() => null);
}
