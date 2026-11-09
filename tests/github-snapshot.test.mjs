import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePullRequest, fetchTrustedSnapshot } from "../scripts/github-snapshot.mjs";

const root = "/repos/stevieceejay/Move-Learner";
const sha = "a".repeat(40);
const fileSha = "b".repeat(40);
const issueBody = [
  "~~~governance-record",
  JSON.stringify({
    record_version: 1, change_id: "case-1",
    project: "stevieceejay/Move-Learner", baseline_sha: sha,
    files: [{ path: "README.md", status: "modified", sha: fileSha }],
    actions: [], approved_attention_at: "2027-01-01T00:00:00Z"
  }),
  "~~~"
].join("\n");

function api({ comments, files, changedFiles = files.length, repositoryId = 1435048138 }) {
  return {
    async get(path) {
      const page = Number(new URL("https://api.github.test" + path).searchParams.get("page") || 1);
      const plain = path.split("?")[0];
      if (plain === root) return { data: { id: repositoryId, full_name: "stevieceejay/Move-Learner" } };
      if (plain === root + "/issues/7") return { data: { body: issueBody } };
      if (plain === root + "/pulls/9") return {
        data: { base: { sha, repo: { id: repositoryId } }, changed_files: changedFiles }
      };
      if (plain.endsWith("/comments") || plain.endsWith("/files")) {
        const source = plain.endsWith("/comments") ? comments : files;
        const slice = source.slice((page - 1) * 100, page * 100);
        const more = page * 100 < source.length;
        return { data: slice, headers: new Headers(more ? { link: '<next>; rel="next"' } : {}) };
      }
      throw new Error("Unexpected path " + path);
    }
  };
}

test("fetches every comment page and matches the approved PR file", async () => {
  const { proposalDigest } = await import("../scripts/check-approval.mjs");
  const comments = Array.from({ length: 100 }, () => ({
    user: { id: 1 }, body: "discussion", created_at: "x", updated_at: "x"
  }));
  comments.push({
    user: { id: 178048729 },
    body: "APPROVE sha256:" + proposalDigest(issueBody),
    created_at: "2026-11-08T00:00:00Z",
    updated_at: "2026-11-08T00:00:00Z"
  });
  const result = await evaluatePullRequest(api({
    comments, files: [{ filename: "README.md", status: "modified", sha: fileSha }]
  }), {
    project: "stevieceejay/Move-Learner", issueNumber: 7, prNumber: 9,
    now: "2026-11-09T00:00:00Z"
  });
  assert.equal(result.state, "MATCHED");
});

test("rejects an incomplete pull request file list", async () => {
  const result = await evaluatePullRequest(api({
    comments: [], files: [{ filename: "README.md", status: "modified", sha: fileSha }],
    changedFiles: 2
  }), {
    project: "stevieceejay/Move-Learner", issueNumber: 7, prNumber: 9,
    now: "2026-11-09T00:00:00Z"
  });
  assert.deepEqual(result.findings.map(finding => finding.code), ["PROVIDER_EVIDENCE_INCOMPLETE"]);
});

test("rejects the GitHub 3000-file response cap", async () => {
  const result = await evaluatePullRequest(api({
    comments: [], files: [], changedFiles: 3000
  }), {
    project: "stevieceejay/Move-Learner", issueNumber: 7, prNumber: 9,
    now: "2026-11-09T00:00:00Z"
  });
  assert.equal(result.state, "ATTENTION");
});

test("rejects an untrusted repository identity", async () => {
  await assert.rejects(fetchTrustedSnapshot({
    get: async () => ({ data: { id: 99, full_name: "other/repo" } })
  }, {
    project: "stevieceejay/Move-Learner", issueNumber: 7, prNumber: 9,
    now: "2026-11-09T00:00:00Z"
  }), /identity mismatch/);
});
