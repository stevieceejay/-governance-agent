import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const policies = JSON.parse(
  readFileSync(new URL("../config/projects.json", import.meta.url), "utf8")
);
const hex = value => typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value);
const pathOK = value =>
  typeof value === "string" && value.length > 0 &&
  !value.startsWith("/") && !value.includes("\\") &&
  !value.split("/").some(part => part === "" || part === "." || part === "..");
const statuses = new Set(["added", "modified", "removed", "renamed"]);

export function proposalDigest(body) {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

function parseRecord(body) {
  const blocks = [...body.matchAll(/~~~governance-record\r?\n([\s\S]*?)\r?\n~~~/g)];
  if (blocks.length !== 1) throw new Error("Expected one governance-record block");
  const record = JSON.parse(blocks[0][1]);
  if (record.record_version !== 1 || typeof record.change_id !== "string" ||
      !record.change_id || typeof record.project !== "string" ||
      !hex(record.baseline_sha) || !Array.isArray(record.files) ||
      !Array.isArray(record.actions) || !record.files.length ||
      !Number.isFinite(Date.parse(record.approved_attention_at))) {
    throw new Error("Invalid change record");
  }
  const seen = new Set();
  for (const file of record.files) {
    if (!pathOK(file.path) || !statuses.has(file.status) ||
        (file.status !== "removed" && !hex(file.sha)) ||
        (file.status === "removed" && file.sha !== null) ||
        (file.status === "renamed" && !pathOK(file.previous_filename)) ||
        seen.has(file.path)) {
      throw new Error("Invalid or duplicate file entry");
    }
    seen.add(file.path);
  }
  if (!record.actions.every(action => typeof action === "string" && action.length)) {
    throw new Error("Invalid action entry");
  }
  return record;
}

export function checkApproval(input) {
  const findings = [];
  if (!Number.isFinite(Date.parse(input.now))) {
    return { state: "ATTENTION", findings: [{ code: "INVALID_CLOCK" }] };
  }
  let record;
  try {
    if (typeof input.proposal_body !== "string") throw new Error("Missing proposal body");
    record = parseRecord(input.proposal_body);
  } catch (error) {
    return { state: "ATTENTION", findings: [{ code: "INVALID_PROPOSAL", detail: String(error.message) }] };
  }
  const digest = proposalDigest(input.proposal_body);
  const policy = policies[record.project];
  if (!policy || input.repository_id !== policy.repository_id) {
    findings.push({ code: "UNTRUSTED_PROJECT" });
  }
  const approvalText = "APPROVE sha256:" + digest;
  const approved = Array.isArray(input.comments) && input.comments.some(comment =>
    policy?.approver_user_ids.includes(comment.user_id) &&
    comment.body === approvalText &&
    comment.created_at === comment.updated_at
  );
  if (!approved) findings.push({ code: "APPROVAL_MISSING" });
  if (record.actions.length) findings.push({ code: "ACTIONS_REQUIRE_SEPARATE_EVIDENCE" });

  if (input.actual_files == null) {
    if (approved && Date.parse(input.now) >= Date.parse(record.approved_attention_at)) {
      findings.push({ code: "APPROVED_UNATTENDED" });
    }
    return {
      state: findings.length ? "ATTENTION" : "WAITING",
      change_id: record.change_id,
      proposal_sha256: digest,
      findings
    };
  }
  if (!Array.isArray(input.actual_files)) {
    findings.push({ code: "INVALID_ACTUAL_FILES" });
  } else {
    if (input.base_sha !== record.baseline_sha) {
      findings.push({ code: "BASELINE_CHANGED" });
    }
    const actual = new Map();
    for (const file of input.actual_files) {
      if (!pathOK(file.filename) || actual.has(file.filename)) {
        findings.push({ code: "INVALID_ACTUAL_FILE", path: file.filename });
      } else {
        actual.set(file.filename, file);
      }
    }
    for (const expected of record.files) {
      const file = actual.get(expected.path);
      if (!file) {
        findings.push({ code: "APPROVED_FILE_MISSING", path: expected.path });
        continue;
      }
      actual.delete(expected.path);
      if (file.status !== expected.status ||
          (expected.status !== "removed" && file.sha !== expected.sha) ||
          (expected.status === "renamed" &&
           file.previous_filename !== expected.previous_filename)) {
        findings.push({ code: "APPROVED_FILE_MISMATCH", path: expected.path });
      }
    }
    for (const path of actual.keys()) {
      findings.push({ code: "UNAPPROVED_FILE", path });
    }
  }
  return {
    state: findings.length ? "ATTENTION" : "MATCHED",
    change_id: record.change_id,
    proposal_sha256: digest,
    findings
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, file] = process.argv.slice(2);
  if (!file || !["digest", "check"].includes(mode)) {
    throw new Error("Use: node scripts/check-approval.mjs digest|check <json-or-text-file>");
  }
  const data = readFileSync(file, "utf8");
  process.stdout.write(
    mode === "digest" ? proposalDigest(data) + "\n" :
    JSON.stringify(checkApproval(JSON.parse(data)), null, 2) + "\n"
  );
}
