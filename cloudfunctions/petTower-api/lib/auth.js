const jwt = require('jsonwebtoken');
const { httpError } = require('./http');
const {
  getGameKey,
  gameKeyUpper,
  getJwtSecret: readJwtSecret,
  getTtlSec,
  getPlatformCredential,
} = require('./config');

const SUPPORTED_PLATFORMS = new Set(['wx', 'dy', 'tap', 'anon']);

function getJwtSecret() {
  const secret = readJwtSecret();
  if (!secret) {
    throw httpError(500, 'NO_JWT_SECRET', `${gameKeyUpper()}_JWT_SECRET 未配置`);
  }
  return secret;
}

async function handleLogin(req) {
  const body = req.body || {};
  const platform = String(body.platform || '').toLowerCase();
  if (!SUPPORTED_PLATFORMS.has(platform)) {
    throw httpError(400, 'BAD_PLATFORM', `unsupported platform: ${platform}`);
  }

  let platformUid = '';
  if (platform === 'wx') {
    const wxSession = await wxCode2Session(body.code);
    platformUid = wxSession.openid;
  } else if (platform === 'dy') {
    platformUid = await ttCode2Openid(body.code);
  } else if (platform === 'tap') {
    const id = String(body.taptapUserId || '').trim();
    if (!id) throw httpError(400, 'NO_TAP_ID', 'taptapUserId 缺失');
    platformUid = id;
  } else if (platform === 'anon') {
    const id = String(body.anonId || '').trim();
    if (!id) throw httpError(400, 'NO_ANON_ID', 'anonId 缺失');
    if (!/^[A-Za-z0-9_\-:.]{8,128}$/.test(id)) {
      throw httpError(400, 'BAD_ANON_ID', 'anonId 非法');
    }
    platformUid = id;
  }

  const userId = `${platform}:${platformUid}`;
  const ttlSec = getTtlSec();
  const gameKey = getGameKey();
  const now = Math.floor(Date.now() / 1000);
  const token = jwt.sign(
    { sub: userId, plt: platform, gk: gameKey, iat: now },
    getJwtSecret(),
    { expiresIn: ttlSec },
  );

  return {
    token,
    userId,
    platform,
    gameKey,
    expiresAt: (now + ttlSec) * 1000,
    ttlSec,
  };
}

function requireUser(req) {
  const authHeader = (req.headers && req.headers.authorization) || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw httpError(401, 'NO_TOKEN', '缺少 Authorization: Bearer <token>');

  let payload;
  try {
    payload = jwt.verify(match[1].trim(), getJwtSecret());
  } catch (error) {
    throw httpError(401, 'BAD_TOKEN', error && error.message ? error.message : 'token 无效');
  }

  const userId = payload && payload.sub;
  if (!userId || typeof userId !== 'string' || !userId.includes(':')) {
    throw httpError(401, 'BAD_TOKEN', 'token sub 非法');
  }

  const currentGameKey = getGameKey();
  if (payload.gk && payload.gk !== currentGameKey) {
    throw httpError(401, 'BAD_TOKEN', `token gameKey=${payload.gk} 与当前 GAME_KEY=${currentGameKey} 不匹配`);
  }

  return { userId, platform: payload.plt || userId.split(':')[0] };
}

async function wxCode2Session(code) {
  const appid = getPlatformCredential('wx', 'APPID');
  const secret = getPlatformCredential('wx', 'SECRET');
  if (!appid || !secret) throw httpError(500, 'NO_WX_CFG', `${gameKeyUpper()}_WX_APPID/${gameKeyUpper()}_WX_SECRET 未配置`);
  if (!code) throw httpError(400, 'NO_CODE', 'wx code 缺失');
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(appid)}&secret=${encodeURIComponent(secret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`;
  const data = await httpGetJson(url);
  if (!data || !data.openid) {
    throw httpError(401, 'WX_LOGIN_FAIL', `wx code2session 失败: ${JSON.stringify(data || {})}`);
  }
  return {
    openid: data.openid,
    session_key: typeof data.session_key === 'string' ? data.session_key : '',
  };
}

async function ttCode2Openid(code) {
  const appid = getPlatformCredential('tt', 'APPID');
  const secret = getPlatformCredential('tt', 'SECRET');
  if (!appid || !secret) throw httpError(500, 'NO_TT_CFG', `${gameKeyUpper()}_TT_APPID/${gameKeyUpper()}_TT_SECRET 未配置`);
  if (!code) throw httpError(400, 'NO_CODE', 'dy code 缺失');
  const data = await httpPostJson('https://developer.toutiao.com/api/apps/v2/jscode2session', { appid, secret, code });
  if (!data || data.err_no !== 0 || !data.data || !data.data.openid) {
    throw httpError(401, 'TT_LOGIN_FAIL', `dy code2session 失败: ${JSON.stringify(data || {})}`);
  }
  return data.data.openid;
}

function httpGetJson(url) {
  return httpRequestJson(url, 'GET');
}

function httpPostJson(url, body) {
  return httpRequestJson(url, 'POST', body);
}

function httpRequestJson(url, method, body) {
  if (typeof fetch !== 'function') {
    return Promise.reject(httpError(500, 'NO_FETCH', '当前 Node 运行时不支持 fetch，请使用 Node 18+'));
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts).then(async (res) => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      return { _raw: text };
    }
  });
}

module.exports = {
  handleLogin,
  requireUser,
};
