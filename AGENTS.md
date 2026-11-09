# Governance Agent repository rules

- This repository is separate from every governed project.
- Before creating or changing files, present complete new-file contents or
  unified diffs, purpose, dependencies, risks, and validation.
- Obtain explicit approval naming the exact change set before applying it.
- Obtain separate approval before dependency installation, generated files,
  Git configuration changes, service provisioning, GitHub App access, or deployment.
- Show exact paths and obtain approval before staging, committing, or pushing.
- The governance agent may inspect and report. It may not approve its own
  proposals, grant access, change a governed project's phase, or treat silence
  as approval.
- Record approval identity, proposal reference, timestamp, allowed paths and
  actions, and execution evidence. A material revision needs fresh approval.
- Never read, request, display, or commit credentials or secret file contents.
- Use filename and Git metadata checks for secret protection.
- Keep synthetic checks distinct from live-provider and deployment evidence.
