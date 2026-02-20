# Outcome Expectations — Demo Cockpit (DOD Prototype)

- Purpose: Demonstrate substrate readiness, task engine behavior, and audit trail in a 5-minute walkthrough.
- Key outcomes:
  - Readiness score computed and visible in cockpit (>= 70 desirable)
  - Task engine schedules & runs background sync task(s)
  - Offline mode runs using `data/synthetic_dataset.json` with no external dependencies
  - Audit entries created for incoming requests

### Demonstrable flow (5 minutes)
1. Start server in demo mode (one command)
2. Open `/cockpit` — show readiness and tasks
3. Trigger a task (via API) and show it executed via cockpit or logs
4. Show audit log file and explain retention policy

### Scalability note
This prototype includes a governance checklist and CI; scaling to $1B target involves operationalizing secure key management, hardened multi-region deployment, and formal accreditation.
