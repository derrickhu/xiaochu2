/**
 * 音频资源路径（相对 minigame 根目录，位于 pkg-audio 分包）
 */
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

export const AUDIO = {
  mainBgm: `${SUBPACKAGE_ROOT.audio}/audio/bgm.mp3`,
} as const;
