/**
 * 自定义字体资源（可商用开源，SIL OFL 1.1）
 *
 * - 展示书法：马善政毛笔楷书（宠名 / 技名 / CTA）
 * - 正文楷体：霞鹜文楷（技能说明等长文）
 * 工程内均为子集包，放在随包分包 pkg-shop（非 CDN），避免撑爆主包 4MB。
 * 全量源在 fonts_tmp/（gitignore）
 */
import { SUBPACKAGE_ROOT } from '@/config/Subpackages';

export interface CustomFontDef {
  family: string;
  path: string;
  webUrl: string;
}

const FONT_ROOT = `${SUBPACKAGE_ROOT.shop}/fonts`;

export const CALLIGRAPHY_FONT: CustomFontDef = {
  family: 'MaShanZheng',
  path: `${FONT_ROOT}/MaShanZheng-Subset.ttf`,
  webUrl: '/fonts/MaShanZheng-Subset.ttf',
};

export const BODY_FONT: CustomFontDef = {
  family: 'LXGWWenKai',
  path: `${FONT_ROOT}/LXGWWenKai-Subset.ttf`,
  webUrl: '/fonts/LXGWWenKai-Subset.ttf',
};
