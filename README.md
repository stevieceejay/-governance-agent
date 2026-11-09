# Governance Agent

Status: planning and bootstrap only. No trigger, agent runtime, or notification is active.

This private repository will host a governance agent separate from Move Learner.
Move Learner is the first governed project and test case.

The agent will inspect GitHub change records and pull requests, report missing
or exceeded approvals, and ask the project owner for decisions. It will not
approve its own work, change project phases, edit governed code, or deploy.

Initial GitHub target: `stevieceejay/Move-Learner`.
Tracking issue: https://github.com/stevieceejay/Move-Learner/issues/1

Runtime, event hooks, approval matching, tests, GitHub App permissions, and
deployment require separate reviewed change sets and approvals.
