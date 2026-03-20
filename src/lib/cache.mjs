/**
 * In-memory cache voi TTL va gioi han nho de tranh tang vo han.
 */

const store = new Map();
const MAX_ENTRIES = 200;

function cleanupExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (!entry || now > entry.expiresAt) {
      store.delete(key);
    }
  }
}

function evictOldestEntries() {
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    store.delete(oldestKey);
  }
}

export function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }

  return entry.value;
}

export function cacheSet(key, value, ttlSeconds = 300) {
  cleanupExpiredEntries();
  store.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000
  });
  evictOldestEntries();
}

export function cacheDelete(key) {
  store.delete(key);
}

export function cacheClear() {
  store.clear();
}

export function cacheSize() {
  cleanupExpiredEntries();
  return store.size;
}
