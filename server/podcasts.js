// Podcast feeds + transcripts: GET /api/podcasts/fetch?url=  -> the text at that url
//
// Browsers can't read most RSS feeds directly (no CORS), so the server fetches them.
// Only public http(s) addresses: no localhost / private networks (checked on every
// redirect too), 15 MB max, 15 s timeout.

const express = require('express');
const dns = require('dns').promises;
const net = require('net');
const { UA, cached, asyncRoute } = require('./http');

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublic(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error('not a valid address'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('only http(s) addresses');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivateIp)) throw new Error('that address is not allowed');
  return u;
}

async function fetchPublicText(url) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(current);
    const res = await fetch(current, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).href;
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} from ${new URL(current).hostname}`);
    if (Number(res.headers.get('content-length')) > MAX_BYTES) throw new Error('file too big');

    // read with a size cap
    const chunks = [];
    let size = 0;
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_BYTES) throw new Error('file too big');
      chunks.push(chunk);
    }
    return { text: Buffer.concat(chunks).toString('utf8'), type: res.headers.get('content-type') || '' };
  }
  throw new Error('too many redirects');
}

const router = express.Router();

router.get('/fetch', asyncRoute(async (req, res) => {
  const url = String(req.query.url || '');
  const { text, type } = await cached('pod:' + url, 20 * 60e3, () => fetchPublicText(url));
  res.json({ text, type });
}));

module.exports = { router };
