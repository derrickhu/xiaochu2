#!/usr/bin/env node
/**
 * 华为原生 qg 没有 downloadFile / request / getFileSystemManager。
 * 微信走 CDN 的 pkg-scene 大图在真机上既下不下来、也探测不到包内文件。
 * 组装华为包时把缺失的场景图拉进 rpk（缓存到 scripts/.cdn_asset_cache）。
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const CACHE_DIR = path.join(PROJECT_ROOT, 'scripts/.cdn_asset_cache');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'scripts/.cdn_manifest.json');
const CONCURRENCY = 6;

/** 与 CDN_CONFIG.huaweiEmbeddedDirs 同一真源；解析不到再退回场景图 */
function embeddedPrefixes(cfg) {
  const dirs = (cfg.huaweiEmbeddedDirs || []).length
    ? cfg.huaweiEmbeddedDirs
    : ['subpackages/pkg-scene/images'];
  return dirs.map((d) => (d.endsWith('/') ? d : `${d}/`));
}

const MUST_HAVE = [
  'subpackages/pkg-scene/images/bg/scene_realm.jpg',
  'subpackages/pkg-scene/images/ui/plaque/scene_title.png',
  'subpackages/pkg-scene/images/ui/realm/realm_orb_wood.png',
  'subpackages/pkg-scene/images/ui/realm/realm_orb_metal.png',
  'subpackages/pkg-scene/images/ui/realm/realm_orb_water.png',
  'subpackages/pkg-scene/images/ui/realm/realm_orb_earth.png',
  'subpackages/pkg-scene/images/ui/realm/realm_orb_fire.png',
  'subpackages/pkg-scene/images/ui/realm/realm_diff_selected.png',
  'subpackages/pkg-scene/images/ui/realm/realm_diff_idle.png',
  'subpackages/pkg-scene/images/ui/tower/tower_btn_cta.png',
];

function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src/config/CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

function loadManifestFiles() {
  if (!fs.existsSync(MANIFEST_PATH)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return raw.files && typeof raw.files === 'object' ? raw.files : {};
  } catch {
    return {};
  }
}

function collectLogicalPaths(files, prefixes) {
  const out = new Set(MUST_HAVE);
  for (const key of Object.keys(files)) {
    if (prefixes.some((p) => key.startsWith(p))) out.add(key);
  }
  return [...out];
}

function buildCdnUrl(cfg, logicalPath) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  const prefix = String(cfg.filePrefix || '').replace(/^\/+|\/+$/g, '');
  return `${base}/${prefix}/${logicalPath.replace(/^\/+/, '')}`;
}

function sameSize(filePath, expected) {
  if (!expected || !fs.existsSync(filePath)) return false;
  try {
    return fs.statSync(filePath).size === expected;
  } catch {
    return false;
  }
}

async function downloadTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.xiaochu2-tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
  return buf.length;
}

async function mapLimit(items, limit, worker) {
  const ret = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return ret;
}

export async function embedHuaweiCdnAssets(outDir) {
  const cfg = loadCdnConfig();
  if (!cfg.baseUrl) {
    console.warn('[embed-huawei-cdn] 无 baseUrl，跳过');
    return { copied: 0, downloaded: 0, skipped: 0, failed: 0 };
  }
  const files = loadManifestFiles();
  const paths = collectLogicalPaths(files, embeddedPrefixes(cfg));
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const stats = { copied: 0, downloaded: 0, skipped: 0, failed: 0 };
  await mapLimit(paths, CONCURRENCY, async (logicalPath) => {
    const dest = path.join(outDir, logicalPath);
    const expected = Number(files[logicalPath]?.size || 0);
    if (sameSize(dest, expected) || (fs.existsSync(dest) && !expected)) {
      stats.skipped += 1;
      return;
    }
    const cachePath = path.join(CACHE_DIR, logicalPath);
    try {
      if (!sameSize(cachePath, expected)) {
        const url = buildCdnUrl(cfg, logicalPath);
        await downloadTo(url, cachePath);
        stats.downloaded += 1;
      } else {
        stats.copied += 1;
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(cachePath, dest);
    } catch (e) {
      stats.failed += 1;
      console.warn(`[embed-huawei-cdn] 失败 ${logicalPath}:`, e instanceof Error ? e.message : e);
    }
  });

  console.log(
    `[embed-huawei-cdn] dest=${path.relative(PROJECT_ROOT, outDir)} `
    + `files=${paths.length} skip=${stats.skipped} cache=${stats.copied} `
    + `dl=${stats.downloaded} fail=${stats.failed}`,
  );
  if (stats.failed > 0 && MUST_HAVE.some((p) => !fs.existsSync(path.join(outDir, p)))) {
    throw new Error('华为包缺少秘境关键图，CDN 拉取失败');
  }
  return stats;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dest = path.resolve(process.argv[2] || path.join(PROJECT_ROOT, 'build/huawei'));
  embedHuaweiCdnAssets(dest).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
