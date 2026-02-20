// core/sync-api.js

import config from '../config.js';

const DEFAULT_BASE = 'https://edenfield-sync.example.com';
const BASE = (config && config.api && config.api.base_url) ? config.api.base_url.replace(/\/$/, '') : DEFAULT_BASE;

async function timedFetch(url, opts = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export const SyncAPI = {
  base: BASE,

  async push(action) {
    const url = `${this.base}/sync/push`;
    const res = await timedFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action)
    }, Number(process.env.SYNC_API_TIMEOUT_MS) || 10000);

    if (!res.ok) throw new Error(`Push failed: ${res.status}`);
    return res.json();
  },

  async pull() {
    const url = `${this.base}/sync/pull`;
    const res = await timedFetch(url, {}, Number(process.env.SYNC_API_TIMEOUT_MS) || 10000);
    if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
    return res.json();
  }
};
