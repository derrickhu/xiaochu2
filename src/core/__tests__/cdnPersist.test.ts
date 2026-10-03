import { describe, expect, it } from 'vitest';
import { CDN_CONFIG } from '@/config/CdnConfig';
import {
  isFileQuotaError,
  isMissingPathError,
  isWxTempPath,
  playableInnerAudioSrc,
  shouldDropCurrentCdnCache,
  shouldPersistCdnPath,
  toInnerAudioSrc,
} from '@/core/CdnAssetService';

describe('CDN 落盘额度', () => {
  it('缓存根已换代，旧 v1 整包会被丢掉', () => {
    expect(CDN_CONFIG.cacheRootName).toBe('cdn_cache_v2');
  });

  it('能认出微信本地存储写满', () => {
    expect(isFileQuotaError(new Error(
      'copyFileSync:fail the maximum size of the file storage limit is exceeded',
    ))).toBe(true);
    expect(isFileQuotaError({ errMsg: 'writeFile:fail storage limit' })).toBe(true);
    expect(isFileQuotaError(new Error('downloadFile status=404'))).toBe(false);
  });

  it('能认出清空缓存后目录没了', () => {
    expect(isMissingPathError(new Error(
      'copyFileSync:fail no such file or directory http://usr/cdn_cache_v1/subpackages/pkg-scene/images/bg/battle_wood.jpg',
    ))).toBe(true);
    expect(isMissingPathError({ errMsg: 'copyFileSync:fail the filePath is not exist' })).toBe(true);
    expect(isMissingPathError(new Error('copyFileSync:fail storage limit'))).toBe(false);
  });

  it('有旧代、当前代过多、或额度兜底时删当前代', () => {
    expect(shouldDropCurrentCdnCache({ forceCurrent: false, hadLegacy: true, currentCount: 0 })).toBe(true);
    expect(shouldDropCurrentCdnCache({ forceCurrent: false, hadLegacy: false, currentCount: 81 })).toBe(true);
    expect(shouldDropCurrentCdnCache({ forceCurrent: true, hadLegacy: false, currentCount: 1 })).toBe(true);
    expect(shouldDropCurrentCdnCache({ forceCurrent: false, hadLegacy: false, currentCount: 80 })).toBe(false);
  });

  it('图和 BGM 都要落盘，临时路径不能给 InnerAudio', () => {
    expect(shouldPersistCdnPath('subpackages/pkg-audio/bgm/bgm.mp3')).toBe(true);
    expect(shouldPersistCdnPath('subpackages/pkg-scene/images/bg/battle_wood.jpg')).toBe(true);
    expect(isWxTempPath('http://tmp/AZrWJ5wULHMN222ef8560cc65d5c51e5209dae0fea02.jpg')).toBe(true);
    expect(isWxTempPath('wxfile://tmp/abc.mp3')).toBe(true);
    expect(isWxTempPath('http://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/bgm.mp3')).toBe(false);
  });

  it('模拟器 http://usr 不能给 InnerAudio，要走 HTTPS', () => {
    const cdn = 'https://cdn.example/petTower/assets_cdn/subpackages/pkg-audio/bgm/bgm.mp3';
    expect(playableInnerAudioSrc('http://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/bgm.mp3', cdn))
      .toBe(cdn);
    expect(playableInnerAudioSrc('http://tmp/bgm.mp3', cdn)).toBe(cdn);
    expect(playableInnerAudioSrc('wxfile://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/bgm.mp3', cdn, () => false))
      .toBe(cdn);
    expect(playableInnerAudioSrc('wxfile://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/bgm.mp3', cdn, () => true))
      .toBe('wxfile://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/bgm.mp3');
    expect(playableInnerAudioSrc(cdn, cdn)).toBe(cdn);
    expect(toInnerAudioSrc('http://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/battle_bgm.mp3'))
      .toBe('wxfile://usr/cdn_cache_v2/subpackages/pkg-audio/bgm/battle_bgm.mp3');
  });
});
