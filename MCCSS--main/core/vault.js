// core/vault.js
// Best-effort Vault client with timeout, retries, and simple caching. Returns null on failure.

const cache = new Map();

async function getFetch() {
  if (typeof fetch !== 'undefined') return fetch.bind(globalThis);
  try {
    const mod = await import('node-fetch');
    return mod.default || mod;
  } catch (e) {
    throw new Error('fetch unavailable');
  }
}

async function timedFetch(url, opts = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const f = await getFetch();
    const res = await f(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function fetchSecretFromVault(path, key) {
  const VAULT_ADDR = process.env.VAULT_ADDR;
  const VAULT_TOKEN = process.env.VAULT_TOKEN;
  if (!VAULT_ADDR || !VAULT_TOKEN) return null; // graceful when not configured

  const cacheKey = `${VAULT_ADDR}/${path}/${key}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const url = `${VAULT_ADDR.replace(/\/$/, '')}/v1/${path}`;
  const headers = { 'X-Vault-Token': VAULT_TOKEN, 'Accept': 'application/json' };

  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await timedFetch(url, { headers }, Number(process.env.VAULT_TIMEOUT_MS) || 5000);
      if (!res.ok) {
        // non-200, try again on 5xx
        if (res.status >= 500 && i < attempts - 1) continue;
        return null;
      }
      const body = await res.json();
      const val = body && body.data && (body.data[key] || body.data);
      // cache for short period
      cache.set(cacheKey, val);
      setTimeout(() => cache.delete(cacheKey), Number(process.env.VAULT_CACHE_MS) || 60_000);
      return val;
    } catch (e) {
      if (i === attempts - 1) return null;
      // wait a bit before retry
      await new Promise(r => setTimeout(r, 200 * (i + 1)));
    }
  }

  return null;
}
