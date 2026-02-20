// core/state.js

export const State = {
  store: {},
  set(key, value) { this.store[key] = value; },
  get(key, fallback = null) { return this.store.hasOwnProperty(key) ? this.store[key] : fallback; }
};

export default State;
