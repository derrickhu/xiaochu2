const { requireUser } = require('./auth');
const { httpError } = require('./http');
const { getDb, getCollection, getRankCollection } = require('./db');

const NAME_MAX = 24;
const AVATAR_MAX = 512;
const LIST_MAX = 10;

function parseFloor(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function extractTowerFloor(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 0;
  for (const raw of Object.values(payload)) {
    if (typeof raw !== 'string' || raw.indexOf('bestFloor') < 0) continue;
    try {
      const save = JSON.parse(raw);
      const floor = parseFloor(save && save.tower && save.tower.bestFloor);
      if (floor > 0) return floor;
    } catch (_) { /* 存档坏了就走正则 */ }
    const match = raw.match(/"bestFloor"\s*:\s*(\d+)/);
    if (match) {
      const floor = parseFloor(match[1]);
      if (floor > 0) return floor;
    }
  }
  return 0;
}

function sanitizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

function sanitizeAvatar(url) {
  const value = String(url || '').trim();
  if (!/^https?:\/\//i.test(value)) return '';
  return value.slice(0, AVATAR_MAX);
}

function fallbackName(userId) {
  const tail = String(userId || '').replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return tail ? `仙灵${tail}` : '玩家';
}

async function findRankDoc(userId, platform) {
  const col = getRankCollection(platform);
  const existingRes = await col.where({ userId }).limit(1).get();
  const existing = existingRes && Array.isArray(existingRes.data) ? existingRes.data[0] : null;
  return { col, existing };
}

async function removeTowerRank(userId, platform) {
  if (!userId) return false;
  const { col, existing } = await findRankDoc(userId, platform);
  if (!existing || !existing._id) return false;
  await col.doc(existing._id).remove();
  return true;
}

async function upsertTowerRank(userId, platform, row) {
  const floor = parseFloor(row && row.floor);
  if (!userId) return false;
  if (floor <= 0) return removeTowerRank(userId, platform);
  const { col, existing } = await findRankDoc(userId, platform);
  const now = Date.now();
  const name = sanitizeName(row && row.name) || (existing && existing.name) || fallbackName(userId);
  const avatarUrl = sanitizeAvatar(row && row.avatarUrl) || (existing && existing.avatarUrl) || '';
  const doc = {
    userId,
    platform,
    floor,
    name,
    avatarUrl,
    updatedAt: now,
  };
  if (existing && existing._id) {
    await col.doc(existing._id).update(doc);
    return true;
  }
  await col.add(doc);
  return true;
}

async function upsertFromPayload(userId, platform, payload, profile) {
  const floor = extractTowerFloor(payload);
  return upsertTowerRank(userId, platform, {
    floor,
    name: profile && profile.name,
    avatarUrl: profile && profile.avatarUrl,
  });
}

async function handleReport(req) {
  const { userId, platform } = requireUser(req);
  const body = req.body || {};
  const floor = parseFloor(body.floor);
  await upsertTowerRank(userId, platform, {
    floor,
    name: body.name,
    avatarUrl: body.avatarUrl,
  });
  return { ok: true, floor, removed: floor <= 0 };
}

function toRankRow(doc, rank, userId) {
  return {
    rank,
    name: sanitizeName(doc.name) || fallbackName(doc.userId),
    floor: parseFloor(doc.floor),
    avatarUrl: sanitizeAvatar(doc.avatarUrl),
    isSelf: !!userId && doc.userId === userId,
  };
}

/** 掉出前 N 的自己也要能看到名次：比我高的人数 + 1 */
async function resolveSelfRow(col, userId) {
  const selfRes = await col.where({ userId }).limit(1).get();
  const doc = selfRes && Array.isArray(selfRes.data) ? selfRes.data[0] : null;
  const floor = parseFloor(doc && doc.floor);
  if (!doc || floor <= 0) return null;
  const aheadRes = await col.where({ floor: getDb().command.gt(floor) }).count();
  const ahead = Number(aheadRes && aheadRes.total) || 0;
  return toRankRow(doc, ahead + 1, userId);
}

async function handleList(req) {
  const { userId, platform } = requireUser(req);
  const limit = Math.min(LIST_MAX, Math.max(1, Number((req.body || {}).limit) || LIST_MAX));
  try {
    const col = getRankCollection(platform);
    const res = await col.orderBy('floor', 'desc').limit(limit).get();
    const items = ((res && res.data) || [])
      .map((doc, i) => toRankRow(doc, i + 1, userId))
      .filter((row) => row.floor > 0);
    const self = items.find((row) => row.isSelf) || await resolveSelfRow(col, userId);
    return { items, self: self || null };
  } catch (error) {
    const msg = String((error && error.message) || error || '');
    if (/not exist|ResourceNotFound|Db or Table not exist/i.test(msg)) {
      return { items: [], self: null };
    }
    throw error;
  }
}

async function handleBackfill(req) {
  if (req.raw && req.raw.httpMethod) {
    throw httpError(403, 'FORBIDDEN', 'backfill 不能走网关');
  }
  const body = req.body || {};
  const platform = String(body.platform || 'dy');
  const offset = Math.max(0, Number(body.offset) || 0);
  const limit = Math.min(200, Math.max(20, Number(body.limit) || 120));
  const col = getCollection(platform);
  const res = await col.skip(offset).limit(limit).get();
  const docs = (res && res.data) || [];
  let wrote = 0;
  let skipped = 0;
  for (const doc of docs) {
    const floor = extractTowerFloor(doc.payload);
    if (floor <= 0 || !doc.userId) {
      skipped += 1;
      continue;
    }
    await upsertTowerRank(doc.userId, platform, { floor });
    wrote += 1;
  }
  return {
    platform,
    offset,
    scanned: docs.length,
    wrote,
    skipped,
    nextOffset: docs.length < limit ? null : offset + docs.length,
    done: docs.length < limit,
  };
}

module.exports = {
  extractTowerFloor,
  upsertTowerRank,
  removeTowerRank,
  upsertFromPayload,
  handleReport,
  handleList,
  handleBackfill,
};
