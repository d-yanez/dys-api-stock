import { timingSafeEqual } from 'node:crypto';

import logger from '../config/logger.js';
import { API_KEY } from '../config/index.js';

// Temporary dual-key support for credential rotation (S3: "dual-key migration
// without downtime"). The previous key stays valid here only until every known
// consumer has been migrated; remove the environment variable afterwards.
export const SECONDARY_API_KEY_ENV = 'API_KEY_SECONDARY';

function isConfiguredKey(candidate) {
  return typeof candidate === 'string' && candidate.trim() !== '';
}

export function resolveAcceptedApiKeys({ primaryKey, secondaryKey } = {}) {
  // The primary key is authoritative: when it is missing or blank the service
  // fails closed, even if a secondary key is still configured. The secondary
  // key is only considered while the primary key is configured.
  if (!isConfiguredKey(primaryKey)) {
    return [];
  }

  return [primaryKey, secondaryKey].filter(isConfiguredKey);
}

// Constant-time comparison for variable-length secrets. timingSafeEqual only
// accepts equal-length buffers, so the byte length is checked first and a
// mismatch is rejected without reading, logging, or echoing the values. Byte
// lengths (not string lengths) are used so multi-byte keys cannot throw.
export function credentialsMatch(presentedKey, acceptedKey) {
  if (typeof presentedKey !== 'string' || typeof acceptedKey !== 'string') {
    return false;
  }

  const presented = Buffer.from(presentedKey, 'utf8');
  const accepted = Buffer.from(acceptedKey, 'utf8');

  if (presented.length !== accepted.length) {
    return false;
  }

  return timingSafeEqual(presented, accepted);
}

function isAcceptedKey(presentedKey, acceptedKeys) {
  let matched = false;

  // Check every configured key so the response does not reveal which slot
  // matched, and never short-circuit on the first hit.
  for (const acceptedKey of acceptedKeys) {
    if (credentialsMatch(presentedKey, acceptedKey)) {
      matched = true;
    }
  }

  return matched;
}

export default function apiKeyAuth(req, res, next) {
  const incomingKey = req.header('x-api-key');
  const acceptedKeys = resolveAcceptedApiKeys({
    primaryKey: API_KEY,
    secondaryKey: process.env[SECONDARY_API_KEY_ENV]
  });

  if (!incomingKey) {
    logger.warn('API key missing', {
      location: 'apiKeyAuth',
      ip: req.ip,
      path: req.originalUrl
    });
    return res.status(401).json({ error: 'API key missing' });
  }

  // Never log the presented credential material, not even when it is rejected.
  if (!isAcceptedKey(incomingKey, acceptedKeys)) {
    logger.warn('API key invalid', {
      location: 'apiKeyAuth',
      ip: req.ip,
      path: req.originalUrl
    });
    return res.status(403).json({ error: 'API key invalid' });
  }

  next();
}
