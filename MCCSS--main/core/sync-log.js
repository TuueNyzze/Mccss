// core/sync-log.js

const KEY = 'eden_sync_log_v500';
const isBrowser = typeof localStorage !== 'undefined';
const memory = [];

export const SyncLog = {
  add(entry) {
    const rec = { time: new Date().toISOString(), ...entry };
    if (isBrowser) {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      arr.push(rec);
      localStorage.setItem(KEY, JSON.stringify(arr));
    } else {
      memory.push(rec);
    }
  },

  list() {
    if (isBrowser) {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    }
    return memory.slice();
  }
};
