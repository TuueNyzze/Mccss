// core/sync-queue.js

import { Guards } from "./permissions/guards.js";

const QUEUE_KEY = "eden_sync_queue_v500";

export const SyncQueue = {
  items: [],

  load() {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(QUEUE_KEY) : null;
    this.items = raw ? JSON.parse(raw) : [];
  },

  save() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(QUEUE_KEY, JSON.stringify(this.items));
  },

  add(action) {
    Guards.syncQueue();

    this.items.push({
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
      action,
      status: "pending",
      attempts: 0,
      createdAt: new Date().toISOString()
    });
    this.save();
  },

  next() {
    return this.items.find(i => i.status === "pending");
  },

  markSuccess(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
  },

  markFailure(id) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;
    item.attempts++;
    item.status = "failed";
    this.save();
  }
};

SyncQueue.load();
