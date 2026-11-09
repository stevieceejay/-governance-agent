import test from "node:test";
import assert from "node:assert/strict";
import { checkApproval, proposalDigest } from "../scripts/check-approval.mjs";

const body = [
  "Proposed full contents and diffs are reviewed below.",
  "~~~governance-record",
  JSON.stringify({
    record_version: 1,
    change_id: "ML-42",
    project: "stevieceejay/Move-Learner",
    baseline_sha: "a".repeat(40),
    files: [{ path: "docs/status.md", status: "modified", sha: "b".repeat(40) }],
    actions: [],
    approved_attention_at: "2026-11-10T00:00:00Z"
  }),
  "~~~",
  "Unified diff: ..."
].join("\n");
const approved = {
  user_id: 178048729,
  body: "APPROVE sha256:" + proposalDigest(body),
  created_at: "2026-11-09T00:00:00Z",
  updated_at: "2026-11-09T00:00:00Z"
};
const base = {
  proposal_body: body,
  repository_id: 1435048138,
  comments: [approved],
  base_sha: "a".repeat(40),
  actual_files: [{ filename: "docs/status.md", status: "modified", sha: "b".repeat(40) }],
  now: "2026-11-09T01:00:00Z"
};

test("exact owner approval and exact file result match", () => {
  assert.deepEqual(checkApproval(base).findings, []);
  assert.equal(checkApproval(base).state, "MATCHED");
});

test("missing, foreign, and edited approvals require attention", () => {
  for (const comments of [
    [],
    [{ ...approved, user_id: 99 }],
    [{ ...approved, updated_at: "2026-11-09T00:01:00Z" }]
  ]) {
    assert.ok(checkApproval({ ...base, comments }).findings.some(
      finding => finding.code === "APPROVAL_MISSING"
    ));
  }
});

test("changing the proposal invalidates its approval", () => {
  assert.ok(checkApproval({ ...base, proposal_body: body + "\nchanged" }).findings.some(
    finding => finding.code === "APPROVAL_MISSING"
  ));
});

test("extra paths, changed blobs, and changed baseline are reported", () => {
  const cases = [
    { actual_files: [...base.actual_files, { filename: "src/extra.ts", status: "added", sha: "c".repeat(40) }], code: "UNAPPROVED_FILE" },
    { actual_files: [{ ...base.actual_files[0], sha: "c".repeat(40) }], code: "APPROVED_FILE_MISMATCH" },
    { base_sha: "c".repeat(40), code: "BASELINE_CHANGED" }
  ];
  for (const item of cases) {
    const { code, ...change } = item;
    assert.ok(checkApproval({ ...base, ...change }).findings.some(
      finding => finding.code === code
    ));
  }
});

test("approved work with no linked change becomes unattended after the deadline", () => {
  const waiting = { ...base, actual_files: null };
  assert.equal(checkApproval(waiting).state, "WAITING");
  assert.ok(checkApproval({ ...waiting, now: "2026-11-10T00:00:00Z" }).findings.some(
    finding => finding.code === "APPROVED_UNATTENDED"
  ));
});

test("malformed proposals and untrusted project identity fail closed", () => {
  assert.equal(checkApproval({ ...base, now: "bad" }).findings[0].code, "INVALID_CLOCK");
  assert.equal(checkApproval({ ...base, proposal_body: "no record" }).findings[0].code, "INVALID_PROPOSAL");
  assert.ok(checkApproval({ ...base, repository_id: 1 }).findings.some(
    finding => finding.code === "UNTRUSTED_PROJECT"
  ));
});
