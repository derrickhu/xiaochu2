/**
 * 鸿蒙微信的 createCanvas / createImage 不是 HTMLCanvasElement / HTMLImageElement。
 * Pixi 只认 instanceof，对不上就在 Texture.from 抛
 * “Unrecognized source type to auto-detect Resource”，启动 Loading 的第一行字就会把整局打崩。
 * 标准 instanceof 仍优先；对不上时再看有没有 getContext / src。
 */
import { CanvasResource, ImageResource } from '@pixi/core';

export function isHostCanvasSource(source: unknown): boolean {
  if (!source || typeof source !== 'object') return false;
  return typeof (source as { getContext?: unknown }).getContext === 'function';
}

export function isHostImageSource(source: unknown): boolean {
  if (!source || typeof source !== 'object' || isHostCanvasSource(source)) return false;
  const img = source as { src?: unknown; onload?: unknown; complete?: unknown; width?: unknown };
  if (typeof img.src !== 'string') return false;
  return 'onload' in img || typeof img.complete === 'boolean' || typeof img.width === 'number';
}

let installed = false;

export function installHostResourceDetect(): void {
  if (installed) return;
  installed = true;

  const canvasProto = CanvasResource as unknown as {
    test: (source: unknown) => boolean;
  };
  const origCanvas = canvasProto.test.bind(CanvasResource);
  canvasProto.test = (source: unknown) => origCanvas(source) || isHostCanvasSource(source);

  const imageProto = ImageResource as unknown as {
    test: (source: unknown, extension?: string) => boolean;
  };
  const origImage = imageProto.test.bind(ImageResource);
  imageProto.test = (source: unknown, extension?: string) => (
    origImage(source, extension) || isHostImageSource(source)
  );
}
