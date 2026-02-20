// core/data/document-store.js

import { Guards } from "../permissions/guards.js";

const KEY = "eden_documents_v500";

export const DocumentStore = {
  collections: {},

  init() {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    this.collections = raw ? JSON.parse(raw) : {};
  },

  save() {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(this.collections));
  },

  createCollection(name) {
    Guards.dataWrite();
    if (!this.collections[name]) {
      this.collections[name] = [];
      this.save();
    }
  },

  insert(collection, doc) {
    Guards.dataWrite();

    if (!this.collections[collection]) this.createCollection(collection);

    const record = {
      id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2)),
      ...doc,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.collections[collection].push(record);
    this.save();
    return record;
  },

  update(collection, id, updates) {
    Guards.dataWrite();

    const col = this.collections[collection];
    if (!col) return null;

    const doc = col.find(d => d.id === id);
    if (!doc) return null;

    Object.assign(doc, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return doc;
  },

  find(collection, filterFn = () => true) {
    Guards.dataRead();

    const col = this.collections[collection] || [];
    return col.filter(filterFn);
  },

  get(collection, id) {
    Guards.dataRead();

    const col = this.collections[collection] || [];
    return col.find(d => d.id === id) || null;
  },

  delete(collection, id) {
    Guards.dataWrite();

    if (!this.collections[collection]) return;
    this.collections[collection] = this.collections[collection].filter(d => d.id !== id);
    this.save();
  }
};
