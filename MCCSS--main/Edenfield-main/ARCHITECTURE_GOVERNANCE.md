**Architecture & Governance Checklist**

- **System Name**: Eden Field
- **Config Source**: `config.js` (exported ESM)
- **Secrets**: Use Vault (`VAULT_ADDR`, `VAULT_TOKEN`) or env `JWT_SECRET` for local dev
- **Audit trail**: `core/governance.auditLog()` appends daily logs to `audit_logs/`
- **Retention**: `config.audit.retentionDays` enforced by periodic job
- **Encryption**: `config.encryption.algorithm` expected AES-256-GCM
- **CI**: Lint + unit runner + seed step in `.github/workflows/ci.yml`
- **Dependency updates**: Dependabot configured in `.github/dependabot.yml`
- **Runtime**: `server.js` boots TaskEngine and scheduled sync task
- **Data**: Synthetic dataset at `data/synthetic_dataset.json`

Governance actions:
- Ensure `AUDIT_DIR` is backed by secure storage with access controls.
- Rotate keys per `config.encryption.keyRotationDays` and ensure `VAULT` stores keys.
- Run `npm audit` regularly and block PRs with critical vulnerabilities.
- Add SCA scanning and secret scanning in CI.
