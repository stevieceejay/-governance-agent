# Governance Agent

Status: checker and event-trigger code prepared. No trigger or notification is active.

This private repository will host a governance agent separate from Move Learner.
Move Learner is the first governed project and test case.

The agent will inspect GitHub change records and pull requests, report missing
or exceeded approvals, and ask the project owner for decisions. It will not
approve its own work, change project phases, edit governed code, or deploy.

Initial GitHub target: `stevieceejay/Move-Learner`.
Tracking issue: https://github.com/stevieceejay/Move-Learner/issues/1

The approval checker and GitHub evidence adapter have synthetic tests. The
pull-request event hook is proposed for offline testing. Package installation,
GitHub App access, and deployment require separate approvals.
