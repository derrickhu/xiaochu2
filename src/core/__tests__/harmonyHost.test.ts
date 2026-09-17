import { describe, expect, it } from 'vitest';
import { isHarmonyOsInfo } from '@/core/PlatformService';

describe('鸿蒙宿主识别', () => {
  it('ohos / HarmonyOS 算鸿蒙', () => {
    expect(isHarmonyOsInfo({ platform: 'ohos' })).toBe(true);
    expect(isHarmonyOsInfo({ platform: 'openHarmony' })).toBe(true);
    expect(isHarmonyOsInfo({ system: 'HarmonyOS 4.2' })).toBe(true);
  });

  it('普通安卓华为不当成鸿蒙', () => {
    expect(isHarmonyOsInfo({ platform: 'android', brand: 'HUAWEI' })).toBe(false);
    expect(isHarmonyOsInfo({ platform: 'ios' })).toBe(false);
    expect(isHarmonyOsInfo(null)).toBe(false);
  });
});
