const DEFAULT_GAME_KEY = 'petTower';
const DEFAULT_TTL_SEC = 7 * 24 * 3600;
const DEFAULT_MAX_BYTES = 256 * 1024;

function getGameKey() {
  const v = String(process.env.GAME_KEY || '').trim().toLowerCase();
  if (!v) return DEFAULT_GAME_KEY;
  if (!/^[a-z][a-z0-9_\-]{0,31}$/.test(v)) {
    throw new Error(`非法 GAME_KEY: ${v}`);
  }
  return v;
}

function gameKeyUpper() {
  return getGameKey().toUpperCase().replace(/[^A-Z0-9]/g, '_');
}

function readEnvPrefer(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== null && String(value).length > 0) {
      return String(value);
    }
  }
  return '';
}

function getCollectionName(suffix) {
  const overrideKey = `${gameKeyUpper()}_${suffix.toUpperCase()}_COLLECTION`;
  const override = process.env[overrideKey];
  if (override) {
    return String(override);
  }
  return `${getGameKey()}_${suffix}`;
}

function getJwtSecret() {
  return readEnvPrefer(`${gameKeyUpper()}_JWT_SECRET`);
}

function getTtlSec() {
  const raw = readEnvPrefer(`${gameKeyUpper()}_TOKEN_TTL_SEC`);
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_TTL_SEC;
}

function getMaxBytes() {
  const raw = readEnvPrefer(`${gameKeyUpper()}_SAVE_MAX_BYTES`);
  const v = Number(raw);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_MAX_BYTES;
}

function getPlatformCredential(platform, field) {
  const upper = gameKeyUpper();
  const platformUpper = platform.toUpperCase();
  return readEnvPrefer(`${upper}_${platformUpper}_${field}`);
}

module.exports = {
  getGameKey,
  gameKeyUpper,
  getCollectionName,
  getJwtSecret,
  getTtlSec,
  getMaxBytes,
  getPlatformCredential,
};
