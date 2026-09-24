// Helpers shared by the API routes

const UA = 'Mozilla/5.0 (akko immersion player)';

// In-memory cache so we don't hammer the sites we fetch from. It's capped (least recently
// used goes first) so memory stays flat however long the server runs.
const MAX_BYTES = 150 * 1024 * 1024;
const MAX_ENTRIES = 500;
const cache = new Map();          // key -> {value, time, ttl, size}; Map order = least recently used first
let cacheBytes = 0;

// rough size in memory, measured once when stored
function sizeOf(value) {
  if (Buffer.isBuffer(value)) return value.length;
  if (typeof value === 'string') return value.length * 2;
  try { return JSON.stringify(value).length * 2; } catch { return 1024; }
}

function drop(key) {
  const hit = cache.get(key);
  if (!hit) return;
  cacheBytes -= hit.size;
  cache.delete(key);
}

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < hit.ttl) {
    cache.delete(key);             // move to the "recently used" end
    cache.set(key, hit);
    return hit.value;
  }
  if (hit) drop(key);             // expired
  const value = await fn();
  const size = sizeOf(value);
  if (size > MAX_BYTES / 4) return value;   // too big to be worth keeping
  drop(key);                      // in case a parallel request stored it meanwhile
  cache.set(key, { value, time: Date.now(), ttl: ttlMs, size });
  cacheBytes += size;
  for (const oldest of cache.keys()) {
    if (cacheBytes <= MAX_BYTES && cache.size <= MAX_ENTRIES) break;
    drop(oldest);
  }
  return value;
}

const cacheStats = () => ({ entries: cache.size, bytes: cacheBytes });

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return res.text();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Wrap an async route so a thrown error becomes a 502 with {error}
const asyncRoute = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(err.message);
  res.status(502).json({ error: err.message });
});

module.exports = { UA, cached, cacheStats, fetchText, fetchBuffer, asyncRoute };
