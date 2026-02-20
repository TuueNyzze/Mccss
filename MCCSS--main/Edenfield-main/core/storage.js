// core/storage.js

import config from '../config.js';

const DEFAULT_PREFIX = 'eden_storage_';
const PREFIX = (config && config.storage && config.storage.prefix) || DEFAULT_PREFIX;

// In Node (server) environments localStorage is not available; provide an in-memory fallback
const isBrowser = typeof localStorage !== 'undefined' && typeof window !== 'undefined';
const memoryStore = new Map();

export const storage = {
  set(key, value) {
    const full = PREFIX + key;
    try {
      if (isBrowser) {
        localStorage.setItem(full, JSON.stringify(value));
      } else {
        memoryStore.set(full, JSON.stringify(value));
      }
    } catch (e) {
      // avoid throwing in production code; log for diagnostics
      // eslint-disable-next-line no-console
      console.error('Storage set failed', e);
    }
  },

  get(key, fallback = null) {
    const full = PREFIX + key;
    try {
      if (isBrowser) {
        const raw = localStorage.getItem(full);
        return raw ? JSON.parse(raw) : fallback;
      } else {
        const raw = memoryStore.get(full);
        return raw ? JSON.parse(raw) : fallback;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Storage get failed', e);
      return fallback;
    }
  },

  remove(key) {
    const full = PREFIX + key;
    try {
      if (isBrowser) {
        localStorage.removeItem(full);
      } else {
        memoryStore.delete(full);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Storage remove failed', e);
    }
  }
};
