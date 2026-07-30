#!/usr/bin/env node
/**
 * 从公开 CDN URL 探测 + 本地扫描，重建完整 manifest。
 * （修复 strip 后增量上传误把清单覆写成残缺集）
 *
 * 用法：
 *   node scripts/repair_cdn_manifest.mjs --dry-run
 *   node scripts/repair_cdn_manifest.mjs
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { PROJECT_ROOT, loadUploadEnv } from './loadEnv.js';
import { collectExpectedCdnPaths } from './cdn_scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src', 'config', 'CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf-8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

const cfg = loadCdnConfig();
const env = loadUploadEnv();
const BUCKET = env.cloudBucket || cfg.cloudBucket;
const SECRET_ID = env.tencentSecretId;
const SECRET_KEY = env.tencentSecretKey;
const REGION = env.tencentRegion || 'ap-shanghai';
const CDN_FILE_PREFIX = cfg.filePrefix;
const CDN_BASE_URL = (env.cdnBaseUrl || cfg.baseUrl || '').replace(/\/+$/, '');
const IGNORE = new Set(['manifest.json', 'game.js', '.DS_Store', 'Thumbs.db']);

function hmacSha1Hex(key, input) {
  return crypto.createHmac('sha1', key).update(input).digest('hex');
}
function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}
function md5File8(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex').slice(0, 8);
}
function encodePathname(p) {
  return p.split('/').map((seg) => encodeURIComponent(seg)).join('/');
}

/** 与 upload_cdn.js 一致的签名（PUT/GET 对象，无 query） */
function cosAuth({ method, host, uri }) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 3600}`;
  const signKey = hmacSha1Hex(SECRET_KEY, keyTime);
  const httpString = `${method.toLowerCase()}\n${uri}\n\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    'q-header-list=host',
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
}

function requestRaw(opts) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('timeout')));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function headCdn(relPath) {
  const url = new URL(`${CDN_BASE_URL}/${CDN_FILE_PREFIX}/${relPath}`);
  return new Promise((resolve) => {
    const req = https.request({
      method: 'HEAD',
      hostname: url.hostname,
      path: url.pathname,
      headers: { Host: url.hostname },
    }, (res) => {
      resolve({
        ok: res.statusCode >= 200 && res.statusCode < 300,
        size: Number(res.headers['content-length'] || 0),
        etag: String(res.headers.etag || '').replace(/"/g, ''),
      });
      res.resume();
    });
    req.on('error', () => resolve({ ok: false, size: 0, etag: '' }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ ok: false, size: 0, etag: '' });
    });
    req.end();
  });
}

function walkLocal(dir, remotePrefix, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (IGNORE.has(name)) continue;
    const full = path.join(dir, name);
    const remote = remotePrefix ? `${remotePrefix}/${name}` : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) walkLocal(full, remote, out);
    else out[remote] = { hash: md5File8(full), size: st.size, local: full };
  }
}

function scanLocal() {
  const out = {};
  for (const dir of cfg.cdnDirs || []) {
    walkLocal(path.join(PROJECT_ROOT, 'minigame', dir), dir, out);
  }
  return out;
}

/** 本地 + 源码期望 + 旧清单 / 探测缓存 → COS HEAD 候选 */
function buildProbeCandidates(local) {
  const set = new Set(Object.keys(local));
  for (const k of collectExpectedCdnPaths(cfg)) set.add(k);

  const probeFile = path.join(__dirname, '_cdn_probe_paths.json');
  if (fs.existsSync(probeFile)) {
    try {
      for (const k of JSON.parse(fs.readFileSync(probeFile, 'utf-8'))) {
        if (typeof k === 'string' && !k.includes('${')) set.add(k);
      }
    } catch { /* ignore */ }
  }
  const localManifest = path.join(__dirname, '.cdn_manifest.json');
  if (fs.existsSync(localManifest)) {
    try {
      const m = JSON.parse(fs.readFileSync(localManifest, 'utf-8'));
      for (const k of Object.keys(m.files || {})) set.add(k);
    } catch { /* ignore */ }
  }
  return [...set].sort();
}

