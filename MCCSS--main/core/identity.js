// core/identity.js

const STORAGE_KEY = "eden_identity";

export const identity = {
  data: null,

  load() {
    try {
      const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      this.data = raw ? JSON.parse(raw) : null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to load identity", e);
      this.data = null;
    }
    return this.data;
  },

  save(profile) {
    this.data = profile;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("Failed to save identity", e);
    }
  },

  exists() {
    return this.data !== null;
  }
};
