import { describe, expect, it } from 'vitest';
import {
  arrayBufferToBase64,
  arrayBufferToDataUrl,
  buildCdnUrl,
  coerceToArrayBuffer,
  huaweiBundledLoadCandidates,
  imageLoadTimeoutMs,
  mimeFromAssetPath,
  normalizeLogicalAssetPath,
  packagePathCandidates,
  resolveUserDataPath,
  cdnLoadCandidates,
} from '@/core/cdnAssetFallback';

describe('cdnAssetFallback', () => {
  it('归一化逻辑路径', () => {
    expect(normalizeLogicalAssetPath('/minigame/subpackages/pkg-scene/images/a.png'))
      .toBe('subpackages/pkg-scene/images/a.png');
  });

  it('按扩展名猜 MIME', () => {
    expect(mimeFromAssetPath('a/b/scene_realm.jpg')).toBe('image/jpeg');
    expect(mimeFromAssetPath('realm_orb_wood.png')).toBe('image/png');
    expect(mimeFromAssetPath('bgm/main.mp3')).toBe('audio/mpeg');
  });

  it('ArrayBuffer 转 data URL', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
    expect(arrayBufferToBase64(bytes)).toBe('iVBORw==');
    expect(arrayBufferToDataUrl(bytes, 'image/png')).toBe('data:image/png;base64,iVBORw==');
  });

  it('拼 CDN URL', () => {
    expect(buildCdnUrl(
      'https://example.com/',
      'petTower/assets_cdn',
      'subpackages/pkg-scene/images/bg/scene_realm.jpg',
    )).toBe('https://example.com/petTower/assets_cdn/subpackages/pkg-scene/images/bg/scene_realm.jpg');
  });

  it('包内路径候选', () => {
    expect(packagePathCandidates('subpackages/pkg-scene/images/a.png')).toEqual([
      'subpackages/pkg-scene/images/a.png',
      '/subpackages/pkg-scene/images/a.png',
      'usr/subpackages/pkg-scene/images/a.png',
    ]);
  });

  it('USER_DATA_PATH 只认宿主 env，不瞎编', () => {
    expect(resolveUserDataPath(null)).toBe('');
    expect(resolveUserDataPath({ env: { USER_DATA_PATH: 'internal://files' } })).toBe('internal://files');
  });

  it('远程图超时更长', () => {
    expect(imageLoadTimeoutMs('subpackages/pkg-scene/images/a.png')).toBe(6000);
    expect(imageLoadTimeoutMs('https://cdn.example/a.png')).toBe(15000);
    expect(imageLoadTimeoutMs('data:image/png;base64,xx')).toBe(15000);
  });

  it('华为优先 https，再包内', () => {
    expect(cdnLoadCandidates({
      preferRemote: true,
      logicalPath: 'subpackages/pkg-scene/images/a.png',
      remoteUrl: 'https://cdn.example/a.png',
      memorySrc: null,
      cachePath: null,
    })).toEqual([
      'https://cdn.example/a.png',
      'subpackages/pkg-scene/images/a.png',
    ]);
  });

  it('已打进包的目录先读本地，再退 https', () => {
    expect(cdnLoadCandidates({
      preferRemote: false,
      logicalPath: 'subpackages/pkg-scene/images/a.png',
      remoteUrl: 'https://cdn.example/a.png',
      memorySrc: null,
      cachePath: null,
    })).toEqual([
      'subpackages/pkg-scene/images/a.png',
      'https://cdn.example/a.png',
    ]);
  });

  it('已有 data URL 缓存不再走网', () => {
    expect(cdnLoadCandidates({
      preferRemote: true,
      logicalPath: 'a.png',
      remoteUrl: 'https://cdn.example/a.png',
      memorySrc: 'data:image/png;base64,xx',
      cachePath: null,
    })).toEqual(['data:image/png;base64,xx']);
  });

  it('华为随包资源本地失败后还能走 CDN', () => {
    expect(huaweiBundledLoadCandidates(
      'subpackages/pkg-battle/images/ui/battle/battle_pet_star.png',
      'https://cdn.example/petTower/assets_cdn/subpackages/pkg-battle/images/ui/battle/battle_pet_star.png',
    )).toEqual([
      'subpackages/pkg-battle/images/ui/battle/battle_pet_star.png',
      'https://cdn.example/petTower/assets_cdn/subpackages/pkg-battle/images/ui/battle/battle_pet_star.png',
    ]);
  });

  it('把 TypedArray / 二进制串收成 ArrayBuffer', () => {
    const view = new Uint8Array([1, 2, 3]);
    const fromView = coerceToArrayBuffer(view);
    expect(fromView).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(fromView!).join(',')).toBe('1,2,3');

    const fromStr = coerceToArrayBuffer('\x01\x02');
    expect(new Uint8Array(fromStr!).join(',')).toBe('1,2');
  });
});