async function mapPool(items, concurrency, worker) {
  const ret = new Array(items.length);
  let i = 0;
  async function run() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return ret;
}

async function putManifest(localPath) {
  const host = `${BUCKET}.cos.${REGION}.myqcloud.com`;
  const objectPath = `${CDN_FILE_PREFIX}/manifest.json`;
  const uri = `/${encodePathname(objectPath)}`;
  const body = fs.readFileSync(localPath);
  const authorization = cosAuth({ method: 'PUT', host, uri });
  const res = await requestRaw({
    hostname: host,
    path: uri,
    method: 'PUT',
    headers: {
      Host: host,
      Authorization: authorization,
      'Content-Type': 'application/json',
      'Content-Length': body.length,
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    },
    body,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`上传 manifest 失败 ${res.statusCode}: ${res.body.toString('utf8').slice(0, 200)}`);
  }
}

async function fetchRemoteVersion() {
  try {
    const url = new URL(`${CDN_BASE_URL}/${CDN_FILE_PREFIX}/manifest.json`);
    const res = await requestRaw({
      hostname: url.hostname,
      path: url.pathname,
      method: 'GET',
      headers: { Host: url.hostname },
    });
    if (res.statusCode !== 200) return 0;
    return Number(JSON.parse(res.body.toString('utf-8'))?.version || 0);
  } catch {
    return 0;
  }
}

async function main() {
  if (!SECRET_ID || !SECRET_KEY) throw new Error('缺少腾讯云密钥');
  if (!CDN_BASE_URL) throw new Error('缺少 CDN baseUrl');

  console.log('=== 重建 CDN manifest（探测 COS 公开对象）===');
  const local = scanLocal();
  console.log(`本地扫描: ${Object.keys(local).length}`);

  const candidates = buildProbeCandidates(local);
  console.log(`探测候选: ${candidates.length}`);

  let ok = 0;
  let miss = 0;
  const files = {};
  await mapPool(candidates, 12, async (rel) => {
    if (local[rel]) {
      files[rel] = { hash: local[rel].hash, size: local[rel].size };
      ok++;
      return;
    }
    const head = await headCdn(rel);
    if (head.ok) {
      const hash = (head.etag || '').replace(/[^a-f0-9]/gi, '').slice(0, 8) || 'cos';
      files[rel] = { hash, size: head.size };
      ok++;
    } else {
      miss++;
    }
  });

  const oldVersion = await fetchRemoteVersion();
  const manifest = {
    version: oldVersion + 1,
    updated: new Date().toISOString(),
    filePrefix: CDN_FILE_PREFIX,
    files,
  };

  console.log(`命中: ${ok}, 未命中: ${miss}, 清单条目: ${Object.keys(files).length}`);
  console.log(`pet_019 立绘: ${!!files['subpackages/pkg-enemy-cr/images/enemy/pet_019.png']}`);
  console.log(`pet_019 头像: ${!!files['subpackages/pkg-pet/images/pet/pet_019.png']}`);

  const outLocal = path.join(__dirname, '.cdn_manifest.json');
  fs.writeFileSync(outLocal, JSON.stringify(manifest, null, 2), 'utf-8');

  if (DRY_RUN) {
    console.log('dry-run：未上传 manifest');
    return;
  }

  const tmp = path.join(__dirname, '_tmp_cdn_manifest.json');
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf-8');
  try {
    await putManifest(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
  console.log(`=== 完成：manifest v${manifest.version} 已上传 ===`);
  console.log('请杀进程重进小游戏（或清 CDN 缓存）后再看立绘');
}

main().catch((e) => {
  console.error('repair 失败:', e.message || e);
  process.exit(1);
});
