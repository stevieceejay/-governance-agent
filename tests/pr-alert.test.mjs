import test from "node:test";
import assert from "node:assert/strict";
import { handlePullRequest } from "../scripts/pr-alert.mjs";
import { proposalDigest } from "../scripts/check-approval.mjs";

const project = "stevieceejay/Move-Learner";
const root = "/repos/" + project;
const baseline = "a".repeat(40);
const fileSha = "b".repeat(40);
const proposalBody = [
  "~~~governance-record",
  JSON.stringify({
    record_version: 1, change_id: "case-1", project,
    baseline_sha: baseline,
    files: [{ path: "README.md", status: "modified", sha: fileSha }],
    actions: [], approved_attention_at: "2027-01-01T00:00:00Z"
  }),
  "~~~"
].join("\n");

function fixture({ linked = true, approved = false, repositoryId = 1435048138 } = {}) {
  const posted = [];
  const approval = {
    user: { id: 178048729 },
    body: "APPROVE sha256:" + proposalDigest(proposalBody),
    created_at: "2026-11-09T00:00:00Z",
    updated_at: "2026-11-09T00:00:00Z"
  };
  const ctx = {
    repository: { id: repositoryId, fullName: project },
    github: {
      async request({ method, path }) {
        assert.equal(method, "GET");
        const plain = path.split("?")[0];
        if (plain === root) return { body: { id: repositoryId, full_name: project } };
        if (plain === root + "/pulls/9") return { body: {
          body: linked ? "Governance-Issue: #7" : "No proposal link",
          head: { sha: "c".repeat(40) },
          base: { sha: baseline, repo: { id: repositoryId } },
          changed_files: 1
        } };
        if (plain === root + "/issues/7") return { body: { body: proposalBody } };
        if (plain === root + "/issues/7/comments") return { body: approved ? [approval] : [] };
        if (plain === root + "/pulls/9/files") return { body: [
          { filename: "README.md", status: "modified", sha: fileSha }
        ] };
        if (plain === root + "/issues/9/comments") return { body: posted.map(body => ({ body })) };
        throw new Error("Unexpected path " + path);
      }
    },
    thread: { async post(message) { posted.push(message); } }
  };
  return { ctx, posted };
}

const event = { action: "opened", pullRequestNumber: 9 };

test("alerts the owner when a PR lacks approval", async () => {
  const { ctx, posted } = fixture();
  await handlePullRequest(ctx, event);
  assert.equal(posted.length, 1);
  assert.match(posted[0], /@stevieceejay/);
  assert.match(posted[0], /APPROVAL_MISSING/);
  assert.match(posted[0], /Proposal: #7/);
});

test("alerts once for a PR with no proposal link", async () => {
  const { ctx, posted } = fixture({ linked: false });
  await handlePullRequest(ctx, event);
  await handlePullRequest(ctx, { ...event, action: "edited" });
  assert.equal(posted.length, 1);
  assert.match(posted[0], /PROPOSAL_LINK_MISSING/);
});

test("stays silent when the GitHub approval and file result match", async () => {
  const { ctx, posted } = fixture({ approved: true });
  await handlePullRequest(ctx, event);
  assert.equal(posted.length, 0);
});

test("ignores another repository and unhandled events", async () => {
  const { ctx, posted } = fixture({ repositoryId: 1 });
  await handlePullRequest(ctx, event);
  assert.equal(posted.length, 0);
  const trusted = fixture();
  await handlePullRequest(trusted.ctx, { ...event, action: "closed" });
  assert.equal(trusted.posted.length, 0);
});
