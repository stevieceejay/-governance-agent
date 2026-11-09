import { createHash } from "node:crypto";
import { evaluatePullRequest } from "./github-snapshot.mjs";

const PROJECT = "stevieceejay/Move-Learner";
const REPOSITORY_ID = 1435048138;
const OWNER = "stevieceejay";
const actions = new Set(["opened", "reopened", "synchronize", "edited", "ready_for_review"]);

function apiFor(github) {
  return {
    async get(path) {
      const response = await github.request({ method: "GET", path });
      const data = response.body;
      // The channel's request helper omits response headers. A full page
      // prompts one more request; an empty page ends pagination.
      const next = Array.isArray(data) && data.length === 100;
      return {
        data,
        headers: { get: name => name === "link" && next ? '<next>; rel="next"' : null }
      };
    }
  };
}

function issueNumber(body) {
  const matches = [...body.matchAll(/^Governance-Issue:\s*#([1-9][0-9]*)\s*$/gm)];
  if (matches.length !== 1) return null;
  const value = Number(matches[0][1]);
  return Number.isSafeInteger(value) ? value : null;
}

async function hasAlert(api, root, prNumber, marker) {
  for (let page = 1; page <= 10; page++) {
    const response = await api.get(root + "/issues/" + prNumber + "/comments?per_page=100&page=" + page);
    if (!Array.isArray(response.data)) throw new Error("Incomplete PR comments");
    if (response.data.some(comment => typeof comment.body === "string" &&
        comment.body.includes(marker))) return true;
    if (response.data.length < 100) return false;
  }
  throw new Error("PR comment pagination limit reached");
}

export async function handlePullRequest(ctx, pr) {
  if (ctx.repository.id !== REPOSITORY_ID ||
      ctx.repository.fullName !== PROJECT ||
      !actions.has(pr.action)) return;

  const root = "/repos/" + PROJECT;
  const number = pr.pullRequestNumber;
  if (!Number.isSafeInteger(number) || number < 1) return;
  const api = apiFor(ctx.github);
  const current = (await api.get(root + "/pulls/" + number)).data;
  if (typeof current?.body !== "string" || typeof current?.head?.sha !== "string") {
    throw new Error("Current pull request metadata is incomplete");
  }
  const proposal = issueNumber(current.body);
  const result = proposal === null
    ? { state: "ATTENTION", findings: [{ code: "PROPOSAL_LINK_MISSING" }] }
    : await evaluatePullRequest(api, {
        project: PROJECT, issueNumber: proposal, prNumber: number,
        now: new Date().toISOString()
      });
  if (result.state !== "ATTENTION") return;

  const fingerprint = createHash("sha256").update(JSON.stringify({
    number, head: current.head.sha, proposal,
    proposalDigest: result.proposal_sha256 ?? null,
    findings: result.findings.map(finding => finding.code)
  })).digest("hex");
  const marker = "<!-- governance-alert:" + fingerprint + " -->";
  if (await hasAlert(api, root, number, marker)) return;

  const codes = result.findings.map(finding => "- " + finding.code).join("\n");
  const link = proposal === null ? "No unique `Governance-Issue: #N` line in the PR body."
    : "Proposal: #" + proposal + ".";
  await ctx.thread.post(
    "@"+OWNER+" Governance attention on PR #" + number + ".\n\n" +
    link + "\n\n" + codes + "\n\n" +
    "Please review the proposal, approval, and changed files. This alert does not grant approval.\n\n" +
    marker
  );
}
