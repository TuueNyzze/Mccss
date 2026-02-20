// core/data/import.js

import { DocumentStore } from "../data/document-store.js";
import { TableStore } from "../data/table-store.js";
import { Guards } from "../permissions/guards.js";

export const DataImport = {
  load(payload) {
    Guards.dataAll();

    if (payload.documents) {
      DocumentStore.collections = payload.documents;
      DocumentStore.save();
    }

    if (payload.tables) {
      TableStore.tables = payload.tables;
      TableStore.save();
    }

    return true;
  }
};
