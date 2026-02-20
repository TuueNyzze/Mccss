# Success Criteria — Demo Cockpit

- API endpoints return expected responses for `GET /health`, `GET /metrics`, `GET /api/v1/demo/readiness`, and `GET/POST /api/v1/tasks`.
- Cockpit UI loads within 5 seconds and displays readiness score and task list.
- Demonstrate offline behavior by unplugging network and showing cockpit still works using synthetic dataset.
- Audit entries are written to `audit_logs/` and retention enforcement runs periodically.
- CI pipeline runs lint and unit runner successfully on push.

Pass/Fail: evaluator can follow the 5-step walkthrough in `docs/outcome_expectations.md` within 5 minutes and observe the readiness score and a task execution.
