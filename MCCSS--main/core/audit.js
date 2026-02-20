// core/audit.js
import governance from './governance.js';

export const Audit = {
  record(action, details = {}) {
    governance.auditLog({ type: 'action', action, details });
  }
};

export default Audit;
